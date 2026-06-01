import redis.asyncio as aioredis
from redis import Redis

from app.core.config import get_settings

settings = get_settings()

_async_redis: aioredis.Redis | None = None
_sync_redis: Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _async_redis
    if _async_redis is None:
        _async_redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _async_redis


def get_sync_redis() -> Redis:
    global _sync_redis
    if _sync_redis is None:
        _sync_redis = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            retry_on_timeout=False,
        )
    return _sync_redis
