from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, cast, Date
from datetime import datetime
from typing import Optional

from database import get_db
from dependencies import require_roles, ROLE_ADMIN, ROLE_AUDIT, get_current_user, ALL_ROLES
from models import User
from generic_utils import (
    normalize_username,
    hash_password,
    ist_now,
    format_ist_to_user_date
)
from database_utils import log_user_activity

router = APIRouter()

class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: str
    full_name: Optional[str] = ""

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class PasswordUpdateRequest(BaseModel):
    password: str

@router.get("/users")
def get_users(db: Session = Depends(get_db), current_user: dict = Depends(require_roles(ROLE_ADMIN))):
    users = db.query(User).all()
    out = []
    for u in users:
        out.append({
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": bool(u.is_active),
            "created_at": u.created_at,
            "updated_at": u.updated_at
        })
    return out

@router.post("/users")
def create_user(req: UserCreateRequest, db: Session = Depends(get_db), current_user: dict = Depends(require_roles(ROLE_ADMIN))):
    username = normalize_username(req.username)
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if not req.password:
        raise HTTPException(status_code=400, detail="Password is required")
    if req.role not in ALL_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    now = ist_now()
    new_user = User(
        username=username,
        full_name=req.full_name,
        role=req.role,
        password_hash=hash_password(req.password),
        is_active=1,
        created_at=now,
        updated_at=now
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_user_activity(db, current_user, "USER_CREATED", f"Created user {username} ({req.role})")
    return {"message": "User created successfully"}

@router.put("/users/{user_id}")
def update_user(user_id: int, req: UserUpdateRequest, db: Session = Depends(get_db), current_user: dict = Depends(require_roles(ROLE_ADMIN))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.username == "admin" and user_id == current_user["id"]:
        if req.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate the main admin account")
        if req.role is not None and req.role != ROLE_ADMIN:
            raise HTTPException(status_code=400, detail="Cannot change role of main admin account")

    fields = []
    if req.role is not None:
        if req.role not in ALL_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        user.role = req.role
        fields.append(f"role to {req.role}")
        
    if req.full_name is not None:
        user.full_name = req.full_name
        fields.append(f"full_name to {req.full_name}")
        
    if req.is_active is not None:
        user.is_active = 1 if req.is_active else 0
        fields.append(f"active to {req.is_active}")

    if fields:
        user.updated_at = ist_now()
        db.commit()
        log_user_activity(db, current_user, "USER_UPDATED", f"Updated {user.username}: " + ", ".join(fields))

    return {"message": "User updated successfully"}

@router.put("/users/{user_id}/password")
def reset_password(user_id: int, req: PasswordUpdateRequest, db: Session = Depends(get_db), current_user: dict = Depends(require_roles(ROLE_ADMIN))):
    if not req.password:
        raise HTTPException(status_code=400, detail="Password is required")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(req.password)
    user.updated_at = ist_now()
    db.commit()

    log_user_activity(db, current_user, "USER_PASSWORD_RESET", f"Reset password for {user.username}")
    return {"message": "Password reset successfully"}
@router.get("/user-activity")
def get_user_activity(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db), 
    _: dict = Depends(require_roles(ROLE_ADMIN, ROLE_AUDIT))
):
    from models import UserActivityLog
    query = db.query(UserActivityLog)
    
    if from_date:
        query = query.filter(cast(UserActivityLog.performed_at, Date) >= datetime.strptime(from_date, "%Y-%m-%d").date())
    if to_date:
        query = query.filter(cast(UserActivityLog.performed_at, Date) <= datetime.strptime(to_date, "%Y-%m-%d").date())
        
    results = query.order_by(desc(UserActivityLog.performed_at), desc(UserActivityLog.id)).limit(500).all()
    
    out = []
    for l in results:
        out.append({
            "id": l.id,
            "username": l.username,
            "full_name": l.full_name,
            "role": l.role,
            "activity_type": l.activity_type,
            "details": l.details,
            "performed_at": format_ist_to_user_date(l.performed_at)
        })
    return out
