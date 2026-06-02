"""Add class_image_samples for per-class healthy (سليمة) images.

Revision ID: 003
Revises: 002
Create Date: 2026-05-31
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "class_image_samples",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("images.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "sample_type",
            sa.Enum("negative_healthy", name="classsampletype", create_type=True),
            nullable=False,
            server_default="negative_healthy",
        ),
        sa.Column("source", sa.String(50), server_default="upload"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("image_id", "class_id", name="uq_class_image_sample"),
    )
    op.create_index("ix_class_image_samples_image_id", "class_image_samples", ["image_id"])
    op.create_index("ix_class_image_samples_class_id", "class_image_samples", ["class_id"])


def downgrade() -> None:
    op.drop_index("ix_class_image_samples_class_id", table_name="class_image_samples")
    op.drop_index("ix_class_image_samples_image_id", table_name="class_image_samples")
    op.drop_table("class_image_samples")
    op.execute("DROP TYPE IF EXISTS classsampletype")
