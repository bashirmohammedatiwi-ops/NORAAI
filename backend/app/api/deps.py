from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token, verify_password
from app.models.base_models import UserRole
from app.models import FleetDevice, User

security = HTTPBearer(auto_error=False)
DEVICE_KEY_HEADER = "X-Device-Key"


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def verify_user_password(user: User, password: str) -> None:
    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect password")


def require_roles(*roles: UserRole):
    async def checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles and user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return checker


async def get_fleet_device(
    db: Annotated[AsyncSession, Depends(get_db)],
    x_device_key: Annotated[str | None, Header(alias="X-Device-Key")] = None,
) -> FleetDevice:
    if not x_device_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-Device-Key header")
    result = await db.execute(select(FleetDevice).where(FleetDevice.api_key == x_device_key))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid device key")
    return device


async def get_fleet_device_optional(
    db: Annotated[AsyncSession, Depends(get_db)],
    x_device_key: Annotated[str | None, Header(alias="X-Device-Key")] = None,
) -> FleetDevice | None:
    if not x_device_key:
        return None
    result = await db.execute(select(FleetDevice).where(FleetDevice.api_key == x_device_key))
    return result.scalar_one_or_none()
