import json
import os
import subprocess
import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import sys

def get_project_root() -> Path:
    # Determine the absolute path where we are executing from
    if getattr(sys, 'frozen', False):
        # When bundled into an .exe via PyInstaller
        base_dir = Path(sys.executable).parent
        
        # When bundled by Tauri, resources might be tucked into child directories
        # Let's actively look into typical Tauri resource folders
        for folder_path in base_dir.rglob('*'):
            if folder_path.is_dir() and (folder_path / "docker-compose.yml").exists():
                return folder_path
                
        if (base_dir / "docker-compose.yml").exists():
            return base_dir
            
    else:
        # When running as a normal .py script
        base_dir = Path(__file__).resolve().parent

    # Traverse upwards looking for docker-compose.yml
    current = base_dir
    while current != current.parent:
        if (current / "docker-compose.yml").exists():
            return current
        current = current.parent
        
    # Fallback to the executable directory if we can't find it exactly
    return base_dir

PROJECT_ROOT = get_project_root()
ALLOWED_PROFILES = {"single", "server", "client"}
TOKEN = os.getenv("DOCKER_CONTROL_TOKEN")
PROJECT_NAME = "pims"


def check_docker_running() -> bool:
    """Return True if Docker daemon is reachable."""
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except Exception:
        return False

JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


def _append_job_log(job_id: str, line: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job["log"] += line


def _set_job_status(job_id: str, status: str, exit_code: int | None = None):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job["status"] = status
        if exit_code is not None:
            job["exit_code"] = exit_code


def _run_compose_async(job_id: str, profile: str):
    if not check_docker_running():
        _append_job_log(
            job_id,
            "ERROR: Docker Desktop is not running.\n"
            "Please start Docker Desktop and click 'Build & Start (Docker)' again.\n",
        )
        _set_job_status(job_id, "failed", exit_code=1)
        return

    args = ["docker", "compose", "-p", PROJECT_NAME, "--profile", profile, "up", "--build", "-d"]
    process = subprocess.Popen(
        args,
        cwd=str(PROJECT_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    _set_job_status(job_id, "running")
    try:
        if process.stdout:
            for line in process.stdout:
                _append_job_log(job_id, line)
        code = process.wait()
        _set_job_status(job_id, "finished", exit_code=code)
    except Exception as exc:
        _append_job_log(job_id, f"\nERROR: {exc}\n")
        _set_job_status(job_id, "failed", exit_code=1)


def start_compose_job(profile: str) -> str:
    job_id = str(uuid.uuid4())
    with JOBS_LOCK:
        JOBS[job_id] = {
            "profile": profile,
            "status": "queued",
            "exit_code": None,
            "log": "",
        }
    thread = threading.Thread(
        target=_run_compose_async,
        args=(job_id, profile),
        daemon=True,
    )
    thread.start()
    return job_id


def run_compose(profile: str, command: str) -> tuple[int, str, str]:
    args = ["docker", "compose", "-p", PROJECT_NAME, "--profile", profile, command]
    if command == "up":
        args.extend(["--build", "-d"])
    result = subprocess.run(
        args,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, Accept, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return None
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw)

    def _authorize(self) -> bool:
        if not TOKEN:
            return True
        provided = self.headers.get("X-Api-Key")
        return provided == TOKEN

    def do_GET(self):
        if self.path.startswith("/status"):
            parts = self.path.split("?", 1)
            query = parts[1] if len(parts) > 1 else ""
            job_id = None
            for token in query.split("&"):
                if token.startswith("job_id="):
                    job_id = token.split("=", 1)[1]
                    break
            if not job_id:
                self._send(400, {"ok": False, "error": "job_id is required"})
                return
            with JOBS_LOCK:
                job = JOBS.get(job_id)
            if not job:
                self._send(404, {"ok": False, "error": "Job not found"})
                return
            self._send(200, {"ok": True, "job": job})
            return

        if self.path != "/health":
            self._send(404, {"ok": False, "error": "Not found"})
            return
        self._send(200, {"ok": True})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, Accept, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_POST(self):
        if not self._authorize():
            self._send(401, {"ok": False, "error": "Unauthorized"})
            return

        if self.path not in {"/run", "/stop"}:
            self._send(404, {"ok": False, "error": "Not found"})
            return

        try:
            data = self._read_json() or {}
        except Exception:
            self._send(400, {"ok": False, "error": "Invalid JSON"})
            return

        profile = str(data.get("profile", "single")).strip().lower()
        if profile not in ALLOWED_PROFILES:
            self._send(400, {"ok": False, "error": "Invalid profile"})
            return

        if self.path == "/run":
            job_id = start_compose_job(profile)
            self._send(200, {"ok": True, "job_id": job_id})
            return

        command = "down"
        code, out, err = run_compose(profile, command)
        if code != 0:
            self._send(
                500,
                {
                    "ok": False,
                    "error": "Docker command failed",
                    "stdout": out,
                    "stderr": err,
                },
            )
            return

        self._send(200, {"ok": True, "stdout": out, "stderr": err})


def main():
    server = HTTPServer(("127.0.0.1", 8765), Handler)
    print("Docker control service running on http://127.0.0.1:8765")
    server.serve_forever()


if __name__ == "__main__":
    main()
