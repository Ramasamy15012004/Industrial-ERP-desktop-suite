from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from datetime import datetime, timezone, timedelta
import os
import math
from typing import Any, List, Optional, Tuple

from models import AppLicense, UserActivityLog, StockMaintenance, User
from sqlalchemy import text
from generic_utils import (
    normalize_ci_text, 
    is_generic_purchase_article, 
    count_part_name_difference,
    normalize_part_article_key,
    ist_datetime,
    ist_now,
    hash_password
)

def seed_default_users(db: Session):
    """Creates the 4 default roles (admin, production, inventory, audit) if the users table is empty."""
    user_count = db.query(User).count()
    if user_count > 0:
        return # Already seeded

    now = ist_now()
    users_to_seed = [
        {"username": "admin", "full_name": "Administrator", "role": "admin", "password": "admin"},
        {"username": "production", "full_name": "Production Manager", "role": "production", "password": "production"},
        {"username": "inventory", "full_name": "Inventory Manager", "role": "inventory", "password": "inventory"},
        {"username": "audit", "full_name": "Auditor", "role": "audit", "password": "audit"},
    ]

    for u in users_to_seed:
        hashed = hash_password(u["password"])
        new_user = User(
            username=u["username"],
            full_name=u["full_name"],
            role=u["role"],
            password_hash=hashed,
            is_active=1,
            created_at=now,
            updated_at=now
        )
        db.add(new_user)
    db.commit()

def log_user_activity(db: Session, user: dict, activity_type: str, details: str = ""):
    log_entry = UserActivityLog(
        user_id=user["id"],
        username=user["username"],
        full_name=user.get("full_name"),
        role=user.get("role"),
        activity_type=activity_type,
        details=details,
        performed_at=ist_datetime()
    )
    db.add(log_entry)
    db.commit()

def _coerce_utc_naive(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)

def get_trial_info(db: Session) -> dict | None:
    return {
        "trial_days_total": 9999,
        "remaining_days": 9999,
        "created_at": "2026-01-01 00:00:00",
        "expiry_at": "2050-01-01 00:00:00",
        "expiry_date": "2050-01-01",
        "expiry_date_human": "Unlimited (Demo Model)",
        "expired": False,
    }

def is_trial_valid(db: Session) -> bool:
    return True

def select_stock_row_by_article(db: Session, article_number: Any, make: Any = "", part_name: Any = ""):
    normalized_article = normalize_ci_text(article_number)
    if not normalized_article:
        return None

    candidates = db.query(StockMaintenance).filter(
        func.lower(func.trim(func.coalesce(StockMaintenance.article_number, ''))) == normalized_article,
        func.coalesce(StockMaintenance.status, 'active') == 'active'
    ).order_by(StockMaintenance.id.asc()).all()

    if not candidates:
        return None

    normalized_part_name = normalize_ci_text(part_name)
    normalized_make = normalize_ci_text(make)

    if is_generic_purchase_article(article_number):
        filtered_candidates = candidates

        if normalized_make:
            make_matches = [c for c in filtered_candidates if normalize_ci_text(c.make) == normalized_make]
            if make_matches:
                filtered_candidates = make_matches

        if normalized_part_name:
            part_matches = [
                c for c in filtered_candidates
                if count_part_name_difference(c.part_name, normalized_part_name) <= 1
            ]
            if not part_matches:
                return None
            filtered_candidates = part_matches

        return filtered_candidates[0] if filtered_candidates else None

    if normalized_make:
        for c in candidates:
            if normalize_ci_text(c.make) == normalized_make:
                return c

    return candidates[0]

def get_fixture_stock_rows(
    db: Session,
    *,
    part_name: Any,
    article_number: Any,
    preferred_make: Any = "",
) -> List[StockMaintenance]:
    norm_part, norm_article = normalize_part_article_key(part_name, article_number)
    
    rows = db.query(StockMaintenance).filter(
        func.lower(func.trim(func.coalesce(StockMaintenance.part_name, ''))) == norm_part,
        func.lower(func.trim(func.coalesce(StockMaintenance.article_number, ''))) == norm_article,
        func.coalesce(StockMaintenance.status, 'active') == 'active'
    ).order_by(StockMaintenance.id.asc()).all()

    normalized_make = normalize_ci_text(preferred_make)
    if normalized_make:
        rows.sort(key=lambda r: (0 if normalize_ci_text(r.make) == normalized_make else 1, r.id))

    return rows

