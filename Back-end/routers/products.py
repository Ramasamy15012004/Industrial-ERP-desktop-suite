from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, text
from typing import List, Optional, Any
import csv
import io

from database import get_db
from dependencies import require_roles, ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT
from models import Product, ProductBOM, MaterialMaster, BomUpload
from database_utils import log_user_activity
from generic_utils import normalize_ci_text

from generic_utils import normalize_ci_text, derive_product_details_from_filename, normalize_upload_column_name
from pydantic import BaseModel

router = APIRouter()

class BOMItemSchema(BaseModel):
    material_code: str
    quantity: float

class ProductSchema(BaseModel):
    product_id: str
    product_name: str
    bom: List[BOMItemSchema]

class ExcelUploadPayload(BaseModel):
    rows: List[Any]

@router.post("/add-product")
def add_product(product: ProductSchema, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION))):
    # Check if product exists
    existing = db.query(Product).filter(Product.product_id == product.product_id).first()
    if existing and existing.product_name != product.product_name:
        raise HTTPException(status_code=400, detail="Product ID already exists with different name")

    if not existing:
        new_product = Product(product_id=product.product_id, product_name=product.product_name)
        db.add(new_product)

    for item in product.bom:
        material = db.query(MaterialMaster).filter(MaterialMaster.material_code == item.material_code).first()
        if not material:
            raise HTTPException(status_code=400, detail=f"Material {item.material_code} not found")

        # Check for existing BOM item to avoid duplicates
        existing_bom = db.query(ProductBOM).filter(
            ProductBOM.product_id == product.product_id,
            ProductBOM.material_code == item.material_code
        ).first()

        if existing_bom:
            existing_bom.quantity = item.quantity
        else:
            db.add(ProductBOM(product_id=product.product_id, material_code=item.material_code, quantity=item.quantity))

    db.commit()
    log_user_activity(db, user, "PRODUCT_ADDED", f"Added/Updated product {product.product_id}")
    return {"message": "Product and BOM saved successfully"}

@router.post("/upload-products-csv")
async def upload_products_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION)),
):
    content = await file.read()
    decoded = content.decode("utf-8-sig")
    
    # Simple CSV parsing
    import csv as csv_lib
    import io as io_lib
    
    reader = csv_lib.DictReader(io_lib.StringIO(decoded))
    required_columns = {"bo_no", "bo_part_name", "article_no", "make", "qty"}

    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no headers")

    product_name = derive_product_details_from_filename(file.filename)
    product_key = normalize_ci_text(product_name)

    # Check for existing upload
    existing = db.query(BomUpload).filter(func.lower(func.trim(BomUpload.product_details)) == product_key).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"'{product_name}' already uploaded. Delete it first.")

    unique_rows = {}
    duplicate_count = 0
    
    for i, row in enumerate(reader, start=2):
        normalized = {normalize_upload_column_name(k): str(v).strip() for k, v in row.items()}
        missing = required_columns - normalized.keys()
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing)}")

        try:
            qty = float(normalized["qty"]) if normalized["qty"] else 0
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Row {i}: qty must be a number")

        # Key for deduplication: bo_no, part_name, article_no, make
        key = (normalized["bo_no"], normalized["bo_part_name"], normalized["article_no"], normalized["make"])
        if key in unique_rows:
            duplicate_count += 1
            unique_rows[key]["qty"] += qty
        else:
            unique_rows[key] = {
                "bo_no": normalized["bo_no"],
                "bo_part_name": normalized["bo_part_name"],
                "article_number": normalized["article_no"],
                "make": normalized["make"],
                "qty": qty
            }

    for item in unique_rows.values():
        db.add(BomUpload(
            bo_no=item["bo_no"],
            product_details=product_name,
            bo_part_name=item["bo_part_name"],
            article_number=item["article_number"],
            make=item["make"],
            qty=item["qty"]
        ))
    
    db.commit()
    log_user_activity(db, user, "PRODUCT_BOM_UPLOAD_CSV", f"Uploaded CSV BOM for {product_name}")
    
    msg = f"{len(unique_rows)} unique rows uploaded"
    if duplicate_count > 0: msg += f" ({duplicate_count} duplicates merged)"
    return {"message": msg}

