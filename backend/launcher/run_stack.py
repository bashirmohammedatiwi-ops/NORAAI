"""
Start the native NORAAI stack for the desktop EXE (Postgres, Redis, MinIO, API, Celery).

Usage (from repo root):
  backend\\.venv\\Scripts\\python.exe backend\\launcher\\run_stack.py
"""
from __future__ import annotations

import atexit
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path


def _root() -> Path:
    env = os.environ.get("NORAAI_ROOT")
    if env:
        return Path(env).resolve()
    return Path(__file__).resolve().parents[2]


ROOT = _root()
TOOLS = ROOT / "tools" / "native"
BACKEND = ROOT / "backend"
PY = BACKEND / ".venv" / "Scripts" / "python.exe"
ENV_FILE = ROOT / ".env.desktop"
if not ENV_FILE.is_file():
    ENV_FILE = ROOT / ".env.native"

PROCS: list[subprocess.Popen] = []


def _port_open(port: int, host: str = "127.0.0.1", timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _start(name: str, cmd: list[str], *, cwd: Path | None = None, env: dict | None = None) -> subprocess.Popen:
    print(f"[stack] starting {name}...", flush=True)
    merged = os.environ.copy()
    if env:
        merged.update(env)
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd or ROOT),
        env=merged,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
    )
    PROCS.append(proc)
    return proc


def _stop_all() -> None:
    for proc in reversed(PROCS):
        if proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass
    time.sleep(1)
    for proc in PROCS:
        if proc.poll() is None:
            try:
                proc.kill()
            except Exception:
                pass
    pg_ctl = TOOLS / "postgresql" / "bin" / "pg_ctl.exe"
    pg_data = TOOLS / "pgdata"
    if pg_ctl.is_file():
        subprocess.run([str(pg_ctl), "-D", str(pg_data), "stop", "-m", "fast"], capture_output=True)


def _ensure_env() -> None:
    target = BACKEND / ".env"
    if ENV_FILE.is_file():
        target.write_bytes(ENV_FILE.read_bytes())
    static = ROOT / "frontend" / "dist"
    if static.is_dir():
        lines = target.read_text(encoding="utf-8").splitlines() if target.is_file() else []
        kv: dict[str, str] = {}
        for line in lines:
            if "=" in line and not line.strip().startswith("#"):
                key, val = line.split("=", 1)
                kv[key.strip()] = val.strip()
        kv["STATIC_FRONTEND_DIR"] = str(static).replace("\\", "/")
        kv["DESKTOP_MODE"] = "true"
        kv["PUBLIC_URL"] = "http://127.0.0.1:8000"
        target.write_text("\n".join(f"{k}={v}" for k, v in kv.items()) + "\n", encoding="utf-8")


def main() -> int:
    if not PY.is_file():
        print(f"Python venv missing: {PY}", file=sys.stderr)
        return 1
    if not (TOOLS / "redis" / "redis-server.exe").is_file():
        print("Run scripts/install_native.ps1 first", file=sys.stderr)
        return 1

    _ensure_env()
    atexit.register(_stop_all)
    signal.signal(signal.SIGINT, lambda *_: (_stop_all(), sys.exit(0)))
    signal.signal(signal.SIGTERM, lambda *_: (_stop_all(), sys.exit(0)))

    pg_bin = TOOLS / "postgresql" / "bin"
    pg_data = TOOLS / "pgdata"
    if not _port_open(5432):
        pg_ctl = pg_bin / "pg_ctl.exe"
        log = TOOLS / "postgres.log"
        subprocess.run(
            [str(pg_ctl), "-D", str(pg_data), "-l", str(log), "start", "-o", "-p 5432"],
            check=False,
        )
        for _ in range(60):
            if _port_open(5432):
                break
            time.sleep(1)

    if not _port_open(6379):
        _start("redis", [str(TOOLS / "redis" / "redis-server.exe")], cwd=TOOLS / "redis")

    if not _port_open(9000):
        minio_data = TOOLS / "minio-data"
        minio_data.mkdir(parents=True, exist_ok=True)
        _start(
            "minio",
            [str(TOOLS / "minio" / "minio.exe"), "server", str(minio_data), "--address", ":9000", "--console-address", ":9001"],
            cwd=TOOLS / "minio",
            env={"MINIO_ROOT_USER": "minioadmin", "MINIO_ROOT_PASSWORD": "minioadmin"},
        )

    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND)
    subprocess.run([str(PY), "scripts/init_db.py"], cwd=str(BACKEND), env=env, check=False)

    if not _port_open(8000):
        _start(
            "api",
            [str(PY), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=BACKEND,
            env=env,
        )

    _start(
        "celery",
        [
            str(PY), "-m", "celery", "-A", "workers.celery_app", "worker",
            "-P", "solo",
            "-Q", "ingestion,labeling,training,monitor,reports",
            "--prefetch-multiplier=1",
            "--loglevel=info",
            "-n", f"desktop@{os.environ.get('COMPUTERNAME', 'local')}",
        ],
        cwd=BACKEND,
        env=env,
    )

    for _ in range(90):
        if _port_open(8000):
            print("[stack] ready http://127.0.0.1:8000", flush=True)
            break
        time.sleep(1)
    else:
        print("[stack] API did not become ready", file=sys.stderr)
        return 1

    print("[stack] running — Ctrl+C to stop", flush=True)
    try:
        while True:
            time.sleep(2)
            dead = [p for p in PROCS if p.poll() is not None]
            if dead and len(dead) == len(PROCS):
                print("[stack] all processes exited", file=sys.stderr)
                return 1
    except KeyboardInterrupt:
        pass
    finally:
        _stop_all()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
