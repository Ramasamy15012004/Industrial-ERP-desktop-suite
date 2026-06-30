from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db
from models import UserSession, User

AUTH_SCHEME = HTTPBearer(auto_error=False)

ROLE_ADMIN = "admin"
ROLE_PRODUCTION = "production"
ROLE_INVENTORY = "inventory"
ROLE_AUDIT = "audit"
ALL_ROLES = {ROLE_ADMIN, ROLE_PRODUCTION, ROLE_INVENTORY, ROLE_AUDIT}

def get_current_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(AUTH_SCHEME),
    db: Session = Depends(get_db)
) -> dict:
    if not db:
        raise HTTPException(status_code=401, detail="Backend not connected to a database. Please check configuration.")

    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials.strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_record = db.query(UserSession).filter(UserSession.token == token).first()
    if not session_record:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
        
    user_record = db.query(User).filter(User.id == session_record.user_id).first()
    if not user_record:
        raise HTTPException(status_code=401, detail="Invalid session")

    if not user_record.is_active:
        raise HTTPException(status_code=401, detail="User inactive")
    if user_record.role not in ALL_ROLES:
        raise HTTPException(status_code=401, detail="Invalid user role")
    if session_record.revoked_at:
        raise HTTPException(status_code=401, detail="Token revoked")

    from generic_utils import ist_now
    
    if ist_now() > session_record.expires_at:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = {
        "id": user_record.id,
        "username": user_record.username,
        "full_name": user_record.full_name,
        "role": user_record.role
    }
    return {"id": session_record.id, "token": token, "user": user}

def get_current_user(session: dict = Depends(get_current_session)) -> dict:
    return session["user"]

def require_roles(*allowed_roles: str):
    allowed = {r for r in allowed_roles if r}

    def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] == ROLE_ADMIN:
            return user
        if allowed and user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _dep
