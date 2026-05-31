"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-31
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    # Tables created via Base.metadata.create_all in init script
    pass


def downgrade() -> None:
    pass
