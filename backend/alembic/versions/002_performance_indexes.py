"""Add performance indexes for dashboard and training queries.

Revision ID: 002
Revises: 001
Create Date: 2026-05-31
"""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_projects_organization_id", "projects", ["organization_id"], unique=False)
    op.create_index("ix_training_jobs_project_id", "training_jobs", ["project_id"], unique=False)
    op.create_index("ix_training_jobs_status", "training_jobs", ["status"], unique=False)
    op.create_index(
        "ix_training_metrics_job_epoch",
        "training_metrics",
        ["training_job_id", "epoch"],
        unique=False,
    )
    op.create_index("ix_deployments_project_id", "deployments", ["project_id"], unique=False)
    op.create_index("ix_deployments_status", "deployments", ["status"], unique=False)
    op.create_index("ix_fleet_devices_project_id", "fleet_devices", ["project_id"], unique=False)
    op.create_index("ix_fleet_devices_is_online", "fleet_devices", ["is_online"], unique=False)
    op.create_index("ix_drift_alerts_deployment_id", "drift_alerts", ["deployment_id"], unique=False)
    op.create_index(
        "ix_drift_alerts_is_acknowledged",
        "drift_alerts",
        ["is_acknowledged"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_drift_alerts_is_acknowledged", table_name="drift_alerts")
    op.drop_index("ix_drift_alerts_deployment_id", table_name="drift_alerts")
    op.drop_index("ix_fleet_devices_is_online", table_name="fleet_devices")
    op.drop_index("ix_fleet_devices_project_id", table_name="fleet_devices")
    op.drop_index("ix_deployments_status", table_name="deployments")
    op.drop_index("ix_deployments_project_id", table_name="deployments")
    op.drop_index("ix_training_metrics_job_epoch", table_name="training_metrics")
    op.drop_index("ix_training_jobs_status", table_name="training_jobs")
    op.drop_index("ix_training_jobs_project_id", table_name="training_jobs")
    op.drop_index("ix_projects_organization_id", table_name="projects")
