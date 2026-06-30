from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime
from typing import List, Optional, Any
import io
import csv

from database import get_db
from dependencies import require_roles, ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT
from models import (
    FixtureMaster,
    FixtureJobAllocation,
    StockMaintenance,
    MaterialTransactionHistory,
    Job
)
from generic_utils import normalize_ci_text, ist_datetime, ist_now
from database_utils import (
    log_user_activity, 
    select_stock_row_by_article, 
    get_fixture_stock_summary, 
    issue_fixture_stock,
    log_material_history,
    refresh_fixture_status,
    reserve_fixture_stock,
    get_fixture_stock_rows
)

router = APIRouter()

class ProductionEntryRequest(BaseModel):
    product_details: str
    shift: str
    finished_qty: float
    rejected_qty: float
    remarks: Optional[str] = ""

class FixtureProductionEntry(BaseModel):
    product_details: str
    finished_at: str
    finished_qty: float
    remarks: Optional[str] = None

class FixtureBOMPreview(BaseModel):
    rows: List[Any]
    fixture_qty: int

class FixtureBOMConfirm(BaseModel):
    rows: List[Any]
    fixture_qty: int
    product_details: str

@router.post("/fixture-bom/preview")
async def preview_fixture_bom(
    payload: FixtureBOMPreview,
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION))
):
    if not payload.rows or payload.fixture_qty < 1:
        raise HTTPException(status_code=400, detail="Invalid data")

    from generic_utils import normalize_upload_column_name, derive_product_details_from_filename
    from database_utils import get_fixture_stock_summary

    required_columns = {"bo_no", "bo_part_name", "article_no", "make", "qty"}
    normalized_rows = []
    
    for i, row in enumerate(payload.rows, start=2):
        normalized = {normalize_upload_column_name(k): str(v).strip() for k, v in row.items()}
        missing = required_columns - normalized.keys()
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing)}")
        
        try:
            unit_qty = float(normalized["qty"]) if normalized["qty"] else 0
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Row {i}: qty must be a number")
        
        normalized_rows.append({
            "bo_no": normalized["bo_no"],
            "bo_part_name": normalized["bo_part_name"],
            "article_number": normalized["article_no"],
            "make": normalized["make"],
            "unit_qty": unit_qty,
            "required_qty": unit_qty * payload.fixture_qty
        })

    raw_filename = payload.rows[0].get("__filename__", "unknown")
    product_details = derive_product_details_from_filename(raw_filename)
    
    result_items = []
    simulated_free_qty = {}
    
    for item in normalized_rows:
        item_key = (normalize_ci_text(item["bo_part_name"]), normalize_ci_text(item["article_number"]))
        if item_key not in simulated_free_qty:
            _, _, free_qty = get_fixture_stock_summary(
                db,
                part_name=item["bo_part_name"],
                article_number=item["article_number"],
                preferred_make=item["make"],
            )
            simulated_free_qty[item_key] = free_qty

        available_qty = simulated_free_qty[item_key]
        required = item["required_qty"]
        
        if available_qty >= required:
            status = "Reserved"
            simulated_free_qty[item_key] = available_qty - required
        elif available_qty > 0:
            status = "Partial Reserved"
            simulated_free_qty[item_key] = 0
        else:
            status = "Shortage"
        
        result_items.append({
            **item,
            "available_qty": available_qty,
            "status": status
        })
    
    return {
        "product_details": product_details,
        "fixture_qty": payload.fixture_qty,
        "bom_items": result_items
    }

