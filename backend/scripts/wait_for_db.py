import sys
import time

from sqlalchemy import create_engine, text

from app.core.config import get_settings


def main() -> int:
    settings = get_settings()
    url = settings.database_url_sync
    print(f"Connecting to database (host=postgres)...")

    for attempt in range(1, 61):
        try:
            engine = create_engine(url, pool_pre_ping=True)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print("Database is ready.")
            return 0
        except Exception as exc:
            print(f"[{attempt}/60] Waiting for database: {exc}", file=sys.stderr)
            time.sleep(2)

    print("ERROR: Database connection timed out after 120 seconds.", file=sys.stderr)
    print("Check POSTGRES_PASSWORD matches DATABASE_URL in .env", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
