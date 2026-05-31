"""Update admin login password in the database."""

import asyncio
import os
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session
from app.core.security import hash_password
from app.models import User


async def change_password(email: str, new_password: str) -> None:
    if len(new_password) < 6:
        raise SystemExit("Password must be at least 6 characters.")

    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            raise SystemExit(f"User not found: {email}")

        user.hashed_password = hash_password(new_password)
        await db.commit()
        print(f"Password updated for {email}")


def main() -> None:
    settings = get_settings()
    email = os.environ.get("ADMIN_EMAIL", settings.admin_email)
    if settings.admin_email == "admin@aiops.local":
        email = "admin@aiops.com"

    new_password = os.environ.get("ADMIN_NEW_PASSWORD", "").strip()
    if not new_password and len(sys.argv) > 1:
        new_password = sys.argv[1].strip()
    if not new_password:
        raise SystemExit("Set ADMIN_NEW_PASSWORD or pass the new password as the first argument.")

    asyncio.run(change_password(email, new_password))


if __name__ == "__main__":
    main()
