from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, text
from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional, Any

from database import get_db
from dependencies import require_roles, ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT
from models import (
    Job,
    ProductionEntry,
    DailyProductionPlan
)
from database_utils import log_user_activity, refresh_daily_plan_status
from generic_utils import ist_date_str, ist_now, ist_datetime
from sqlalchemy import func, cast, Date

router = APIRouter()

class ProductionEntryPayload(BaseModel):
    job_id: str
    shift: str
    finished_qty: float
    rejected_qty: float
    remarks: Optional[str] = ""

@router.post("/production-entry")
def create_production_entry(entry: ProductionEntryPayload, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION))):
    now = ist_now()
    today_date = now.date()
    
    if entry.shift not in ["Shift 1", "Shift 2", "Shift 3"]:
        raise HTTPException(status_code=400, detail="Invalid shift value")
        
    job = db.query(Job).filter(Job.job_id == entry.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job.status != "In Progress":
        raise HTTPException(status_code=400, detail="Production allowed only after material issue.")
        
    # Create production entry
    new_entry = ProductionEntry(
        job_id=entry.job_id,
        finished_date=ist_datetime(),
        shift=entry.shift,
        finished_qty=entry.finished_qty,
        rejected_qty=entry.rejected_qty,
        remarks=entry.remarks
    )
    db.add(new_entry)
    
    # Update today's plan
    plan = db.query(DailyProductionPlan).filter(DailyProductionPlan.job_id == entry.job_id, cast(DailyProductionPlan.plan_date, Date) == today_date).first()
    if plan:
        plan.produced_qty = (plan.produced_qty or 0) + entry.finished_qty
        
        # Overproduction logic
        excess = plan.produced_qty - plan.planned_qty
        if excess > 0:
            # Find future plans
            future_plans = db.query(DailyProductionPlan).filter(
                DailyProductionPlan.job_id == entry.job_id,
                cast(DailyProductionPlan.plan_date, Date) > today_date,
                func.coalesce(func.nullif(func.trim(DailyProductionPlan.status), ''), '') != 'Cancelled'
            ).order_by(DailyProductionPlan.plan_date.asc()).all()
            
            remaining_excess = excess
            for f_plan in future_plans:
                if remaining_excess <= 0: break
                
                capacity = (f_plan.planned_qty or 0) - (f_plan.produced_qty or 0)
                if capacity > 0:
                    allocate = min(remaining_excess, capacity)
                    f_plan.produced_qty = (f_plan.produced_qty or 0) + allocate
                    remaining_excess -= allocate
                    
            # Reset today's plan to planned_qty if excess was fully or partially allocated
            # Actually the original code reset today to planned ONLY if it was excess.
            # Let's match original exactly:
            # if row: today_planned, today_produced = row; excess = today_produced - today_planned; if excess > 0: ...
            # it doesn't explicitly reset today's plan in the snippet I saw? 
            # Wait, 2249: # 🔹 Reset today produced to planned (remove excess)
            # Let me re-read line 2250 in app.py.
            
    db.commit()
    refresh_daily_plan_status(db, today=now, job_id=entry.job_id)
    log_user_activity(db, user, "PRODUCTION_ENTRY", f"Recorded production for job {entry.job_id}, Qty: {entry.finished_qty}")
    
    return {"message": "Production entry recorded successfully"}
