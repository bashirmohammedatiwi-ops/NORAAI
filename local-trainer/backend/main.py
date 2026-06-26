"""Local YOLO trainer — FastAPI server for Mac / desktop training."""

from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend.dataset import analyze_zip, import_yolo_zip
from backend.hardware import detect_hardware
from backend.storage import (
    add_class,
    delete_class,
    delete_all_datasets,
    delete_dataset,
    get_active_dataset_id,
    get_dataset,
    list_classes,
    list_datasets,
    list_models,
    model_dir,
)
from backend.trainer import export_model, get_model_plot_path, get_training_state, request_cancel, start_training

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
UPLOADS = ROOT / "data" / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Rasid Local Trainer", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if STATIC.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


@app.get("/", response_class=HTMLResponse)
async def index():
    index_path = STATIC / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Rasid Local Trainer</h1><p>static/index.html missing</p>")


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "rasid-local-trainer"}


@app.get("/api/hardware")
async def hardware():
    return detect_hardware()


@app.get("/api/classes")
async def classes_list():
    return list_classes()


@app.post("/api/classes")
async def classes_add(body: dict[str, Any]):
    try:
        return add_class(body.get("name", ""), body.get("color", "#0f766e"))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.delete("/api/classes/{class_id}")
async def classes_remove(class_id: str):
    if not delete_class(class_id):
        raise HTTPException(404, "Class not found")
    return {"deleted": True}


@app.get("/api/datasets")
async def datasets_list():
    active = get_active_dataset_id()
    items = list_datasets()
    return {"active_dataset_id": active, "datasets": items}


@app.get("/api/datasets/{dataset_id}")
async def dataset_detail(dataset_id: str):
    ds = get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds


@app.delete("/api/datasets/{dataset_id}")
async def dataset_remove(dataset_id: str):
    if not delete_dataset(dataset_id):
        raise HTTPException(404, "Dataset not found")
    return {"deleted": True}


@app.delete("/api/datasets")
async def datasets_clear_all():
    count = delete_all_datasets()
    return {"deleted_count": count}


@app.post("/api/dataset/preview")
async def dataset_preview(file: UploadFile = File(...)):
    upload_id = str(uuid.uuid4())
    dest = UPLOADS / f"{upload_id}.zip"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    preview = analyze_zip(dest)
    preview["upload_id"] = upload_id
    return preview


@app.post("/api/dataset/import")
async def dataset_import(
    upload_id: str = Form(...),
    class_mapping: str = Form("{}"),
    val_split: float = Form(0.15),
):
    zip_path = UPLOADS / f"{upload_id}.zip"
    if not zip_path.exists():
        raise HTTPException(400, "Upload expired — upload ZIP again")
    try:
        mapping = json.loads(class_mapping)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid class_mapping JSON") from None
    try:
        meta = import_yolo_zip(zip_path, mapping, val_split=val_split)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    zip_path.unlink(missing_ok=True)
    return meta


@app.get("/api/models")
async def models_list():
    return list_models()


@app.get("/api/models/{model_id}/plots/{filename}")
async def model_plot_image(model_id: str, filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid filename")
    path = get_model_plot_path(model_id, filename)
    if not path:
        raise HTTPException(404, "Plot not found")
    return FileResponse(path, media_type="image/png")


@app.get("/api/models/{model_id}")
async def model_detail(model_id: str):
    meta_path = model_dir(model_id) / "meta.json"
    if not meta_path.exists():
        raise HTTPException(404, "Model not found")
    return json.loads(meta_path.read_text(encoding="utf-8"))


@app.get("/api/train/status")
async def train_status():
    return get_training_state()


@app.post("/api/train/start")
async def train_start(body: dict[str, Any]):
    state = get_training_state()
    if state.get("status") == "running":
        raise HTTPException(409, "Training already running")

    dataset_id = body.get("dataset_id") or get_active_dataset_id()
    if not dataset_id:
        raise HTTPException(400, "No dataset — import labeled ZIP first")

    fine_tune_id = body.get("fine_tune_model_id")
    fine_tune_weights: str | None = None
    if fine_tune_id:
        meta_path = model_dir(fine_tune_id) / "meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            fine_tune_weights = meta.get("weights_path")

    try:
        model_id = start_training(dataset_id, body, fine_tune_weights)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e)) from e
    return {"model_id": model_id, "status": "running"}


@app.post("/api/train/cancel")
async def train_cancel():
    request_cancel()
    return {"cancelled": True}


@app.get("/api/models/{model_id}/download")
async def model_download(model_id: str, format: str = "pt"):
    path = export_model(model_id, format=format)
    if not path or not path.exists():
        raise HTTPException(404, "Model or export not found")
    media = "application/octet-stream"
    if format == "onnx":
        media = "application/octet-stream"
    return FileResponse(path, filename=path.name, media_type=media)
