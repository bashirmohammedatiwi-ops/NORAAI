#!/usr/bin/env python3
"""Download the mobile-deployed ONNX model from VPS for local Vision Studio."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = ROOT / "models" / "pretrained" / "mobile"
DEFAULT_SERVER = os.environ.get("NURAI_SERVER_URL", "http://187.127.88.146:8080")
DEFAULT_PROJECT = os.environ.get(
    "NURAI_PROJECT_ID",
    "552940b4-63e0-457f-a762-71a2e8abe111",
)


def _request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    timeout: float = 120,
) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers.items()), resp.read()
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        raise RuntimeError(f"HTTP {exc.code}: {payload.decode('utf-8', errors='replace')}") from exc


def register_device(server: str, project_id: str) -> str:
    device_id = f"studio-dl-{int(time.time())}-{secrets.token_hex(3)}"
    payload = json.dumps({"device_id": device_id, "vehicle_id": "STUDIO"}).encode("utf-8")
    _, _, raw = _request(
        f"{server.rstrip('/')}/api/v1/fleet/{project_id}",
        method="POST",
        body=payload,
        timeout=30,
    )
    data = json.loads(raw)
    api_key = data.get("api_key")
    if not api_key:
        raise RuntimeError(f"Fleet register failed: {data}")
    return str(api_key)


def fetch_manifest(server: str, api_key: str) -> dict:
    _, _, raw = _request(
        f"{server.rstrip('/')}/api/v1/driver/model/manifest",
        headers={"X-Device-Key": api_key},
        timeout=120,
    )
    return json.loads(raw)


def download_model(server: str, api_key: str, dest: Path, expected_bytes: int | None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".onnx.part")
    offset = tmp.stat().st_size if tmp.exists() else 0
    if offset > 0 and expected_bytes and offset >= expected_bytes:
        tmp.unlink(missing_ok=True)
        offset = 0

    while True:
        headers = {"X-Device-Key": api_key}
        offset = tmp.stat().st_size if tmp.exists() else 0
        if offset > 0:
            headers["Range"] = f"bytes={offset}-"
        req = urllib.request.Request(
            f"{server.rstrip('/')}/api/v1/driver/model/download",
            headers=headers,
            method="GET",
        )
        mode = "ab" if offset > 0 else "wb"
        try:
            with urllib.request.urlopen(req, timeout=600) as resp, tmp.open(mode) as out:
                while True:
                    chunk = resp.read(256 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
        except urllib.error.HTTPError as exc:
            if exc.code == 416 and expected_bytes and tmp.exists():
                if tmp.stat().st_size >= expected_bytes:
                    break
            raise RuntimeError(f"Download failed HTTP {exc.code}: {exc.read()}") from exc
        except (urllib.error.URLError, TimeoutError, ConnectionResetError, OSError) as exc:
            if tmp.exists():
                offset = tmp.stat().st_size
                print(f"  … interrupted ({exc}), retry from byte {offset}", file=sys.stderr)
                time.sleep(3)
                continue
            raise RuntimeError(f"Download failed: {exc}") from exc

        if expected_bytes and tmp.stat().st_size < expected_bytes:
            print(
                f"  … incomplete ({tmp.stat().st_size}/{expected_bytes}), resume…",
                file=sys.stderr,
            )
            time.sleep(3)
            continue
        break

    if expected_bytes and tmp.stat().st_size < expected_bytes:
        raise RuntimeError(
            f"Download incomplete after {max_attempts} attempts: "
            f"{tmp.stat().st_size}/{expected_bytes} bytes"
        )

    if dest.exists():
        dest.unlink()
    tmp.rename(dest)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_sidecars(out_dir: Path, stem: str, manifest: dict) -> None:
    classes = [str(c) for c in manifest.get("classes") or []]
    image_size = int(manifest.get("image_size") or 640)
    resize_mode = str(manifest.get("resize_mode") or "letterbox").lower()
    classes_path = out_dir / f"{stem}.classes.json"
    manifest_path = out_dir / f"{stem}.manifest.json"
    classes_path.write_text(
        json.dumps(
            {"classes": classes, "image_size": image_size, "resize_mode": resize_mode},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    manifest_path.write_text(
        json.dumps(
            {
                "model_name": manifest.get("model_name") or stem,
                "artifact_id": manifest.get("artifact_id"),
                "architecture": manifest.get("architecture"),
                "version": manifest.get("version"),
                "sha256": manifest.get("sha256"),
                "format": "onnx",
                "image_size": image_size,
                "resize_mode": resize_mode,
                "classes": classes,
                "model_size_mb": manifest.get("model_size_mb"),
                "model_bytes": manifest.get("model_bytes"),
                "source": "mobile-app",
                "description": "Downloaded from VPS mobile deployment",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Download mobile ONNX from VPS")
    parser.add_argument("--server", default=DEFAULT_SERVER)
    parser.add_argument("--project-id", default=DEFAULT_PROJECT)
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--name", default="main-model", help="Output stem (main-model.onnx)")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    stem = args.name.strip()
    dest = out_dir / f"{stem}.onnx"

    print(f"Server:  {args.server}")
    print(f"Project: {args.project_id}")
    api_key = register_device(args.server, args.project_id)
    manifest = fetch_manifest(args.server, api_key)
    expected_sha = str(manifest.get("sha256") or "").lower()
    expected_bytes = int(manifest.get("model_bytes") or 0) or None
    print(f"Model:   {manifest.get('model_name')} ({manifest.get('architecture')})")
    print(f"Classes: {', '.join(manifest.get('classes') or [])}")
    print(f"Size:    {manifest.get('model_size_mb')} MB")

    download_model(args.server, api_key, dest, expected_bytes)
    got_sha = sha256_file(dest)
    if expected_sha and got_sha != expected_sha:
        dest.unlink(missing_ok=True)
        raise SystemExit(f"SHA256 mismatch: expected {expected_sha}, got {got_sha}")

    write_sidecars(out_dir, stem, manifest)
    print(f"Saved:   {dest}")
    print(f"SHA256:  {got_sha}")


if __name__ == "__main__":
    main()
