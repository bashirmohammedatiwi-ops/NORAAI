"""Indexes for fleet geo queries and inference logs.

Revision ID: 004
Revises: 003
Create Date: 2026-05-31
"""

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_road_events_project_active_geo",
        "road_events",
        ["project_id", "is_active", "latitude", "longitude"],
    )
    op.create_index(
        "ix_road_events_created_at",
        "road_events",
        ["created_at"],
    )
    op.create_index(
        "ix_inference_logs_deployment_created",
        "inference_logs",
        ["deployment_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_inference_logs_deployment_created", table_name="inference_logs")
    op.drop_index("ix_road_events_created_at", table_name="road_events")
    op.drop_index("ix_road_events_project_active_geo", table_name="road_events")
