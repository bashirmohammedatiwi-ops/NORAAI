"""Mobile driver app — project driver model + remote config.

Revision ID: 005
Revises: 004
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("driver_model_artifact_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("mobile_config", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_foreign_key(
        "fk_projects_driver_model",
        "projects",
        "model_artifacts",
        ["driver_model_artifact_id"],
        ["id"],
        use_alter=True,
    )


def downgrade() -> None:
    op.drop_constraint("fk_projects_driver_model", "projects", type_="foreignkey")
    op.drop_column("projects", "mobile_config")
    op.drop_column("projects", "driver_model_artifact_id")
