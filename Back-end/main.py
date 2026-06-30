import threading
import uvicorn
import sys
import time
import os
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

# Local imports
from config_utils import load_config, AppConfig
from database import engine, Base, get_db
from routers import users
import models

from contextlib import asynccontextmanager

from routers import auth
from routers import dashboard
from routers import fixtures
from routers import inventory
from routers import jobs
from routers import production
from routers import products
from routers import reports
from routers import setup

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    cfg = load_config()
    if cfg and cfg.mode in ("single", "server") and engine:
        try:
            from database import Base
            Base.metadata.create_all(bind=engine)
        except Exception as e:
            print(f"Startup warning: Could not initialize database tables: {e}")
    yield
    # Shutdown logic (if any)

# 1. Initialize FastAPI instance
app = FastAPI(title="Production & Inventory Control System", version="1.0.0", lifespan=lifespan)

# Allow browser clients (local dev UI and remote clients) to access the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. CORS Middleware - Dynamic for Pure Client Architecture
@app.middleware("http")
async def dynamic_cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin")

    # Handle preflight (OPTIONS)
    if request.method == "OPTIONS":
        response = JSONResponse(content="ok")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
        else:
            response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Api-Key, Accept, Origin"
        return response

    response = await call_next(request)

    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Api-Key, Accept, Origin"

    return response

# 3. IP Allowlist Middleware (for Server Mode)
EXEMPT_PATHS = {"/api/health", "/api/config", "/api/setup", "/api/discover"}

@app.middleware("http")
async def ip_allowlist_middleware(request: Request, call_next):
    cfg = load_config()
    # ONLY run this security check on the Server machine
    if cfg and cfg.mode == "server" and request.url.path not in EXEMPT_PATHS:
        client_ip = request.client.host if request.client else "unknown"
        try:
            db = next(get_db())
            if db:
                try:
                    from models import AllowedClient
                    allowed = db.query(AllowedClient).filter(AllowedClient.ip_address == client_ip).first()
                    
                    # Security logic:
                    # 1. Allow localhost
                    # 2. Allow the server's own IP
                    # 3. Allow explicitly registered clients
                    is_server_node = client_ip in {"127.0.0.1", "::1", cfg.server_ip}
                    
                    if not allowed and not is_server_node:
                        print(f"[SECURITY REJECT] IP {client_ip} attempted to access {request.url.path}")
                        return JSONResponse(status_code=403, content={"detail": f"Unauthorized Client: IP {client_ip} is not in the allowed list."})
                finally:
                    db.close()
        except Exception as e:
            # If DB is not ready, we allow the request (e.g. initial health check during setup)
            # but log the exception for debugging
            pass
            
    return await call_next(request)

# 4. Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(inventory.router)
app.include_router(fixtures.router)
app.include_router(jobs.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(production.router)
app.include_router(products.router)
app.include_router(setup.router)

# 5. Global Shutdown Handle
SHUTDOWN_EVENT = threading.Event()

@app.post("/shutdown")
def shutdown_backend():
    SHUTDOWN_EVENT.set()
    return {"status": "backend stopping"}

# 7. Main Execution
if __name__ == "__main__":
    # Get port from config if available
    cfg = load_config()
    port = cfg.api_port if cfg else 8000
    
    config = uvicorn.Config(
        app,
        host="0.0.0.0", # Allow external connections
        port=port,
        log_config=None,
        workers=1
    )
    server = uvicorn.Server(config)

    def watch_shutdown():
        while not SHUTDOWN_EVENT.is_set():
            time.sleep(0.5)
        server.should_exit = True

    watcher = threading.Thread(target=watch_shutdown, daemon=True)
    watcher.start()

    server.run()
    sys.exit(0)