@router.post("/fixture-bom/confirm")
async def confirm_fixture_bom(
    payload: FixtureBOMConfirm,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION)),
):
    if not payload.rows or payload.fixture_qty < 1:
        raise HTTPException(status_code=400, detail="Invalid data")

    from generic_utils import normalize_material_key, derive_product_details_from_filename, ist_datetime
    from database_utils import reserve_fixture_stock, log_material_history
    from models import BomUpload

    # Deduplicate BOM items
    unique_items = {}
    for item in payload.rows:
        key = normalize_material_key(item["bo_part_name"], item["article_number"], item["make"])
        if key in unique_items:
            # item.get("unit_qty") might be missing if it's from raw rows
            u_qty = item.get("unit_qty", item["required_qty"] / payload.fixture_qty)
            unique_items[key]["unit_qty"] += u_qty
            unique_items[key]["required_qty"] = unique_items[key]["unit_qty"] * payload.fixture_qty
        else:
            unique_items[key] = {
                "bo_no": item["bo_no"],
                "bo_part_name": item["bo_part_name"],
                "article_number": item["article_number"],
                "make": item["make"],
                "unit_qty": item.get("unit_qty", item["required_qty"] / payload.fixture_qty),
                "required_qty": item["required_qty"],
                "status": item.get("status", "")
            }
    
    deduplicated_rows = list(unique_items.values())
    clean_product_details = derive_product_details_from_filename(payload.product_details)
    product_key = normalize_ci_text(clean_product_details)

    # Check if already exists
    existing = db.query(FixtureMaster).filter(func.lower(func.trim(FixtureMaster.product_details)) == product_key).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Fixture '{clean_product_details}' already exists.")

    # Determine status
    has_shortage = any(r["status"] == "Shortage" for r in deduplicated_rows)
    has_partial = any(r["status"] == "Partial Reserved" for r in deduplicated_rows)
    fixture_status = "Shortage" if has_shortage else "Partial Reserved" if has_partial else "Reserved"

    # Insert Master
    new_fixture = FixtureMaster(
        product_details=clean_product_details,
        fixture_qty=payload.fixture_qty,
        status=fixture_status,
        created_at=ist_datetime()
    )
    db.add(new_fixture)
    db.flush()

    for item in deduplicated_rows:
        _, _, reserved_now = reserve_fixture_stock(
            db,
            part_name=item["bo_part_name"],
            article_number=item["article_number"],
            preferred_make=item["make"],
            required_qty=float(item["required_qty"] or 0),
        )
        shortage = item["required_qty"] - reserved_now

        # Allocation
        new_alloc = FixtureJobAllocation(
            product_details=clean_product_details,
            bo_part_name=item["bo_part_name"],
            article_number=item["article_number"],
            make=item["make"],
            required_qty=item["required_qty"],
            reserved_qty=reserved_now,
            shortage_qty=shortage
        )
        db.add(new_alloc)

        if reserved_now > 0:
            hist_type = "Reserved" if shortage <= 0 else "Partial Reserved"
            log_material_history(
                db,
                bo_no=item["bo_no"],
                product_details=clean_product_details,
                bo_part_name=item["bo_part_name"],
                article_number=item["article_number"],
                make=item["make"],
                transaction_type=hist_type,
                qty=reserved_now
            )

        # Bom Upload for compatibility
        db.add(BomUpload(
            bo_no=item["bo_no"],
            product_details=clean_product_details,
            bo_part_name=item["bo_part_name"],
            article_number=item["article_number"],
            make=item["make"],
            qty=item["unit_qty"]
        ))

    db.commit()
    log_user_activity(db, user, "Fixture BOM Add", f"Fixture: {clean_product_details}")
    return {"message": "Fixture BOM confirmed and saved"}

@router.post("/fixture-bom/production-entry")
def create_fixture_production_entry(
    entry: FixtureProductionEntry,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION)),
):
    product_key = normalize_ci_text(entry.product_details)
    fixture = db.query(FixtureMaster).filter(func.lower(func.trim(FixtureMaster.product_details)) == product_key).first()
    
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    if fixture.status != "Issued":
        raise HTTPException(status_code=400, detail="Production entry allowed only for issued fixtures")
    if float(entry.finished_qty) != float(fixture.fixture_qty):
        raise HTTPException(status_code=400, detail="Finished quantity must match fixture quantity")

    try:
        fixture.production_finished_at = datetime.fromisoformat(entry.finished_at.replace("Z", "+00:00"))
    except:
        fixture.production_finished_at = ist_datetime()

    fixture.production_finished_qty = entry.finished_qty
    fixture.production_remarks = entry.remarks
    fixture.status = 'Completed'
    
    db.commit()
    log_user_activity(db, user, "Fixture Production Entry", f"Fixture: {fixture.product_details} | Qty: {entry.finished_qty} | Remarks: {entry.remarks or '-'}")
    return {"message": "Fixture production entry saved"}

@router.post("/fixture-bom/complete/{product_details}")
def complete_fixture(product_details: str, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION))):
    product_key = normalize_ci_text(product_details)
    fixture = db.query(FixtureMaster).filter(func.lower(func.trim(FixtureMaster.product_details)) == product_key).first()
    
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    if fixture.status != "Issued":
        raise HTTPException(status_code=400, detail="Only issued fixtures can be completed")

    fixture.status = 'Completed'
    db.commit()
    log_user_activity(db, user, "Fixture Completed", f"Fixture: {fixture.product_details}")
    return {"message": "Fixture marked as completed"}

