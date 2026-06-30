from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, text, Date, cast
from datetime import datetime, date
import io
from typing import List, Optional, Any

from database import get_db
from dependencies import require_roles, ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT
from models import (
    ProductionEntry,
    Job,
    Product,
    MaterialMaster,
    StockTransaction,
    JobMaterialAllocation,
    MaterialTransactionHistory,
    FixtureMaster,
    FixtureJobAllocation
)
from generic_utils import (
    ist_now,
    normalize_ci_text
)

# PDF Generation imports
try:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    REPORTLAB_OK = True
except ImportError:
    REPORTLAB_OK = False

router = APIRouter()

# --- Helpers ---

def _pdf_response(buffer: io.BytesIO, filename: str) -> StreamingResponse:
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def _build_pdf(
    title: str,
    headers: list,
    rows: list,
    col_widths: list | None = None,
    landscape_mode: bool = False,
    alignments: list | None = None, # 0=Left, 1=Center, 2=Right
) -> io.BytesIO:
    buf = io.BytesIO()
    page = landscape(A4) if landscape_mode else A4
    doc = SimpleDocTemplate(
        buf,
        pagesize=page,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=12 * mm,
        bottomMargin=10 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title2",
        parent=styles["Heading1"],
        fontSize=12,
        leading=14,
        spaceAfter=2,
    )
    sub_style = ParagraphStyle(
        "Sub",
        parent=styles["Normal"],
        fontSize=7,
        textColor=colors.HexColor("#6b7280"),
        spaceAfter=6,
    )
    
    def get_cell_style(align=0):
        return ParagraphStyle(
            f"CS_{align}",
            parent=styles["Normal"],
            fontSize=7,
            leading=8,
            alignment=align,
            wordWrap='CJK',
        )

    generated_on = datetime.now().strftime("%d %b %Y  %H:%M")
    story = [
        Paragraph(title, title_style),
        Paragraph(f"Generated on {generated_on}", sub_style),
        Spacer(1, 2),
    ]

    def wrap_cell(c, col_idx, is_header=False):
        align = 1 if is_header else (alignments[col_idx] if alignments else 0)
        style = get_cell_style(align)
        if is_header:
            style.textColor = colors.white
            style.fontName = "Helvetica-Bold"
        return Paragraph(str(c) if c is not None else "—", style)

    p_headers = [wrap_cell(h, i, True) for i, h in enumerate(headers)]
    p_rows = [[wrap_cell(c, i) for i, c in enumerate(r)] for r in rows]
    table_data = [p_headers] + p_rows

    avail_w = (page[0] - 20 * mm)
    if col_widths is None:
        cw = avail_w / max(len(headers), 1)
        col_widths = [cw] * len(headers)

    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
    tbl_styles = [
        ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#8b5cf6")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, 0),   1.5),
        ("TOPPADDING",    (0, 0), (-1, 0),   1.5),
        ("LEFTPADDING",   (0, 0), (-1, -1),  2),
        ("RIGHTPADDING",  (0, 0), (-1, -1),  2),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("GRID",          (0, 0), (-1, -1), 0.2, colors.HexColor("#d1d5db")),
    ]
    
    tbl.setStyle(TableStyle(tbl_styles))
    story.append(tbl)
    doc.build(story)
    return buf

# --- JSON Endpoints ---

@router.get("/reports/production-summary")
def get_production_summary(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))
):
    query = db.query(
        ProductionEntry.id,
        ProductionEntry.job_id,
        Product.product_name,
        ProductionEntry.finished_date,
        ProductionEntry.shift,
        ProductionEntry.finished_qty,
        ProductionEntry.rejected_qty,
        ProductionEntry.remarks
    ).outerjoin(Job, ProductionEntry.job_id == Job.job_id)\
     .outerjoin(Product, Job.product_id == Product.product_id)
    
    if from_date:
        query = query.filter(ProductionEntry.finished_date >= from_date)
    if to_date:
        query = query.filter(ProductionEntry.finished_date <= to_date)
        
    results = query.order_by(ProductionEntry.finished_date.desc(), ProductionEntry.id.desc()).all()
    return [{
        "id": r[0],
        "job_id": r[1],
        "product_name": r[2],
        "finished_date": r[3],
        "shift": r[4],
        "finished_qty": r[5],
        "rejected_qty": r[6],
        "remarks": r[7],
    } for r in results]