def get_fixture_stock_summary(
    db: Session,
    *,
    part_name: Any,
    article_number: Any,
    preferred_make: Any = "",
) -> Tuple[List[StockMaintenance], float, float]:
    stock_rows = get_fixture_stock_rows(
        db,
        part_name=part_name,
        article_number=article_number,
        preferred_make=preferred_make,
    )
    total_qty = sum(float(r.qty or 0) for r in stock_rows)
    total_reserved = sum(float(r.reserved_qty or 0) for r in stock_rows)
    free_qty = max(total_qty - total_reserved, 0.0)
    return stock_rows, total_qty, free_qty

def reserve_fixture_stock(
    db: Session,
    *,
    part_name: Any,
    article_number: Any,
    preferred_make: Any = "",
    required_qty: float,
) -> Tuple[float, float, float]:
    stock_rows, total_qty, free_qty = get_fixture_stock_summary(
        db,
        part_name=part_name,
        article_number=article_number,
        preferred_make=preferred_make,
    )
    remaining_qty = float(required_qty or 0)
    reserved_now_total = 0.0

    for row in stock_rows:
        row_free_qty = max(float(row.qty or 0) - float(row.reserved_qty or 0), 0.0)
        reserve_now = min(remaining_qty, row_free_qty)
        if reserve_now <= 0:
            continue

        row.reserved_qty = (row.reserved_qty or 0) + reserve_now
        reserved_now_total += reserve_now
        remaining_qty -= reserve_now
        if remaining_qty <= 0:
            break

    return total_qty, free_qty, reserved_now_total

def issue_fixture_stock(
    db: Session,
    *,
    part_name: Any,
    article_number: Any,
    preferred_make: Any = "",
    qty_to_issue: float,
) -> Tuple[float, float]:
    stock_rows = get_fixture_stock_rows(
        db,
        part_name=part_name,
        article_number=article_number,
        preferred_make=preferred_make,
    )
    remaining_qty = float(qty_to_issue or 0)
    issued_now_total = 0.0

    for row in stock_rows:
        issue_now = min(remaining_qty, float(row.qty or 0))
        if issue_now <= 0:
            continue
            
        # Deduct from reserved as well if applicable
        deduct_reserved = min(issue_now, float(row.reserved_qty or 0))
        row.reserved_qty = float(row.reserved_qty or 0) - deduct_reserved
        row.qty = float(row.qty or 0) - issue_now
        
        issued_now_total += issue_now
        remaining_qty -= issue_now
        if remaining_qty <= 0:
            break
    return issued_now_total, remaining_qty

from models import MaterialTransactionHistory, FixtureJobAllocation, FixtureMaster, BomUpload

def log_material_history(
    db: Session,
    *,
    bo_no: Optional[str],
    product_details: Optional[str],
    bo_part_name: str,
    article_number: str,
    make: str,
    transaction_type: str,
    qty: float,
    event_time: Optional[datetime] = None,
) -> None:
    event_time_value = event_time or ist_datetime()
    history = MaterialTransactionHistory(
        bo_no=bo_no,
        product_details=product_details,
        bo_part_name=bo_part_name,
        article_number=article_number,
        make=make,
        transaction_type=transaction_type,
        qty=qty,
        event_time=event_time_value
    )
    db.add(history)
    # Note: caller should commit

def refresh_fixture_status(db: Session, product_details: str) -> None:
    product_key = normalize_ci_text(product_details)
    allocations = db.query(FixtureJobAllocation).filter(
        func.lower(func.trim(func.coalesce(FixtureJobAllocation.product_details, ''))) == product_key
    ).all()
    
    if not allocations:
        return

    if all((a.shortage_qty or 0) <= 0 for a in allocations):
        new_status = "Reserved"
    elif any((a.reserved_qty or 0) > 0 for a in allocations):
        new_status = "Partial Reserved"
    else:
        new_status = "Shortage"

    fixture = db.query(FixtureMaster).filter(
        func.lower(func.trim(func.coalesce(FixtureMaster.product_details, ''))) == product_key
    ).first()
    if fixture:
        fixture.status = new_status

