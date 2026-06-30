from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean, Text, UniqueConstraint, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
from generic_utils import ist_datetime, ist_date

class BomUpload(Base):
    __tablename__ = "bom_upload"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    bo_no = Column(String, nullable=True)
    product_details = Column(String, nullable=True)
    bo_part_name = Column(String, nullable=True)
    article_number = Column(String, nullable=True)
    make = Column(String, nullable=True)
    qty = Column(Float, nullable=True)
    uploaded_at = Column(DateTime, default=ist_datetime)


class StockMaintenance(Base):
    __tablename__ = "stock_maintenance"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    part_name = Column(String, nullable=True)
    article_number = Column(String, nullable=True)
    make = Column(String, nullable=True)
    qty = Column(Float, default=0.0)
    minimum_stock = Column(Float, default=0.0)
    lead_days = Column(String, default="0")
    price = Column(Float, default=0.0)
    last_purchase_date = Column(DateTime, nullable=True)
    status = Column(String, default="active")
    uploaded_at = Column(DateTime, default=ist_datetime)
    reserved_qty = Column(Float, default=0.0)


class FixtureMaster(Base):
    __tablename__ = "fixture_master"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_details = Column(String, nullable=False, unique=True)
    fixture_qty = Column(Integer, nullable=False)
    status = Column(String, default="Partial Reserved")
    created_at = Column(DateTime, default=ist_datetime)
    production_finished_at = Column(DateTime, nullable=True)
    production_finished_qty = Column(Float, nullable=True)
    production_remarks = Column(Text, nullable=True)
    
    # Relationship
    allocations = relationship("FixtureJobAllocation", back_populates="fixture_master")


class FixtureJobAllocation(Base):
    __tablename__ = "fixture_job_allocation"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_details = Column(String, ForeignKey("fixture_master.product_details"), nullable=False)
    bo_part_name = Column(String, nullable=True)
    article_number = Column(String, nullable=True)
    make = Column(String, nullable=True)
    required_qty = Column(Float, nullable=False)
    reserved_qty = Column(Float, default=0.0)
    issued_qty = Column(Float, default=0.0)
    shortage_qty = Column(Float, nullable=False)
    
    # Relationship
    fixture_master = relationship("FixtureMaster", back_populates="allocations")


class MaterialTransactionHistory(Base):
    __tablename__ = "material_transaction_history"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    bo_no = Column(String, nullable=True)
    product_details = Column(String, nullable=True)
    bo_part_name = Column(String, nullable=True)
    article_number = Column(String, nullable=True)
    make = Column(String, nullable=True)
    transaction_type = Column(String, nullable=False)
    qty = Column(Float, nullable=False)
    event_time = Column(DateTime, default=ist_datetime)


class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, unique=True, nullable=False)
    job_date = Column(DateTime, nullable=False)
    product_id = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    target_date = Column(DateTime, nullable=False)
    start_date = Column(DateTime, nullable=True)
    status = Column(String, nullable=False)
    shortage_details = Column(Text, nullable=True)


class ProductionEntry(Base):
    __tablename__ = "production_entries"
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, nullable=False)
    finished_date = Column(DateTime, nullable=False)
    shift = Column(String, nullable=False)
    finished_qty = Column(Float, nullable=False)
    rejected_qty = Column(Float, nullable=False)
    remarks = Column(Text, nullable=True)


class JobMaterialAllocation(Base):
    __tablename__ = "job_material_allocation"
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, nullable=False)
    material_code = Column(String, nullable=False)
    required_qty = Column(Float, nullable=False)
    reserved_qty = Column(Float, nullable=False)
    shortage_qty = Column(Float, nullable=False)
    purchase_status = Column(String, default="Pending")
    issued_qty = Column(Float, default=0.0)


class MaterialMaster(Base):
    __tablename__ = "material_master"
    id = Column(Integer, primary_key=True, autoincrement=True)
    material_code = Column(String, unique=True, nullable=False)
    material_name = Column(String, nullable=False)
    minimum_stock = Column(Integer, nullable=False)


class StockTransaction(Base):
    __tablename__ = "stock_transactions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    transaction_date = Column(DateTime, nullable=False)
    material_code = Column(String, index=True, nullable=False)
    material_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    job_id = Column(String, nullable=True)
    transaction_type = Column(String, nullable=False)
    current_stock = Column(Float, nullable=False)


class AppLicense(Base):
    __tablename__ = "app_license"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, nullable=False, default=ist_datetime)
    updated_at = Column(DateTime, nullable=False, default=ist_datetime)


class UserSession(Base):
    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, nullable=False, default=ist_datetime)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    
    # Relationship
    user = relationship("User", backref="sessions")


class UserActivityLog(Base):
    __tablename__ = "user_activity_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    username = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, nullable=True)
    activity_type = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    performed_at = Column(DateTime, nullable=False, default=ist_datetime)


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(String, unique=True, nullable=False)
    product_name = Column(String, nullable=False)


class ProductBOM(Base):
    __tablename__ = "product_bom"
    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(String, nullable=False)
    material_code = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    
    __table_args__ = (
        UniqueConstraint("product_id", "material_code", name="uix_product_material"),
    )


class DailyProductionPlan(Base):
    __tablename__ = "daily_production_plan"
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, nullable=False)
    plan_date = Column(DateTime, nullable=False)
    planned_qty = Column(Float, nullable=False)
    produced_qty = Column(Float, default=0.0)
    status = Column(String, default="Pending")

    __table_args__ = (
        UniqueConstraint("job_id", "plan_date", name="uix_job_plan_date"),
    )


class AllowedClient(Base):
    __tablename__ = "allowed_clients"
    id = Column(Integer, primary_key=True, autoincrement=True)
    client_name = Column(String(200), nullable=False)
    ip_address = Column(String(64), nullable=False, unique=True)
    created_at = Column(DateTime, nullable=False, default=ist_datetime)


class SchemaVersion(Base):
    __tablename__ = "schema_version"
    id = Column(Integer, primary_key=True, autoincrement=True)
    version = Column(Integer, nullable=False, unique=True)
    applied_at = Column(DateTime, nullable=False, default=ist_datetime)
    note = Column(Text, nullable=False, default="")
