import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.redis_client import get_sync_redis

router = APIRouter(tags=["websockets"])


@router.websocket("/ws/training/{job_id}")
async def training_metrics_ws(websocket: WebSocket, job_id: str):
    await websocket.accept()
    pubsub = get_sync_redis().pubsub()
    pubsub.subscribe(f"training:{job_id}")

    try:
        while True:
            message = pubsub.get_message(timeout=1.0)
            if message and message["type"] == "message":
                await websocket.send_text(message["data"])
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pubsub.unsubscribe(f"training:{job_id}")
