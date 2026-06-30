import base64
import hashlib
import hmac
import secrets
import os
import re
from typing import Any, List, Optional, Tuple
from datetime import datetime, timedelta, timezone

PBKDF2_ITERATIONS = int(os.getenv("PBKDF2_ITERATIONS", "210000"))
SESSION_LIFETIME_HOURS = int(os.getenv("SESSION_LIFETIME_HOURS", "1"))

IST = timezone(timedelta(hours=5, minutes=30))

PURCHASE_UPLOAD_HEADER_ALIASES = {
    "part_name": ("part_name", "bo_part_name", "partname", "item_name"),
    "article_number": ("article_number", "article_no", "article_num", "article", "articlecode", "article_code"),
    "make": ("make", "brand", "manufacturer"),
    "qty": ("qty", "quantity"),
    "minimum_stock": ("minimum_stock", "minimum_qty", "min_stock", "min_qty", "minimumquantity", "minimumstock"),
    "lead_days": ("lead_days", "lead_day", "leadtime", "lead_time"),
    "price": ("price", "rate", "unit_price"),
}

def ist_now() -> datetime:
    """Returns now in IST as a naive datetime object (suitable for DB storage)."""
    return datetime.now(IST).replace(tzinfo=None)

def ist_datetime() -> datetime:
    """Standardized function for ORM defaults and log timestamps."""
    return ist_now()

def ist_datetime_str() -> str:
    """Legacy: Returns now in IST as a formatted string."""
    return ist_now().strftime("%Y-%m-%d %H:%M:%S")

def format_ist_to_user_date(value: Any) -> str:
    """Formats a datetime object or string to DD/MM/YYYY HH:MM:SS."""
    if not value:
        return ""
    
    dt = value
    if isinstance(value, str):
        try:
            # Standard format is YYYY-MM-DD HH:MM:SS
            if " " in value and "T" not in value:
                dt = datetime.strptime(value.split(".")[0], "%Y-%m-%d %H:%M:%S")
            else:
                # Handle ISO format with T
                iso_str = value.replace("Z", "+00:00").replace(" ", "T")
                dt = datetime.fromisoformat(iso_str)
        except Exception:
            return value # Fallback

    try:
        return dt.strftime("%d/%m/%Y %H:%M:%S")
    except Exception:
        return str(value)

def ist_date() -> datetime:
    """Returns today's date at midnight as a naive datetime object."""
    now = ist_now()
    return datetime(now.year, now.month, now.day)

def ist_date_str() -> str:
    """Legacy: Returns today's date in IST as YYYY-MM-DD string."""
    return ist_now().strftime("%Y-%m-%d")

def normalize_username(username: str) -> str:
    return (username or "").strip().lower()

def normalize_ci_text(value: Any) -> str:
    return str(value or "").strip().lower()

def normalize_part_article_key(part_name: Any, article_number: Any) -> Tuple[str, str]:
    return (
        normalize_ci_text(part_name),
        normalize_ci_text(article_number),
    )

def normalize_product_details(value: Any) -> str:
    return normalize_ci_text(value)

def normalize_material_key(part_name: Any, article_number: Any, make: Any) -> Tuple[str, str, str]:
    return (
        normalize_ci_text(part_name),
        normalize_ci_text(article_number),
        normalize_ci_text(make),
    )

def normalize_upload_column_name(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "_").replace(".", "").replace(":", "")

def parse_optional_float(value: Any, *, default: float = 0.0) -> float:
    raw = str(value or "").strip()
    if raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default

def parse_optional_int(value: Any, *, default: int = 0) -> int:
    raw = str(value or "").strip()
    if raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default

def get_purchase_upload_value(row: dict[str, str], field_name: str) -> str:
    if field_name not in PURCHASE_UPLOAD_HEADER_ALIASES:
        return ""
    for alias in PURCHASE_UPLOAD_HEADER_ALIASES[field_name]:
        if alias in row:
            return str(row.get(alias, "") or "").strip()
    return ""

def is_generic_purchase_article(article_number: Any) -> bool:
    return normalize_ci_text(article_number) in {"std", "local"}

def normalize_lead_days_value(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in ("", "0", "0.0", "none", "null"):
        return ""
    if re.fullmatch(r"\d+", raw):
        return f"{raw}d"
    return raw.replace(" ", "")

def validate_lead_days_value(value: Any, *, row_label: str) -> str:
    normalized = normalize_lead_days_value(value)
    if normalized and not re.fullmatch(r"\d+[dw]", normalized):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"{row_label}: lead_days must be like 5d or 2w")
    return normalized

def count_part_name_difference(left: Any, right: Any) -> int:
    left_text = normalize_ci_text(left)
    right_text = normalize_ci_text(right)
    if left_text == right_text:
        return 0

    min_len = min(len(left_text), len(right_text))
    char_diffs = sum(1 for a, b in zip(left_text, right_text) if a != b)
    len_diff = abs(len(left_text) - len(right_text))
    return char_diffs + len_diff

def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")

def _b64url_decode(s: str) -> bytes:
    padded = s + "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))

def hash_password(password: str, *, iterations: int = PBKDF2_ITERATIONS) -> str:
    if not isinstance(password, str) or not password:
        raise ValueError("Password must be a non-empty string")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${_b64url_encode(salt)}${_b64url_encode(dk)}"

def normalize_plan_date(plan_date: str | None, *, allow_today: bool = True) -> str:
    today = ist_now().date()
    if plan_date is None:
        return today.strftime("%Y-%m-%d")
    try:
        parsed = datetime.strptime(str(plan_date).strip(), "%Y-%m-%d").date()
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="plan_date must be YYYY-MM-DD")
    if parsed < today:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="plan_date cannot be in the past")
    if not allow_today and parsed == today:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="plan_date must be a future date")
    return parsed.strftime("%Y-%m-%d")

def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters_s, salt_s, hash_s = (stored or "").split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iters_s)
        salt = _b64url_decode(salt_s)
        expected = _b64url_decode(hash_s)
    except Exception:
        return False

    computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters)
    return hmac.compare_digest(computed, expected)

def derive_product_details_from_filename(filename: Any) -> str:
    raw_name = str(filename or "").strip()
    raw_name = re.sub(r'(?i)\.(csv|xlsx|xls)$', '', raw_name).strip()
    raw_name = re.sub(r'(?i)(?:[\s_-]+)(?:bom|bo)\s*$', '', raw_name).strip()
    return raw_name.strip("_- ")
