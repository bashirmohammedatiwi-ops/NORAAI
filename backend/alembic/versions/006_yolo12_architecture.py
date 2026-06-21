"""Add yolo12 to modelarchitecture enum

Revision ID: 006
Revises: 005
Create Date: 2026-06-22
"""

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE modelarchitecture ADD VALUE IF NOT EXISTS 'yolo12'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values safely.
    pass
