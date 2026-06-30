from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, text, case, extract, cast, Date
from datetime import datetime, date
from typing import List, Optional, Any

from database import get_db
from dependencies import require_roles, ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT
from models import (
    FixtureMaster,
    MaterialTransactionHistory,
    FixtureJobAllocation,
    DailyProductionPlan,
    StockMaintenance,
    Job,
    ProductionEntry
)
from generic_utils import (
    ist_now,
    normalize_ci_text
)

router = APIRouter()

def normalize_dashboard_month(month: str | None) -> str:
    if not month:
        return ist_now().strftime("%Y-%m")
    month_value = str(month).strip()
    try:
        parsed = datetime.strptime(month_value, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format")
    return parsed.strftime("%Y-%m")

def normalize_dashboard_year(year: str | None) -> str:
    if not year:
        return ist_now().strftime("%Y")
    year_value = str(year).strip()
    try:
        parsed = datetime.strptime(year_value, "%Y")
    except ValueError:
        raise HTTPException(status_code=400, detail="year must be in YYYY format")
    return parsed.strftime("%Y")

def normalize_dashboard_period(period: str | None) -> str:
    if not period:
        return "month"
    period_value = str(period).strip().lower()
    if period_value not in {"month", "year"}:
        raise HTTPException(status_code=400, detail="period must be 'month' or 'year'")
    return period_value

@router.get("/dashboard/kpi")
def get_dashboard_kpi(
    period: str | None = Query(None),
    month: str | None = Query(None),
    year: str | None = Query(None),
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))
):
    selected_period = normalize_dashboard_period(period)
    selected_month = normalize_dashboard_month(month)
    selected_year = normalize_dashboard_year(year)
    
    date_val = selected_month if selected_period == "month" else selected_year
    
    year_val = int(selected_year)
    month_val = int(selected_month.split("-")[1]) if selected_period == "month" else None

    # 1. Total Fixtures created in period
    feat_filter = [extract('year', FixtureMaster.created_at) == year_val]
    if month_val:
        feat_filter.append(extract('month', FixtureMaster.created_at) == month_val)
        
    total_fixtures = db.query(FixtureMaster).filter(*feat_filter).count()

    # 2. Issued Fixtures (fixtures whose status is 'Issued' or 'Completed')
    issued_count = db.query(FixtureMaster).filter(
        func.lower(func.trim(func.coalesce(FixtureMaster.status, ''))).in_(['issued', 'completed']),
        *feat_filter
    ).count()

    # 3. Aggregated quantities
    stats = db.query(
        func.sum(FixtureJobAllocation.required_qty).label("total_required"),
        func.sum(FixtureJobAllocation.reserved_qty).label("total_reserved"),
        func.sum(FixtureJobAllocation.issued_qty).label("total_issued"),
        func.sum(FixtureJobAllocation.shortage_qty).label("total_shortage")
    ).join(FixtureMaster, func.lower(func.trim(func.coalesce(FixtureMaster.product_details, ''))) == func.lower(func.trim(func.coalesce(FixtureJobAllocation.product_details, ''))))\
    .filter(*feat_filter).first()

    # 4. Pending Fixtures (not Issued/Completed)
    pending_count = db.query(FixtureMaster).filter(
        FixtureMaster.status.notin_(['Issued', 'Completed']),
        *feat_filter
    ).count()

    return {
        "period": selected_period,
        "month": selected_month,
        "year": selected_year,
        "total_fixtures": total_fixtures,
        "issued_fixtures": issued_count or 0,
        "pending_fixtures": pending_count,
        "total_required_qty": float(stats.total_required or 0),
        "total_reserved_qty": float(stats.total_reserved or 0),
        "total_issued_qty": float(stats.total_issued or 0),
        "total_shortage_qty": float(stats.total_shortage or 0),
    }

@router.get("/dashboard/todays-plan")
def get_dashboard_todays_plan(
    plan_date: Optional[str] = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))
):
    if not plan_date:
        target_date = ist_now().date()
    else:
        target_date = datetime.strptime(plan_date, "%Y-%m-%d").date()
        
    plans = db.query(DailyProductionPlan).filter(cast(DailyProductionPlan.plan_date, Date) == target_date).all()
    return [{
        "id": p.id,
        "plan_date": p.plan_date.strftime("%Y-%m-%d") if p.plan_date else None,
        "product_id": p.product_id,
        "planned_qty": p.planned_qty,
        "produced_qty": p.produced_qty,
        "status": p.status
    } for p in plans]

