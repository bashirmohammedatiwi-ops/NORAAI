import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO

from openpyxl import Workbook
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.minio_client import upload_bytes
from app.models import Project, Report, ReportStatus, RoadEvent, TrainingJob
from workers.celery_app import celery_app

settings = get_settings()
engine = create_engine(settings.database_url_sync)
SessionLocal = sessionmaker(bind=engine)


def _generate_pdf(project_name: str, data: dict) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, 750, f"AI Operations Report - {project_name}")
    c.setFont("Helvetica", 12)
    y = 720
    for key, value in data.items():
        c.drawString(50, y, f"{key}: {value}")
        y -= 20
    c.save()
    return buffer.getvalue()


def _generate_excel(project_name: str, data: dict) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Report"
    ws.append(["Metric", "Value"])
    for key, value in data.items():
        ws.append([key, value])
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


@celery_app.task(name="workers.reports.tasks.generate_report")
def generate_report(report_id: str):
    session = SessionLocal()
    try:
        report = session.get(Report, uuid.UUID(report_id))
        if not report:
            return {"error": "Report not found"}

        report.status = ReportStatus.GENERATING
        session.commit()

        project = session.get(Project, report.project_id)
        date_from = report.date_from or datetime.now(timezone.utc) - timedelta(days=30)
        date_to = report.date_to or datetime.now(timezone.utc)

        events = (
            session.query(RoadEvent)
            .filter(
                RoadEvent.project_id == report.project_id,
                RoadEvent.created_at >= date_from,
                RoadEvent.created_at <= date_to,
            )
            .count()
        )
        jobs = (
            session.query(TrainingJob)
            .filter(
                TrainingJob.project_id == report.project_id,
                TrainingJob.created_at >= date_from,
            )
            .count()
        )

        data = {
            "Project": project.name if project else "Unknown",
            "Period": f"{date_from.date()} to {date_to.date()}",
            "Road Events": events,
            "Training Jobs": jobs,
            "Report Type": report.report_type,
        }

        if report.format.value == "pdf":
            content = _generate_pdf(project.name if project else "Report", data)
            content_type = "application/pdf"
            ext = "pdf"
        else:
            content = _generate_excel(project.name if project else "Report", data)
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ext = "xlsx"

        minio_key = f"reports/{report.project_id}/{report.id}.{ext}"
        upload_bytes(minio_key, content, content_type)

        report.minio_key = minio_key
        report.status = ReportStatus.COMPLETED
        session.commit()
        return {"status": "completed", "minio_key": minio_key}
    except Exception as exc:
        report = session.get(Report, uuid.UUID(report_id))
        if report:
            report.status = ReportStatus.FAILED
            session.commit()
        return {"status": "failed", "error": str(exc)}
    finally:
        session.close()


@celery_app.task(name="workers.reports.tasks.generate_scheduled_reports")
def generate_scheduled_reports(report_type: str = "weekly"):
    session = SessionLocal()
    try:
        projects = session.query(Project).all()
        for project in projects:
            report = Report(
                project_id=project.id,
                name=f"{report_type.title()} Report - {project.name}",
                format="pdf",
                report_type=report_type,
                date_from=datetime.now(timezone.utc) - timedelta(days=7 if report_type == "weekly" else 30),
                date_to=datetime.now(timezone.utc),
            )
            session.add(report)
            session.commit()
            generate_report.delay(str(report.id))
        return {"scheduled": len(projects)}
    finally:
        session.close()
