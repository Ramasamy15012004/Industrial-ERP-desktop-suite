import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool
from config_utils import load_config

# Load dynamic config
cfg = load_config()

# Database configuration (Defaults/Env fallbacks)
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "Sway123")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME_VAL = os.getenv("DB_NAME", "production_db")

# Construct URL from config if available
SQLALCHEMY_DATABASE_URL = None
if cfg:
    if cfg.mode in ("single", "server") and cfg.db_name and cfg.db_user:
        # Master machine (Connects to DB)
        SQLALCHEMY_DATABASE_URL = f"postgresql://{cfg.db_user}:{cfg.db_password or ''}@{cfg.db_host}:{cfg.db_port}/{cfg.db_name}"
    elif cfg.mode == "client":
        # Pure Client machine (DOES NOT connect to any DB)
        SQLALCHEMY_DATABASE_URL = None

# Create engine
def create_new_engine(url):
    if not url:
        return None
    try:
        return create_engine(
            url,
            pool_pre_ping=True,
            pool_recycle=3600
        )
    except Exception:
        return None

engine = create_new_engine(SQLALCHEMY_DATABASE_URL)

# Global sessionmaker instance (will be configured with bind=engine later)
SessionLocal = sessionmaker(autoflush=False, autocommit=False, expire_on_commit=False)
if engine:
    SessionLocal.configure(bind=engine)

def refresh_engine():
    global engine, cfg
    cfg = load_config()
    
    new_url = None
    if cfg and cfg.mode in ("single", "server") and cfg.db_name and cfg.db_user:
        new_url = f"postgresql://{cfg.db_user}:{cfg.db_password or ''}@{cfg.db_host}:{cfg.db_port}/{cfg.db_name}"
    else:
        # Client or unconfigured: No DB engine
        new_url = None
    
    engine = create_new_engine(new_url)
    if engine:
        SessionLocal.configure(bind=engine)
    return engine

# Base class for the ORM models
Base = declarative_base()

# FastAPI Dependency
def get_db():
    if not engine:
        # In setup phase, we might not have an engine yet.
        # We yield None, and routers that need a real DB will handle it.
        yield None
        return
        
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
