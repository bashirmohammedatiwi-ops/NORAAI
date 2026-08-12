"""Lightweight DB migrations for standalone deployments (no Alembic)."""

from sqlalchemy import text

from app.core.database import engine


async def ensure_road_event_enum() -> None:
    """Add manhole to PostgreSQL enum if the DB was created before that type existed."""
    candidates = ("roadeventtype", "road_event_type")
    for enum_name in candidates:
        try:
            async with engine.begin() as conn:
                exists = await conn.execute(
                    text("SELECT 1 FROM pg_type WHERE typname = :name"),
                    {"name": enum_name},
                )
                if exists.scalar() is None:
                    continue
                await conn.execute(
                    text(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS 'manhole'")
                )
        except Exception:
            continue
