from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List, Any
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from dependencies import require_roles, ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT, get_current_user
from models import (
    Job,
    JobMaterialAllocation,
    StockTransaction,
    FixtureMaster,
    Product,
    DailyProductionPlan
)
from database_utils import log_user_activity, refresh_daily_plan_status
from generic_utils import normalize_plan_date, ist_date_str, ist_now, ist_datetime
from sqlalchemy import func, cast, Date

router = APIRouter()

class JobCreate(BaseModel):
    product_id: str
    quantity: float
    target_date: str

@router.get("/daily-plan/{job_id}")
def get_daily_plan(job_id: str, plan_date: Optional[str] = None, db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    p_date_str = normalize_plan_date(plan_date, allow_today=True)
    p_date = datetime.strptime(p_date_str, "%Y-%m-%d").date()
    now = ist_now()
    
    refresh_daily_plan_status(db, today=now, job_id=job_id)
    
    plan = db.query(DailyProductionPlan).filter(DailyProductionPlan.job_id == job_id, cast(DailyProductionPlan.plan_date, Date) == p_date).first()
    
    future_planned_qty = db.query(func.coalesce(func.sum(DailyProductionPlan.planned_qty), 0))\
        .filter(DailyProductionPlan.job_id == job_id, DailyProductionPlan.status == 'Future').scalar() or 0
        
    future_planned_qty_other = db.query(func.coalesce(func.sum(DailyProductionPlan.planned_qty), 0))\
        .filter(DailyProductionPlan.job_id == job_id, DailyProductionPlan.status == 'Future', DailyProductionPlan.plan_date != p_date).scalar() or 0
        
    if not plan:
        return {
            "planned_qty": 0, "produced_qty": 0, "balance": 0, "status": "Pending",
            "future_planned_qty": float(future_planned_qty),
            "future_planned_qty_other": float(future_planned_qty_other)
        }
        
    return {
        "planned_qty": plan.planned_qty,
        "produced_qty": plan.produced_qty,
        "balance": plan.planned_qty - plan.produced_qty,
        "status": plan.status or "Pending",
        "future_planned_qty": float(future_planned_qty),
        "future_planned_qty_other": float(future_planned_qty_other)
    }

@router.get("/daily-plan-future/{job_id}")
def get_daily_plan_future(job_id: str, db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    now = ist_now()
    refresh_daily_plan_status(db, today=now, job_id=job_id)
    
    results = db.query(DailyProductionPlan).filter(
        DailyProductionPlan.job_id == job_id,
        cast(DailyProductionPlan.plan_date, Date) > now.date(),
        func.coalesce(func.nullif(func.trim(DailyProductionPlan.status), ''), '') != 'Cancelled'
    ).order_by(DailyProductionPlan.plan_date.asc()).all()
    
    return [{"plan_date": r.plan_date.strftime("%Y-%m-%d") if r.plan_date else None, "planned_qty": r.planned_qty} for r in results]

class IssueMaterial(BaseModel):
    job_id: str

@router.get("/active-jobs")
def get_active_jobs(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    # Join with Product table to get product_name
    jobs = db.query(Job, Product.product_name)\
        .outerjoin(Product, Job.product_id == Product.product_id)\
        .filter(Job.status.in_(['Reserved', 'In Progress', 'Partially Reserved']))\
        .all()
    
    return [
        {
            "job_id": j.job_id,
            "product_id": j.product_id,
            "product_name": pname if pname else j.product_id,
            "status": j.status
        }
        for j, pname in jobs
    ]

@router.get("/active-fixture-details")
def get_active_fixture_details(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    fixtures = db.query(FixtureMaster).filter(
        FixtureMaster.status.in_(['Reserved', 'Partial Reserved', 'Issued', 'Shortage'])
    ).order_by(FixtureMaster.created_at.desc(), FixtureMaster.id.desc()).all()
    
    return [
        {
            "product_details": f.product_details,
            "fixture_qty": f.fixture_qty,
            "status": f.status,
            "created_at": f.created_at,
            "production_finished_at": f.production_finished_at,
        }
        for f in fixtures
    ]

@router.post("/issue-material")
def issue_material(data: IssueMaterial, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_INVENTORY))):
    job = db.query(Job).filter(Job.job_id == data.job_id).first()
    if not job or job.status != "Reserved":
        raise HTTPException(status_code=400, detail="Job not found or not in Reserved status")

    allocations = db.query(JobMaterialAllocation).filter(JobMaterialAllocation.job_id == data.job_id).all()

    for alloc in allocations:
        if alloc.reserved_qty > 0 and alloc.issued_qty < alloc.reserved_qty:
            qty_to_issue = alloc.reserved_qty - (alloc.issued_qty or 0)
            alloc.issued_qty = alloc.reserved_qty
            
            # Note: In the original SQL, MATERIAL_ISSUE deducted from stock.
            # Here, 'reserved_qty' already implies it was put aside. 
            # We record the transaction for history auditing.
            
            last_txn = db.query(StockTransaction).filter(StockTransaction.material_code == alloc.material_code).order_by(StockTransaction.id.desc()).first()
            current_stock = last_txn.current_stock if last_txn else 0.0
            
            txn = StockTransaction(
                transaction_date=ist_datetime(),
                material_code=alloc.material_code,
                material_name=last_txn.material_name if last_txn else alloc.material_code,
                quantity=qty_to_issue,
                job_id=data.job_id,
                transaction_type="MATERIAL_ISSUE",
                current_stock=current_stock
            )
            db.add(txn)

    job.status = 'In Progress'
    job.start_date = ist_datetime()
    db.commit()
    log_user_activity(db, user, "JOB_ISSUED", f"Issued material for job {data.job_id}")
    return {"message": "Material issued successfully"}

@router.get("/job-issue-details/{job_id}")
def get_job_issue_details(job_id: str, db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    job_data = db.query(Job, Product.product_name)\
        .outerjoin(Product, Job.product_id == Product.product_id)\
        .filter(Job.job_id == job_id).first()
        
    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")

    job, pname = job_data
    allocations = db.query(JobMaterialAllocation).filter(JobMaterialAllocation.job_id == job_id).all()

    return {
        "job_id": job.job_id,
        "product_id": job.product_id,
        "product_name": pname if pname else job.product_id,
        "planned_qty": job.quantity,
        "target_date": job.target_date.strftime("%Y-%m-%d") if job.target_date else None,
        "status": job.status,
        "start_date": job.start_date.strftime("%Y-%m-%d") if job.start_date else None,
        "materials": [
            {
                "material_code": a.material_code,
                "required_qty": a.required_qty,
                "reserved_qty": a.reserved_qty,
                "issued_qty": a.issued_qty,
                "shortage_qty": a.shortage_qty
            }
            for a in allocations
        ]
    }
@router.get("/in-progress-jobs")
def get_in_progress_jobs(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    jobs = db.query(Job, Product.product_name)\
        .outerjoin(Product, Job.product_id == Product.product_id)\
        .filter(Job.status == 'In Progress')\
        .all()
    return [{"job_id": j.job_id, "product_name": pname or j.product_id} for j, pname in jobs]

@router.get("/completed-jobs")
def get_completed_jobs(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    jobs = db.query(
        Job, 
        Product.product_name,
        func.max(ProductionEntry.finished_date).label("finished_date"),
        func.coalesce(func.sum(ProductionEntry.finished_qty), 0).label("finished_qty")
    ).outerjoin(Product, Job.product_id == Product.product_id)\
     .outerjoin(ProductionEntry, Job.job_id == ProductionEntry.job_id)\
     .filter(Job.status == 'Completed')\
     .group_by(Job.id)\
     .all()
    
    return [
        {
            "job_id": j.job_id,
            "product_name": pname or j.product_id,
            "planned_qty": j.quantity,
            "finished_qty": float(fqty),
            "completed_time": fdate, # Mapped for UI parity
            "status": j.status
        }
        for j, pname, fdate, fqty in jobs
    ]

@router.get("/active-job-details")
def get_active_job_details(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    jobs = db.query(Job, Product.product_name)\
        .outerjoin(Product, Job.product_id == Product.product_id)\
        .filter(Job.status.in_(['Reserved', 'In Progress', 'Partially Reserved']))\
        .order_by(Job.job_date.desc()).all()
    return [{
        "job_id": j.job_id,
        "product_name": pname or j.product_id,
        "planned_qty": j.quantity,
        "status": j.status,
        "job_date": j.job_date.strftime("%Y-%m-%d %H:%M:%S") if j.job_date else None
    } for j, pname in jobs]

@router.post("/create-job")
def create_job(job: JobCreate, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION))):
    today = ist_now()
    today_date = today.strftime("%Y-%m-%d")

    # 1. Get BOM
    bom_items = db.query(Product.product_id, Product.product_name, func.coalesce(func.sum(JobMaterialAllocation.required_qty), 0))\
        .filter(Product.product_id == job.product_id).first()
    # Actually BOM is in ProductBOM
    from models import ProductBOM, MaterialMaster
    bom = db.query(ProductBOM).filter(ProductBOM.product_id == job.product_id).all()
    if not bom:
        raise HTTPException(status_code=400, detail="No BOM defined for this product")

    # 2. Generate Job ID
    year = today.strftime("%Y")
    month_day = today.strftime("%m%d")
    count = db.query(func.count(Job.id)).filter(Job.job_date == today_date).scalar() or 0
    sequence = str(count + 1).zfill(3)
    generated_job_id = f"JOB-{year}-{month_day}-{sequence}"

    # 3. Create Job
    new_job = Job(
        job_id=generated_job_id,
        job_date=ist_datetime(),
        product_id=job.product_id,
        quantity=job.quantity,
        target_date=datetime.strptime(job.target_date, "%Y-%m-%d"),
        status="Processing"
    )
    db.add(new_job)
    db.flush()

    shortage_list = []
    
    # 4. Reserve materials
    for item in bom:
        required = item.quantity * job.quantity
        
        last_txn = db.query(StockTransaction).filter(StockTransaction.material_code == item.material_code).order_by(StockTransaction.id.desc()).first()
        available = last_txn.current_stock if last_txn else 0.0
        
        reserve = min(required, available)
        shortage = required - reserve
        
        db.add(JobMaterialAllocation(
            job_id=generated_job_id,
            material_code=item.material_code,
            required_qty=required,
            reserved_qty=reserve,
            shortage_qty=shortage
        ))
        
        if shortage > 0:
            shortage_list.append({
                "material_code": item.material_code,
                "required": required,
                "reserved": reserve,
                "shortage": shortage
            })
            
        if reserve > 0:
            material = db.query(MaterialMaster).filter(MaterialMaster.material_code == item.material_code).first()
            new_stock = available - reserve
            db.add(StockTransaction(
                transaction_date=ist_datetime(),
                material_code=item.material_code,
                material_name=material.material_name if material else item.material_code,
                quantity=reserve,
                job_id=generated_job_id,
                transaction_type="RESERVED",
                current_stock=new_stock
            ))

    # 5. Final Status
    import json
    if not shortage_list:
        new_job.status = "Reserved"
        new_job.shortage_details = None
    else:
        new_job.status = "Partially Reserved"
        new_job.shortage_details = json.dumps(shortage_list)

    db.commit()
    log_user_activity(db, user, "JOB_CREATED", f"Created job {generated_job_id}")
    return {"message": "Job created successfully", "job_id": generated_job_id}

@router.post("/cancel-job/{job_id}")
def cancel_job(job_id: str, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN))):
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status == "Cancelled":
        raise HTTPException(status_code=400, detail="Job already cancelled")

    # Check if materials issued
    issued = db.query(func.coalesce(func.sum(JobMaterialAllocation.issued_qty), 0)).filter(JobMaterialAllocation.job_id == job_id).scalar() or 0
    if issued > 0:
        raise HTTPException(status_code=400, detail="Cannot cancel job. Materials already issued.")

    allocations = db.query(JobMaterialAllocation).filter(JobMaterialAllocation.job_id == job_id).all()
    today_date = ist_now().strftime("%Y-%m-%d")

    for alloc in allocations:
        if alloc.reserved_qty > 0:
            last_txn = db.query(StockTransaction).filter(StockTransaction.material_code == alloc.material_code).order_by(StockTransaction.id.desc()).first()
            current = last_txn.current_stock if last_txn else 0.0
            new_stock = current + alloc.reserved_qty
            
            db.add(StockTransaction(
                transaction_date=ist_datetime(),
                material_code=alloc.material_code,
                material_name=last_txn.material_name if last_txn else alloc.material_code,
                quantity=alloc.reserved_qty,
                job_id=job_id,
                transaction_type="CANCEL_RESERVATION",
                current_stock=new_stock
            ))
            
            # Reallocate to other pending jobs
            from database_utils import reallocate_pending_jobs
            # We'll call reallocate after committing the current change to ensure transactions are separate? 
            # Or just pass the session.
            # Actually, we can just commit at the end.

    job.status = "Cancelled"
    db.query(DailyProductionPlan).filter(DailyProductionPlan.job_id == job_id).update({"status": "Cancelled"})
    
    db.commit()
    
    # Re-trigger allocation for affected materials
    from database_utils import reallocate_pending_jobs
    for alloc in allocations:
        if alloc.reserved_qty > 0:
            reallocate_pending_jobs(db, alloc.material_code)
            
    log_user_activity(db, user, "JOB_CANCELLED", f"Cancelled job {job_id}")
    return {"message": "Job cancelled successfully"}