def reallocate_pending_fixtures(db: Session, part_name: str, article_number: str, make: str) -> None:
    try:
        _, _, initial_free_qty = get_fixture_stock_summary(
            db,
            part_name=part_name,
            article_number=article_number,
            preferred_make=make,
        )
        if initial_free_qty <= 0:
            return

        # Get pending allocations
        norm_part = normalize_ci_text(part_name)
        norm_article = normalize_ci_text(article_number)
        
        allocations = db.query(FixtureJobAllocation, FixtureMaster)\
            .join(FixtureMaster, FixtureJobAllocation.product_details == FixtureMaster.product_details)\
            .filter(
                func.lower(func.trim(func.coalesce(FixtureJobAllocation.bo_part_name, ''))) == norm_part,
                func.lower(func.trim(func.coalesce(FixtureJobAllocation.article_number, ''))) == norm_article,
                FixtureJobAllocation.shortage_qty > 0,
                func.coalesce(FixtureMaster.status, '') != 'Issued'
            )\
            .order_by(FixtureMaster.created_at.asc(), FixtureJobAllocation.id.asc())\
            .all()

        affected_products = set()

        for alloc, fixture in allocations:
            _, _, reserve_now = reserve_fixture_stock(
                db,
                part_name=alloc.bo_part_name,
                article_number=alloc.article_number,
                preferred_make=alloc.make,
                required_qty=float(alloc.shortage_qty or 0),
            )
            if reserve_now <= 0:
                continue

            alloc.reserved_qty = (alloc.reserved_qty or 0) + reserve_now
            alloc.shortage_qty = (alloc.required_qty or 0) - alloc.reserved_qty

            # Find bo_no from BomUpload for history tracking
            bom = db.query(BomUpload).filter(
                BomUpload.product_details == alloc.product_details,
                func.lower(func.trim(func.coalesce(BomUpload.bo_part_name, ''))) == func.lower(func.trim(func.coalesce(alloc.bo_part_name, ''))),
                func.lower(func.trim(func.coalesce(BomUpload.article_number, ''))) == func.lower(func.trim(func.coalesce(alloc.article_number, '')))
            ).first()
            bo_no = bom.bo_no if bom else None

            history_type = "Reserved" if alloc.shortage_qty <= 0 else "Partial Reserved"
            log_material_history(
                db,
                bo_no=bo_no,
                product_details=alloc.product_details,
                bo_part_name=alloc.bo_part_name,
                article_number=alloc.article_number,
                make=alloc.make,
                transaction_type=history_type,
                qty=reserve_now,
            )

            affected_products.add(alloc.product_details)

        for prod_details in affected_products:
            refresh_fixture_status(db, prod_details)

    except Exception as e:
        print("Fixture reallocation error:", e)
        # Note: Caller should handle rollback if needed or just catch the exception
def refresh_daily_plan_status(db: Session, today: Optional[datetime] = None, job_id: Optional[str] = None):
    from models import DailyProductionPlan
    from sqlalchemy import case, cast, Date
    
    if not today:
        from generic_utils import ist_now
        today = ist_now()
        
    today_date = today.date()
    
    query = db.query(DailyProductionPlan)
    if job_id:
        query = query.filter(DailyProductionPlan.job_id == job_id)
        
    query.update({
        "status": case(
            (func.coalesce(func.nullif(func.trim(DailyProductionPlan.status), ''), '') == 'Cancelled', 'Cancelled'),
            (func.coalesce(DailyProductionPlan.produced_qty, 0) >= DailyProductionPlan.planned_qty, 'Completed'),
            (cast(DailyProductionPlan.plan_date, Date) > today_date, 'Future'),
            (func.coalesce(DailyProductionPlan.produced_qty, 0) == 0, 'Pending'),
            else_='In Progress'
        )
    }, synchronize_session=False)
    db.commit()
