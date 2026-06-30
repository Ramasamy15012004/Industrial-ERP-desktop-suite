import json
import os
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

AppMode = Literal["single", "server", "client"]

def project_root() -> Path:
    if getattr(sys, 'frozen', False):
        # Save config in APPDATA so it's always writable (avoids Program Files restrictions)
        app_data = os.environ.get("APPDATA", "")
        if app_data:
            config_dir = Path(app_data) / "com.pims.app"
            config_dir.mkdir(parents=True, exist_ok=True)
            return config_dir
        # Fallback to exe directory if APPDATA not available
        return Path(sys.executable).parent
    # If running as a script, use the script directory
    return Path(__file__).resolve().parent

def config_path() -> Path:
    override = os.getenv("APP_CONFIG_PATH")
    if override:
        return Path(override).expanduser().resolve()
    return project_root() / "config.json"

_CONFIG_LOCK = threading.Lock()

@dataclass(frozen=True)
class AppConfig:
    mode: AppMode

    # Common
    server_ip: str | None = None
    api_port: int = 8000

    # Database
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str | None = None
    db_user: str | None = None
    db_password: str | None = None

    # Client-only (optional auth)
    username: str | None = None
    password: str | None = None

def _validate_mode(raw: Any) -> AppMode:
    if raw in ("single", "server", "client"):
        return raw
    return "single"

def load_config() -> AppConfig | None:
    path = config_path()
    if not path.exists():
        return None

    try:
        with _CONFIG_LOCK:
            data = json.loads(path.read_text(encoding="utf-8"))
        
        mode = _validate_mode(data.get("mode"))
        return AppConfig(
            mode=mode,
            server_ip=data.get("server_ip"),
            api_port=int(data.get("api_port", 8000)),
            db_host=data.get("db_host", "localhost"),
            db_port=int(data.get("db_port", 5432)),
            db_name=data.get("db_name"),
            db_user=data.get("db_user"),
            db_password=data.get("db_password"),
            username=data.get("username"),
            password=data.get("password"),
        )
    except Exception:
        return None

def save_config(data: dict[str, Any]) -> AppConfig:
    mode = _validate_mode(data.get("mode"))
    path = config_path()
    with _CONFIG_LOCK:
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    
    return load_config()

def reset_config() -> bool:
    path = config_path()
    with _CONFIG_LOCK:
        if path.exists():
            path.unlink()
            return True
    return False
