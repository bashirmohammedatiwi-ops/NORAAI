import secrets
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import ModelArtifactResponse
from app.core.config import get_settings, resolve_data_path
from app.core.database import get_db
from app.models import ModelArtifact, ModelLifecycle, Project
from app.services.models.active_model import promote_as_active_model

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/project/{project_id}", response_model=list[ModelArtifactResponse])
async def list_models(project_id: UUID, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    result = await db.execute(
        select(ModelArtifact).where(ModelArtifact.project_id == project_id).order_by(ModelArtifact.created_at.desc())
    )
    artifacts = list(result.scalars().all())
    return [
        ModelArtifactResponse.from_artifact(
            a,
            is_active=bool(project and project.active_model_artifact_id == a.id),
        )
        for a in artifacts
    ]


@router.patch("/{model_id}/lifecycle")
async def update_model_lifecycle(model_id: UUID, lifecycle: str, db: AsyncSession = Depends(get_db)):
    if lifecycle != "production":
        artifact = await db.get(ModelArtifact, model_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Model not found")
        try:
            artifact.lifecycle = ModelLifecycle(lifecycle)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid lifecycle") from exc
        await db.flush()
        return {"id": str(artifact.id), "lifecycle": artifact.lifecycle.value}

    artifact = await db.get(ModelArtifact, model_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Model not found")
    artifact = await promote_as_active_model(db, artifact.project_id, model_id)
    return {"id": str(artifact.id), "lifecycle": artifact.lifecycle.value}


@router.post("/project/{project_id}/import", response_model=ModelArtifactResponse)
async def import_model(
    project_id: UUID,
    name: str = Form(...),
    architecture: str = Form("yolo11"),
    promote: bool = Form(True),
    weights_file: UploadFile | None = File(None),
    onnx_file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
):
    if not weights_file and not onnx_file:
        raise HTTPException(status_code=400, detail="Upload .pt or .onnx")

    settings = get_settings()
    upload_dir = resolve_data_path(settings.models_upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    artifact_id = uuid.uuid4()
    weights_path = None
    onnx_path = None
    size_mb = 0.0

    if weights_file and weights_file.filename:
        dest = upload_dir / f"{artifact_id}.pt"
        content = await weights_file.read()
        dest.write_bytes(content)
        weights_path = str(dest)
        size_mb += len(content) / (1024 * 1024)

    if onnx_file and onnx_file.filename:
        dest = upload_dir / f"{artifact_id}.onnx"
        content = await onnx_file.read()
        dest.write_bytes(content)
        onnx_path = str(dest)
        size_mb += len(content) / (1024 * 1024)

    artifact = ModelArtifact(
        id=artifact_id,
        project_id=project_id,
        name=name,
        architecture=architecture,
        lifecycle=ModelLifecycle.REGISTERED,
        weights_path=weights_path,
        onnx_path=onnx_path,
        model_size_mb=round(size_mb, 2),
        metrics={"source": "nurai-dashboard-import"},
    )
    db.add(artifact)
    await db.flush()

    if promote:
        artifact = await promote_as_active_model(db, project_id, artifact.id)

    return ModelArtifactResponse.from_artifact(artifact, is_active=promote)
