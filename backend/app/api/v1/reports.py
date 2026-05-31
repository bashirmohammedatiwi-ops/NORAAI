from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.minio_client import download_bytes
from app.models import Report, ReportFormat, ReportStatus, User
from app.schemas import ReportCreate, ReportResponse
from workers.reports.tasks import generate_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/project/{project_id}", response_model=list[ReportResponse])
async def list_reports(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Report).where(Report.project_id == project_id).order_by(Report.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/project/{project_id}", response_model=ReportResponse)
async def create_report(
    project_id: UUID,
    data: ReportCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    report = Report(
        project_id=project_id,
        name=data.name,
        format=ReportFormat(data.format),
        report_type=data.report_type,
        date_from=data.date_from,
        date_to=data.date_to,
        created_by=user.id,
    )
    db.add(report)
    await db.flush()

    task = generate_report.delay(str(report.id))
    report.celery_task_id = task.id
    await db.flush()
    return report


@router.get("/{report_id}/download")
async def download_report(report_id: UUID, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import Response

    report = await db.get(Report, report_id)
    if not report or not report.minio_key or report.status != ReportStatus.COMPLETED:
        return {"error": "Report not ready"}

    content = download_bytes(report.minio_key)
    content_type = "application/pdf" if report.format == ReportFormat.PDF else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(content=content, media_type=content_type)