@router.get("/reports/job-performance")
def get_job_performance(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))
):
    query = db.query(
        Job.job_id,
        Job.job_date,
        Job.product_id,
        Product.product_name,
        Job.quantity,
        Job.target_date,
        Job.start_date,
        Job.status,
        func.coalesce(func.sum(ProductionEntry.finished_qty), 0).label("finished_qty"),
        func.max(ProductionEntry.finished_date).label("finished_date")
    ).outerjoin(Product, Job.product_id == Product.product_id)\
     .outerjoin(ProductionEntry, Job.job_id == ProductionEntry.job_id)
     
    if from_date:
        query = query.filter(Job.job_date >= from_date)
    if to_date:
        query = query.filter(Job.job_date <= to_date)
        
    results = query.group_by(Job.job_id).order_by(Job.job_date.desc()).all()
    
    out = []
    for r in results:
        on_time = None
        if r.status == "Completed" and r.finished_date:
            on_time = r.finished_date <= r.target_date
            
        out.append({
            "job_id": r.job_id,
            "job_date": r.job_date,
            "product_id": r.product_id,
            "product_name": r.product_name,
            "planned_qty": r.quantity,
            "target_date": r.target_date,
            "start_date": r.start_date,
            "status": r.status,
            "finished_qty": float(r.finished_qty),
            "finished_date": r.finished_date,
            "on_time": on_time
        })
    return out

@router.get("/reports/inventory-stock")
def get_inventory_stock(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))
):
    # Get all materials with current stock
    materials = db.query(MaterialMaster).order_by(MaterialMaster.material_name).all()
    
    out = []
    for m in materials:
        last_txn = db.query(StockTransaction).filter(StockTransaction.material_code == m.material_code).order_by(desc(StockTransaction.id)).first()
        current_stock = last_txn.current_stock if last_txn else 0
        
        # Shortage calculation
        shortage_query = db.query(func.coalesce(func.sum(JobMaterialAllocation.shortage_qty), 0))\
            .join(Job, Job.job_id == JobMaterialAllocation.job_id)\
            .filter(JobMaterialAllocation.material_code == m.material_code)\
            .filter(Job.status.notin_(['Completed', 'Cancelled']))
            
        if from_date:
            shortage_query = shortage_query.filter(Job.job_date >= from_date)
        if to_date:
            shortage_query = shortage_query.filter(Job.job_date <= to_date)
            
        shortage_qty = shortage_query.scalar() or 0
        
        out.append({
            "material_code": m.material_code,
            "material_name": m.material_name,
            "minimum_stock": m.minimum_stock,
            "current_stock": current_stock,
            "shortage_qty": float(shortage_qty)
        })
    return out

@router.get("/reports/material-consumption")
def get_material_consumption(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    fixture_name: Optional[str] = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))
):
    query = db.query(MaterialTransactionHistory).filter(func.upper(func.trim(func.coalesce(MaterialTransactionHistory.transaction_type, ''))).in_(['ISSUE', 'MATERIAL_ISSUE', 'FIXTURE_MATERIAL_ISSUE']))
    
    pre_filter_count = query.count()

    if from_date:
        query = query.filter(cast(MaterialTransactionHistory.event_time, Date) >= datetime.strptime(from_date, "%Y-%m-%d").date())
    if to_date:
        query = query.filter(cast(MaterialTransactionHistory.event_time, Date) <= datetime.strptime(to_date, "%Y-%m-%d").date())
    if fixture_name:
        fn_norm = normalize_ci_text(fixture_name)
        query = query.filter(func.lower(func.trim(func.coalesce(MaterialTransactionHistory.product_details, ''))) == fn_norm)
        
    results = query.order_by(desc(MaterialTransactionHistory.event_time)).all()
    return [{
        "fixture_name": r.product_details,
        "bo_no": r.bo_no,
        "part_name": r.bo_part_name,
        "article_number": r.article_number,
        "make": r.make,
        "issued_qty": r.qty,
        "issue_time": r.event_time
    } for r in results]