@router.get("/dashboard/recommendations")
def get_dashboard_recommendations(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    today = ist_now()
    recos = []

    # 1. High Risk: Shortage + Near Deadline
    jobs = db.query(Job).filter(Job.status == 'Partially Reserved').all()
    for j in jobs:
        try:
            target = j.target_date
            days_left = (target - today).days
            if days_left <= 8:
                recos.append({"type": "High Risk", "message": f"{j.job_id} - Material shortage + near deadline", "priority": "High"})
        except: pass

    # 2. Production Behind Pace
    active_jobs = db.query(Job, func.sum(ProductionEntry.finished_qty))\
        .outerjoin(ProductionEntry, Job.job_id == ProductionEntry.job_id)\
        .filter(Job.status == 'In Progress')\
        .group_by(Job.job_id).all()
        
    for j, finished_qty in active_jobs:
        try:
            target = j.target_date
            start = j.start_date or j.job_date
            total_days = (target - start).days
            days_left = (target - today).days
            remaining = j.quantity - (finished_qty or 0)
            if total_days > 0 and days_left > 0:
                expected_rate = j.quantity / total_days
                required_rate = remaining / days_left
                if required_rate > expected_rate * 1.3:
                    recos.append({"type": "Production Behind", "message": f"{j.job_id} - Production behind pace", "priority": "Medium"})
        except: pass

    # 3. Capacity Risk
    if len(active_jobs) > 4:
        recos.append({"type": "Capacity Risk", "message": "Too many jobs in progress (>5)", "priority": "Medium"})

    # 4. Rejection Quality Issue (>15%)
    bad_quality = db.query(ProductionEntry.job_id, func.sum(ProductionEntry.rejected_qty), func.sum(ProductionEntry.finished_qty))\
        .group_by(ProductionEntry.job_id)\
        .having(func.sum(ProductionEntry.rejected_qty) > (func.sum(ProductionEntry.finished_qty) + func.sum(ProductionEntry.rejected_qty)) * 0.15).all()
    for jid, rej, fin in bad_quality:
        recos.append({"type": "Quality Issue", "message": f"{jid} - High rejection rate", "priority": "High"})

    return recos

@router.get("/fixture-issue-chart")
def get_fixture_issue_chart(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    sql = text("""
        SELECT
            h.event_time::date AS issue_date,
            f.product_details AS fixture_name,
            COALESCE(SUM(a.issued_qty), 0) AS total_qty_issued,
            COUNT(DISTINCT a.id) AS total_bom_qty
        FROM fixture_master f
        JOIN material_transaction_history h
            ON LOWER(TRIM(COALESCE(h.product_details, ''))) = LOWER(TRIM(COALESCE(f.product_details, '')))
           AND UPPER(TRIM(COALESCE(h.transaction_type, ''))) IN ('ISSUE', 'MATERIAL_ISSUE', 'FIXTURE_MATERIAL_ISSUE')
        LEFT JOIN fixture_job_allocation a
            ON LOWER(TRIM(COALESCE(a.product_details, ''))) = LOWER(TRIM(COALESCE(f.product_details, '')))
        WHERE COALESCE(f.status, '') IN ('Issued', 'Completed')
        GROUP BY h.event_time::date, f.product_details
        ORDER BY 1 ASC, 2 ASC
    """)
    results = db.execute(sql).fetchall()
    return [{"issue_date": r[0], "fixture_name": r[1], "total_qty_issued": r[2], "total_bom_qty": r[3]} for r in results]

@router.get("/dashboard/make-allocation-chart")
def get_dashboard_make_allocation_chart(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    # 1. Get all unique makes from stock_maintenance (Master List)
    all_makes = db.query(
        case(
            (func.lower(func.trim(func.coalesce(StockMaintenance.make, ''))).in_(['', '-', 'null']), 'Unknown'),
            else_=func.trim(StockMaintenance.make)
        ).label("make_label")
    ).distinct().all()
    
    # 2. Get shortages from fixture_job_allocation
    shortage_data = db.query(
        case(
            (func.lower(func.trim(func.coalesce(FixtureJobAllocation.make, ''))).in_(['', '-', 'null']), 'Unknown'),
            else_=func.trim(FixtureJobAllocation.make)
        ).label("make_label"),
        func.coalesce(func.sum(FixtureJobAllocation.shortage_qty), 0).label("shortage_total")
    ).filter(FixtureJobAllocation.shortage_qty > 0)\
    .group_by(text("make_label")).all()
    
    # 3. Merge results (Ensuring all makes from master are present)
    shortage_map = {r[0]: float(r[1]) for r in shortage_data}
    final_results = []
    seen_makes = set()
    
    for (m_label,) in all_makes:
        if m_label in seen_makes: continue
        seen_makes.add(m_label)
        final_results.append({
            "make": m_label,
            "count": shortage_map.get(m_label, 0.0)
        })
        
    # 4. Sort: Alpha, with Unknown last
    final_results.sort(key=lambda x: (1 if x["make"] == "Unknown" else 0, x["make"].lower()))
    
    return final_results

@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    # 1. Timeline (Raw SQL for PostgreSQL)
    timeline_sql = text("""
        WITH timeline_events AS (
            SELECT CAST(transaction_date AS DATE) AS event_date, transaction_type, quantity FROM stock_transactions
            UNION ALL
            SELECT CAST(event_time AS DATE) AS event_date, transaction_type, qty AS quantity FROM material_transaction_history
        )
        SELECT
            event_date,
            SUM(CASE WHEN UPPER(TRIM(COALESCE(transaction_type, ''))) IN ('PURCHASE', 'PURCHASE ENTRY') THEN quantity ELSE 0 END) AS purchase_qty,
            SUM(CASE WHEN UPPER(TRIM(COALESCE(transaction_type, ''))) IN ('MATERIAL_ISSUE', 'ISSUE', 'FIXTURE_MATERIAL_ISSUE') THEN quantity ELSE 0 END) AS issued_qty
        FROM timeline_events
        WHERE event_date IS NOT NULL
        GROUP BY event_date
        ORDER BY event_date
    """)
    
    stock_movement_timeline = []
    try:
        timeline_rows = db.execute(timeline_sql).fetchall()
        for r in timeline_rows:
            stock_movement_timeline.append({
                "date": str(r[0]) if r[0] else None, 
                "Purchase": float(r[1] or 0), 
                "issued": float(r[2] or 0), 
                "adjusted": 0
            })
    except Exception as e:
        print(f"ERROR: Dashboard Timeline failed: {e}")

    # 2. Latest 5 Fixtures
    stock_movement_table = []
    try:
        latest_fixtures = db.query(FixtureMaster).order_by(desc(FixtureMaster.created_at), desc(FixtureMaster.id)).limit(5).all()
        for f in latest_fixtures:
            stock_movement_table.append({
                "id": f.id,
                "product_details": f.product_details,
                "fixture_qty": f.fixture_qty,
                "status": f.status,
                "created_at": f.created_at.strftime("%Y-%m-%d %H:%M:%S") if f.created_at else None
            })
    except Exception as e:
        print(f"ERROR: Dashboard Latest Fixtures failed: {e}")

    # 3. Critical Materials
    critical_materials = []
    try:
        stock_rows = db.query(StockMaintenance).all()
        for s in stock_rows:
            current = (s.qty or 0) - (s.reserved_qty or 0)
            below_by = max((s.minimum_stock or 0) - current, 0)
            if below_by > 0:
                critical_materials.append({
                    "material_code": s.article_number,
                    "material_name": s.part_name,
                    "minimum_stock": s.minimum_stock,
                    "current_stock": current,
                    "below_minimum_by": below_by
                })
    except Exception as e:
        print(f"ERROR: Dashboard Critical Materials failed: {e}")

    # 4. Job Shortages (Fixtures at risk)
    job_shortages = []
    try:
        job_shortages_rows = db.query(
            FixtureMaster.product_details,
            FixtureMaster.status,
            FixtureMaster.fixture_qty,
            func.coalesce(func.sum(FixtureJobAllocation.shortage_qty), 0).label("total_shortage")
        ).outerjoin(FixtureJobAllocation, func.lower(func.trim(FixtureMaster.product_details)) == func.lower(func.trim(FixtureJobAllocation.product_details)))\
         .filter(func.lower(func.trim(func.coalesce(FixtureMaster.status, ''))).like('%partial%'))\
         .group_by(FixtureMaster.id, FixtureMaster.product_details, FixtureMaster.status, FixtureMaster.fixture_qty, FixtureMaster.created_at)\
         .having(func.coalesce(func.sum(FixtureJobAllocation.shortage_qty), 0) > 0)\
         .order_by(desc(FixtureMaster.created_at), desc(FixtureMaster.id)).all()
         
        for r in job_shortages_rows:
            job_shortages.append({
                "product_details": r[0],
                "status": r[1],
                "fixture_qty": r[2],
                "shortage_qty": float(r[3] or 0)
            })
    except Exception as e:
        print(f"ERROR: Dashboard Job Shortages failed: {e}")

    return {
        "stock_movement_timeline": stock_movement_timeline,
        "stock_movement_table": stock_movement_table,
        "critical_materials": critical_materials,
        "job_shortages": job_shortages
    }
