import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.redis_client import get_sync_redis
from app.services.training.progress import get_training_progress

router = APIRouter(tags=["websockets"])


@router.websocket("/ws/training/{job_id}")
async def training_metrics_ws(websocket: WebSocket, job_id: str):
    await websocket.accept()

    initial = await asyncio.to_thread(get_training_progress, job_id)
    if initial:
        await websocket.send_text(json.dumps(initial))

    pubsub = get_sync_redis().pubsub()
    pubsub.subscribe(f"training:{job_id}")

    try:
        while True:
            message = await asyncio.to_thread(pubsub.get_message, timeout=1.0)
            if message and message.get("type") == "message":
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await asyncio.to_thread(pubsub.unsubscribe, f"training:{job_id}")
            await asyncio.to_thread(pubsub.close)
        except Exception:
            pass
