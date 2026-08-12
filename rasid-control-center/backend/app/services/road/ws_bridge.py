"""Non-blocking Redis pub/sub bridge for road-intelligence WebSockets."""

from __future__ import annotations

import asyncio
import logging

from fastapi import WebSocket, WebSocketDisconnect

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)


async def stream_road_events(websocket: WebSocket, project_id: str) -> None:
    """Forward Redis pub/sub messages to a WebSocket without blocking the event loop."""
    channel = f"road:{project_id}"
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message.get("type") == "message" and message.get("data"):
                await websocket.send_text(message["data"])
            else:
                # Yield so HTTP handlers stay responsive between Redis polls.
                await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("road ws stream ended: %s", exc)
    finally:
        try:
            await pubsub.unsubscribe(channel)
        except Exception:
            pass
        try:
            await pubsub.aclose()
        except Exception:
            pass