@router.get("/reports/material-consumption/fixtures")
def get_material_consumption_fixtures(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    # PostgreSQL requirement: ORDER BY expression must be in SELECT DISTINCT list
    expr = func.coalesce(func.nullif(func.trim(MaterialTransactionHistory.product_details), ''), 'Unknown')
    results = db.query(expr.label('p_details'))\
        .filter(func.upper(func.trim(func.coalesce(MaterialTransactionHistory.transaction_type, ''))).in_(['ISSUE', 'MATERIAL_ISSUE', 'FIXTURE_MATERIAL_ISSUE']))\
        .distinct()\
        .order_by('p_details').all()
    return [r[0] for r in results]

# --- PDF Endpoints ---

@router.get("/reports/production-summary/pdf")
def pdf_production_summary(from_date: Optional[str] = None, to_date: Optional[str] = None, db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    if not REPORTLAB_OK: raise HTTPException(status_code=500, detail="reportlab not installed.")
    data = get_production_summary(from_date, to_date, db)
    headers = ["#", "Job ID", "Date", "Shift", "Finished", "Rejection", "Efficiency%", "Remarks"]
    rows = []
    for i, r in enumerate(data, 1):
        tot = (r["finished_qty"] or 0) + (r["rejected_qty"] or 0)
        eff = f"{(r['finished_qty'] / tot * 100):.1f}%" if tot > 0 else "—"
        rows.append([i, r["job_id"], r["finished_date"], r["shift"], r["finished_qty"], r["rejected_qty"], eff, r["remarks"] or ""])
    buf = _build_pdf("Production Summary", headers, rows, col_widths=[7*mm, 25*mm, 20*mm, 15*mm, 15*mm, 15*mm, 17*mm, 78*mm], alignments=[1, 1, 1, 1, 2, 2, 2, 0])
    return _pdf_response(buf, "production_summary.pdf")

@router.get("/reports/job-performance/pdf")
def pdf_job_performance(from_date: Optional[str] = None, to_date: Optional[str] = None, db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    if not REPORTLAB_OK: raise HTTPException(status_code=500, detail="reportlab not installed.")
    data = get_job_performance(from_date, to_date, db)
    headers = ["#", "Job ID", "Product", "Plan", "Finished", "Balance", "Start Date", "Finished Date", "Status", "Delivery Status"]
    rows = []
    for i, r in enumerate(data, 1):
        bal = (r["planned_qty"] or 0) - (r["finished_qty"] or 0)
        delivery = "On Time" if r.get("on_time") else "Late" if r["status"] == "Completed" else "Pending"
        rows.append([i, r["job_id"], r["product_name"], r["planned_qty"], r["finished_qty"], bal, r["start_date"], r["finished_date"], r["status"], delivery])
    buf = _build_pdf("Job Performance", headers, rows, col_widths=[7*mm, 22*mm, 44*mm, 12*mm, 12*mm, 12*mm, 18*mm, 18*mm, 25*mm, 20*mm], alignments=[1, 1, 0, 2, 2, 2, 1, 1, 1, 1])
    return _pdf_response(buf, "job_performance.pdf")

@router.get("/reports/inventory-stock/pdf")
def pdf_inventory_stock(from_date: Optional[str] = None, to_date: Optional[str] = None, db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    if not REPORTLAB_OK: raise HTTPException(status_code=500, detail="reportlab not installed.")
    data = get_inventory_stock(from_date, to_date, db)
    headers = ["#", "Code", "Material Name", "Min", "Stock", "Status", "Low Stocks"]
    rows = []
    for i, r in enumerate(data, 1):
        current_stock = r["current_stock"] or 0
        minimum_stock = r["minimum_stock"] or 0
        shortage = r.get("shortage_qty") or 0
        min_shortage = max(0, minimum_stock - current_stock)
        status = "Shortage" if current_stock <= 0 else "Low Qty" if min_shortage > 0 else "Good"
        rows.append([i, r["material_code"], r["material_name"], minimum_stock, current_stock, status, shortage if shortage > 0 else "—"])
    buf = _build_pdf("Inventory Stock Report", headers, rows, col_widths=[10*mm, 28*mm, 62*mm, 18*mm, 18*mm, 24*mm, 30*mm], alignments=[1, 1, 0, 2, 2, 1, 2])
    return _pdf_response(buf, "inventory_stock.pdf")

@router.get("/reports/material-consumption/pdf")
def pdf_material_consumption(from_date: Optional[str] = None, to_date: Optional[str] = None, fixture_name: Optional[str] = None, db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    if not REPORTLAB_OK: raise HTTPException(status_code=500, detail="reportlab not installed.")
    data = get_material_consumption(from_date, to_date, fixture_name, db)
    headers = ["#", "Issue Time", "Fixture", "BO No", "Part Name", "Article Number", "Make", "Issued Qty"]
    rows = []
    for i, r in enumerate(data, 1):
        rows.append([i, r["issue_time"], r["fixture_name"], r["bo_no"] or "", r["part_name"], r["article_number"], r["make"], r["issued_qty"]])
    buf = _build_pdf("Fixture-wise Material Issued Report", headers, rows, col_widths=[10*mm, 28*mm, 28*mm, 14*mm, 72*mm, 34*mm, 30*mm, 20*mm], landscape_mode=True, alignments=[1, 1, 0, 1, 0, 1, 0, 2])
    return _pdf_response(buf, "material_consumption.pdf")
