import secrets
import socket
from typing import Any
import httpx
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from config_utils import AppConfig

def _safe_ident(name: str) -> str:
    if not name or any(ch in name for ch in ['"', ";", " ", "'"]):
        raise ValueError(f"Invalid identifier: {name}")
    return name

def init_postgres_server(
    *,
    admin_user: str,
    admin_password: str,
    db_name: str,
    app_user: str = "app_user",
    app_password: str | None = None,
    db_host: str = "localhost",
    db_port: int = 5432,
) -> dict[str, str]:
    """
    Initializes PostgreSQL for server mode:
      - Creates database if missing
      - Creates application user with a generated password
      - Grants schema privileges
    """
    db_name = _safe_ident(db_name)
    app_user = _safe_ident(app_user)
    if not app_password:
        app_password = secrets.token_urlsafe(24)

    # 1. Connect as superuser to the 'postgres' database
    admin_url = URL.create(
        drivername="postgresql+psycopg2",
        username=admin_user,
        password=admin_password,
        host=db_host,
        port=db_port,
        database="postgres",
    )
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")

    try:
        with admin_engine.connect() as conn:
            # Create/Reset App User
            role_exists = conn.execute(
                text("SELECT 1 FROM pg_roles WHERE rolname = :name"), {"name": app_user}
            ).scalar()
            if not role_exists:
                conn.execute(text(f'CREATE USER "{app_user}" WITH PASSWORD :pwd'), {"pwd": app_password})
            else:
                conn.execute(text(f'ALTER USER "{app_user}" WITH PASSWORD :pwd'), {"pwd": app_password})

            # Create Database
            db_exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": db_name}
            ).scalar()
            if not db_exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))

            # Grant DB Privileges
            conn.execute(text(f'GRANT ALL PRIVILEGES ON DATABASE "{db_name}" TO "{app_user}"'))
    finally:
        admin_engine.dispose()

    # 2. Connect to the new database as superuser to grant schema-level privileges
    db_admin_url = URL.create(
        drivername="postgresql+psycopg2",
        username=admin_user,
        password=admin_password,
        host=db_host,
        port=db_port,
        database=db_name,
    )
    db_admin_engine = create_engine(db_admin_url, isolation_level="AUTOCOMMIT")
    try:
        with db_admin_engine.connect() as conn:
            conn.execute(text(f'GRANT USAGE, CREATE ON SCHEMA public TO "{app_user}"'))
            conn.execute(text(f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{app_user}"'))
            conn.execute(text(f'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "{app_user}"'))
    finally:
        db_admin_engine.dispose()

    return {"db_user": app_user, "db_password": app_password}

def guess_local_ipv4() -> str | None:
    try:
        # UDP connect reads local routing table without sending any data.
        # Use a non-routable address so this works completely offline.
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        try:
            s.connect(("10.254.254.254", 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = "127.0.0.1"
        finally:
            s.close()
        return ip
    except Exception:
        return "127.0.0.1"

async def discover_servers_on_lan(
    *,
    port: int = 8000,
    timeout_s: float = 0.5,
    concurrency: int = 128,
) -> list[dict[str, Any]]:
    import asyncio
    local_ip = guess_local_ipv4()
    if not local_ip or local_ip == "127.0.0.1":
        return []
    
    # Simple /24 scan
    base = ".".join(local_ip.split(".")[:-1])
    hosts = [f"{base}.{i}" for i in range(1, 255)]
    
    results = []
    sem = asyncio.Semaphore(concurrency)
    
    async def probe(host: str, client: httpx.AsyncClient):
        url = f"http://{host}:{port}/api/health"
        async with sem:
            try:
                r = await client.get(url)
                if r.status_code == 200:
                    data = r.json()
                    if data.get("mode") == "server":
                        results.append({"ip": host, "health": data})
            except Exception:
                pass

    async with httpx.AsyncClient(timeout=timeout_s) as client:
        await asyncio.gather(*(probe(h, client) for h in hosts))
    return results
