from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets

from database import get_db
from dependencies import get_current_user, get_current_session, AUTH_SCHEME
from models import User, UserSession
from generic_utils import (
    IST,
    normalize_username, 
    verify_password, 
    SESSION_LIFETIME_HOURS,
    ist_now
)
from database_utils import (
    log_user_activity, 
    get_trial_info, 
    is_trial_valid
)

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

@router.get("/license/trial-info")
def trial_info_endpoint(db: Session = Depends(get_db)):
    info = get_trial_info(db)
    if not info:
        return {"error": "License tracking not initialized."}
    return info

@router.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    if not is_trial_valid(db):
        raise HTTPException(status_code=403, detail="Trial expired")

    username = normalize_username(req.username)
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
        
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")

    now = ist_now()
    expires = now + timedelta(hours=SESSION_LIFETIME_HOURS)
    token = secrets.token_urlsafe(32)

    new_session = UserSession(
        user_id=user.id,
        token=token,
        created_at=now,
        expires_at=expires
    )
    db.add(new_session)
    # Perform clean up of old sessions
    db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.expires_at < now).delete()
    db.commit()

    user_dict = {"id": user.id, "username": user.username, "full_name": user.full_name, "role": user.role}

    return {
        "access_token": token,
        "user": user_dict
    }

@router.get("/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    return {"user": user}

@router.post("/auth/logout")
def logout(session: dict = Depends(get_current_session), db: Session = Depends(get_db)):
    session_record = db.query(UserSession).filter(UserSession.id == session["id"]).first()
    if session_record:
        session_record.revoked_at = ist_now()
        db.commit()
    return {"message": "Logged out successfully"}