@router.get("/fixture-bom/list")
def list_fixtures(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    fixtures = db.query(FixtureMaster).order_by(FixtureMaster.id.desc()).all()
    # Ensure list format matches original sql result expectations
    return [{
        "product_details": f.product_details,
        "fixture_qty": f.fixture_qty,
        "status": f.status,
        "created_at": f.created_at.strftime("%Y-%m-%d %H:%M:%S") if f.created_at else None,
        "production_finished_at": f.production_finished_at.strftime("%Y-%m-%d %H:%M:%S") if f.production_finished_at else None,
        "production_finished_qty": f.production_finished_qty,
        "production_remarks": f.production_remarks
    } for f in fixtures]

@router.get("/fixture-bom/details/{product_details}")
def get_fixture_details(product_details: str, db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    product_key = normalize_ci_text(product_details)
    fixture = db.query(FixtureMaster).filter(func.lower(func.trim(FixtureMaster.product_details)) == product_key).first()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
        
    allocations = db.query(FixtureJobAllocation).filter(FixtureJobAllocation.product_details == product_details).all()
    
    alloc_list = []
    for a in allocations:
        # Use parity helper for stock summary
        _, total_stock, free_stock = get_fixture_stock_summary(
            db, 
            part_name=a.bo_part_name, 
            article_number=a.article_number, 
            preferred_make=a.make
        )

        alloc_list.append({
            "bo_part_name": a.bo_part_name,
            "article_number": a.article_number,
            "make": a.make,
            "required_qty": a.required_qty,
            "reserved_qty": a.reserved_qty,
            "issued_qty": a.issued_qty,
            "shortage_qty": a.shortage_qty,
            "current_stock": total_stock,
            "free_stock": free_stock
        })

    return {
        "product_details": fixture.product_details,
        "fixture_qty": fixture.fixture_qty,
        "status": fixture.status,
        "materials": alloc_list
    }

@router.post("/fixture-bom/issue/{product_details}")
def issue_fixture(product_details: str, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_INVENTORY))):
    product_key = normalize_ci_text(product_details)
    fixture = db.query(FixtureMaster).filter(func.lower(func.trim(FixtureMaster.product_details)) == product_key).first()
    if not fixture or fixture.status == "Issued":
        raise HTTPException(status_code=400, detail="Fixture not found or already issued")

    allocations = db.query(FixtureJobAllocation).filter(FixtureJobAllocation.product_details == product_details).all()
    
    for a in allocations:
        if a.reserved_qty > 0:
            issued, remaining = issue_fixture_stock(
                db,
                part_name=a.bo_part_name,
                article_number=a.article_number,
                preferred_make=a.make,
                qty_to_issue=a.reserved_qty
            )
            a.issued_qty = (a.issued_qty or 0) + issued
            a.reserved_qty = remaining # should be 0
            
            log_material_history(
                db,
                bo_no=None, # find bo_no if needed
                product_details=product_details,
                bo_part_name=a.bo_part_name,
                article_number=a.article_number,
                make=a.make,
                transaction_type="FIXTURE_MATERIAL_ISSUE",
                qty=issued
            )

    fixture.status = "Issued"
    db.commit()
    log_user_activity(db, user, "Fixture Material Issue", f"Fixture: {product_details}")
    return {"message": "Material issued successfully"}

@router.delete("/fixture-bom/{product_details}")
def delete_fixture(product_details: str, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION))):
    fixture = db.query(FixtureMaster).filter(FixtureMaster.product_details == product_details).first()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
        
    allocations = db.query(FixtureJobAllocation).filter(FixtureJobAllocation.product_details == product_details).all()
    
    for a in allocations:
        if a.reserved_qty > 0:
            stock_rows = get_fixture_stock_rows(db, part_name=a.bo_part_name, article_number=a.article_number, preferred_make=a.make)
            # Releasing reserved stock
            rem_reserved = a.reserved_qty
            for row in stock_rows:
                rel = min(rem_reserved, row.reserved_qty or 0)
                row.reserved_qty -= rel
                rem_reserved -= rel
                if rem_reserved <= 0: break

            log_material_history(
                db,
                bo_no=None,
                product_details=product_details,
                bo_part_name=a.bo_part_name,
                article_number=a.article_number,
                make=a.make,
                transaction_type="CANCEL_FIXTURE_RESERVATION",
                qty=a.reserved_qty
            )
    
    db.query(FixtureJobAllocation).filter(FixtureJobAllocation.product_details == product_details).delete()
    db.delete(fixture)
    db.commit()
    # No activity log here in demo_sql
    pass
    return {"message": "Fixture deleted successfully"}
@router.get("/completed-fixtures")
def get_completed_fixtures(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    fixtures = db.query(FixtureMaster).filter(FixtureMaster.status == 'Completed').order_by(desc(FixtureMaster.production_finished_at)).all()
    
    out = []
    for f in fixtures:
        # Get Issue Time (latest issue transaction for this fixture)
        issue_time = db.query(func.max(MaterialTransactionHistory.event_time))\
            .filter(func.lower(func.trim(func.coalesce(MaterialTransactionHistory.product_details, ''))) == func.lower(func.trim(f.product_details)))\
            .filter(func.upper(func.trim(func.coalesce(MaterialTransactionHistory.transaction_type, ''))).in_(['ISSUE', 'MATERIAL_ISSUE', 'FIXTURE_MATERIAL_ISSUE']))\
            .scalar()

        out.append({
            "product_details": f.product_details,
            "fixture_qty": f.fixture_qty,
            "status": f.status,
            "created_at": f.created_at.strftime("%Y-%m-%d %H:%M:%S") if f.created_at else None,
            "issue_time": issue_time.strftime("%Y-%m-%d %H:%M:%S") if issue_time else None,
            "completed_time": f.production_finished_at.strftime("%Y-%m-%d %H:%M:%S") if f.production_finished_at else None,
            "production_finished_at": f.production_finished_at.strftime("%Y-%m-%d %H:%M:%S") if f.production_finished_at else None,
            "production_finished_qty": f.production_finished_qty,
            "production_remarks": f.production_remarks
        })
    return out
