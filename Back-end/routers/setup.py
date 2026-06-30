from fastapi import APIRouter, Depends, HTTPException, Request, Body
from typing import Any, Literal
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, text
import os

from database import get_db, Base, refresh_engine
from config_utils import load_config, save_config, AppConfig, AppMode
from server_utils import init_postgres_server, guess_local_ipv4, discover_servers_on_lan
from models import AllowedClient, SchemaVersion
from database_utils import seed_default_users

router = APIRouter(prefix="/api")

class SetupRequest(BaseModel):
    mode: Literal["single", "server", "client"]
    api_port: int = 8000
    server_ip: str | None = None
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str | None = None
    db_user: str | None = None
    db_password: str | None = None
    pg_admin_user: str | None = None
    pg_admin_password: str | None = None
    username: str | None = None
    password: str | None = None

class AllowedClientCreate(BaseModel):
    client_name: str = Field(..., min_length=1, max_length=200)
    ip_address: str = Field(..., min_length=3, max_length=64)

@router.get("/config")
def get_config():
    cfg = load_config()
    if not cfg:
        return {"configured": False}
    
    data = cfg.__dict__.copy()
    if data.get("db_password"):
        data["db_password"] = "********"
    if data.get("password"):
        data["password"] = "********"
    data["configured"] = True
    return data

@router.get("/health")
def health(db: Session = Depends(get_db)):
    cfg = load_config()
    if not cfg:
        return {
            "status": "ok",
            "configured": False,
            "mode": None,
            "local_ip": guess_local_ipv4(),
        }

    db_ok = True
    if not db:
        db_ok = False
    else:
        try:
            db.execute(text("SELECT 1")).scalar()
        except Exception:
            db_ok = False

    return {
        "status": "ok",
        "configured": True,
        "mode": cfg.mode,
        "server_ip": cfg.server_ip,
        "api_port": cfg.api_port,
        "db_ok": db_ok,
    }

@router.post("/setup")
def setup(request: Request, req: SetupRequest = Body(...)):
    existing = load_config()
    # Lock setup if already configured and not accessed via localhost
    if existing:
        client_ip = request.client.host if request.client else ""
        if client_ip not in {"127.0.0.1", "::1"}:
            raise HTTPException(status_code=403, detail="Setup is locked. Run from the server machine.")

    if req.mode == "client":
        cfg_dict = {
            "mode": "client",
            "server_ip": req.server_ip,
            "api_port": req.api_port,
        }
        save_config(cfg_dict)
        return {"ok": True}
        

    if not req.db_name:
        raise HTTPException(status_code=400, detail="db_name is required")

    if req.mode == "single":
        if not req.db_user or not req.db_password:
            raise HTTPException(status_code=400, detail="db_user and db_password are required")
        
        # 1. Initialize/Create the database and user first (as admin)
        # In single mode, we assume the user is providing their PG admin credentials or 
        # credentials with sufficient privs to create a DB.
        try:
            init_postgres_server(
                admin_user=req.db_user,
                admin_password=req.db_password,
                db_name=req.db_name,
                app_user=req.db_user, # Use same user for app
                app_password=req.db_password,
                db_host=req.db_host,
                db_port=req.db_port,
            )
        except Exception as e:
            # If the user already exists or the DB already exists, init_postgres_server 
            # handles it or might throw if credentials are wrong.
            pass

        cfg_dict = {
            "mode": "single",
            "db_host": req.db_host,
            "db_port": req.db_port,
            "db_name": req.db_name,
            "db_user": req.db_user,
            "db_password": req.db_password,
            "api_port": req.api_port,
        }
        save_config(cfg_dict)
        
        # 2. Refresh engine so we can create tables
        new_engine = refresh_engine()
        if new_engine:
            Base.metadata.create_all(bind=new_engine)
            # Seed default users
            from sqlalchemy.orm import sessionmaker
            SessionLocal = sessionmaker(bind=new_engine)
            db = SessionLocal()
            try:
                seed_default_users(db)
            finally:
                db.close()
        
        return {"ok": True}

    # server mode
    if not req.pg_admin_user or not req.pg_admin_password:
        raise HTTPException(status_code=400, detail="pg_admin_user/pg_admin_password are required")
    if not req.server_ip:
        raise HTTPException(status_code=400, detail="server_ip is required")

    created = init_postgres_server(
        admin_user=req.pg_admin_user,
        admin_password=req.pg_admin_password,
        db_name=req.db_name,
        app_user="app_user",
        db_host=req.db_host,
        db_port=req.db_port,
    )
    
    cfg_dict = {
        "mode": "server",
        "server_ip": req.server_ip,
        "api_port": req.api_port,
        "db_host": req.db_host,
        "db_port": req.db_port,
        "db_name": req.db_name,
        "db_user": created["db_user"],
        "db_password": created["db_password"],
    }
    
    # Auto-allow server self
    save_config(cfg_dict)
    
    # Refresh engine so the next request (and metadata creation) can use it
    new_engine = refresh_engine()
    if new_engine:
        Base.metadata.create_all(bind=new_engine)
        # Seed default users
        from sqlalchemy.orm import sessionmaker
        SessionLocal = sessionmaker(bind=new_engine)
        db = SessionLocal()
        try:
            seed_default_users(db)
        finally:
            db.close()
    
    return {"ok": True, "generated_db_password": created["db_password"]}

@router.get("/allowed-clients")
def get_allowed_clients(db: Session = Depends(get_db)):
    cfg = load_config()
    if not cfg or cfg.mode != "server":
        raise HTTPException(status_code=400, detail="Not in server mode")
    
    if not db:
        return {"items": []}
    
    clients = db.query(AllowedClient).order_by(AllowedClient.id.asc()).all()
    return {
        "items": [
            {
                "id": c.id,
                "client_name": c.client_name,
                "ip_address": c.ip_address,
                "created_at": c.created_at.isoformat()
            } for c in clients
        ]
    }

@router.post("/allowed-clients")
def create_allowed_client(payload: AllowedClientCreate, db: Session = Depends(get_db)):
    cfg = load_config()
    if not cfg or cfg.mode != "server":
        raise HTTPException(status_code=400, detail="Not in server mode")
    
    if not db:
        raise HTTPException(status_code=400, detail="Database not initialized")

    existing = db.query(AllowedClient).filter(AllowedClient.ip_address == payload.ip_address).first()
    if existing:
        existing.client_name = payload.client_name
    else:
        new_client = AllowedClient(client_name=payload.client_name, ip_address=payload.ip_address)
        db.add(new_client)
    
    db.commit()
    return {"ok": True}

@router.delete("/allowed-clients/{client_id}")
def delete_allowed_client(client_id: int, db: Session = Depends(get_db)):
    cfg = load_config()
    if not cfg or cfg.mode != "server":
        raise HTTPException(status_code=400, detail="Not in server mode")
    
    if not db:
        raise HTTPException(status_code=400, detail="Database not initialized")

    client = db.query(AllowedClient).filter(AllowedClient.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    db.delete(client)
    db.commit()
    return {"ok": True}

@router.get("/discover")
async def discover(port: int = 8000):
    items = await discover_servers_on_lan(port=port)
    return {"items": items}

@router.post("/setup/reset")
async def reset_system_config(request: Request):
    """Deletes the local config.json to allow re-running setup."""
    client_ip = request.client.host if request.client else ""
    if client_ip not in {"127.0.0.1", "::1"}:
        raise HTTPException(status_code=403, detail="Reset only allowed from the local machine.")
    
    from config_utils import reset_config
    if reset_config():
        return {"status": "reset successful"}
    return {"status": "no config found to reset"}