@router.post("/upload-products-excel")
async def upload_products_excel(
    payload: ExcelUploadPayload,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION)),
):
    if not payload.rows:
        raise HTTPException(status_code=400, detail="No data rows")

    required_columns = {"bo_no", "bo_part_name", "article_no", "make", "qty"}
    unique_rows = {}
    duplicate_count = 0
    product_name = None
    
    for i, row in enumerate(payload.rows, start=2):
        normalized = {normalize_upload_column_name(k): str(v).strip() for k, v in row.items()}
        missing = required_columns - normalized.keys()
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing)}")

        try:
            qty = float(normalized["qty"]) if normalized["qty"] else 0
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Row {i}: qty must be a number")

        if product_name is None:
            product_name = derive_product_details_from_filename(normalized.get("__filename__", "unknown"))
            product_key = normalize_ci_text(product_name)
            existing = db.query(BomUpload).filter(func.lower(func.trim(BomUpload.product_details)) == product_key).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"'{product_name}' already uploaded.")

        key = (normalized["bo_no"], normalized["bo_part_name"], normalized["article_no"], normalized["make"])
        if key in unique_rows:
            duplicate_count += 1
            unique_rows[key]["qty"] += qty
        else:
            unique_rows[key] = {
                "bo_no": normalized["bo_no"],
                "bo_part_name": normalized["bo_part_name"],
                "article_number": normalized["article_no"],
                "make": normalized["make"],
                "qty": qty
            }

    for item in unique_rows.values():
        db.add(BomUpload(
            bo_no=item["bo_no"],
            product_details=product_name,
            bo_part_name=item["bo_part_name"],
            article_number=item["article_number"],
            make=item["make"],
            qty=item["qty"]
        ))
    
    db.commit()
    log_user_activity(db, user, "PRODUCT_BOM_UPLOAD_EXCEL", f"Uploaded Excel BOM for {product_name}")
    
    msg = f"{len(unique_rows)} unique rows uploaded"
    if duplicate_count > 0: msg += f" ({duplicate_count} duplicates merged)"
    return {"message": msg}

@router.get("/products")
def get_products(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    results = db.query(ProductBOM).all()
    return results

@router.get("/products-grouped")
def get_products_grouped(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    results = db.query(
        Product.product_id,
        Product.product_name,
        ProductBOM.id,
        ProductBOM.material_code,
        MaterialMaster.material_name,
        ProductBOM.quantity
    ).outerjoin(ProductBOM, Product.product_id == ProductBOM.product_id)\
     .outerjoin(MaterialMaster, ProductBOM.material_code == MaterialMaster.material_code).all()
     
    products = {}
    for row in results:
        p_id, p_name, b_id, m_code, m_name, qty = row
        if p_id not in products:
            products[p_id] = {
                "product_id": p_id,
                "product_name": p_name,
                "bom": []
            }
        if m_code:
            products[p_id]["bom"].append({
                "id": b_id,
                "material_code": m_code,
                "material_name": m_name,
                "quantity": qty
            })
    return list(products.values())

@router.get("/product-list")
def get_product_list(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    results = db.query(Product.product_id, Product.product_name).all()
    return [{"product_id": r[0], "product_name": r[1]} for r in results]

@router.delete("/delete-product/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION))):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    db.query(ProductBOM).filter(ProductBOM.product_id == product_id).delete()
    db.delete(product)
    db.commit()
    log_user_activity(db, user, "PRODUCT_DELETED", f"Deleted product {product_id}")
    return {"status": "Product deleted successfully"}

# BOM Upload logic (Simplified parity)
@router.get("/bom-upload/list")
def list_bom_uploads(db: Session = Depends(get_db), _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT))):
    results = db.query(BomUpload.product_details, func.count(BomUpload.id)).group_by(BomUpload.product_details).all()
    return [{"product_details": r[0], "row_count": r[1]} for r in results]

@router.delete("/bom-upload/{product_details}")
def delete_bom_upload(product_details: str, db: Session = Depends(get_db), user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_PRODUCTION))):
    db.query(BomUpload).filter(func.lower(func.trim(BomUpload.product_details)) == normalize_ci_text(product_details)).delete()
    db.commit()
    log_user_activity(db, user, "BOM_UPLOAD_DELETED", f"Deleted BOM upload for {product_details}")
    return {"message": "BOM upload deleted successfully"}
