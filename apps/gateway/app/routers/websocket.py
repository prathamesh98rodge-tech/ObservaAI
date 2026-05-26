import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.metrics_bus import metrics_bus

router = APIRouter()


@router.websocket("/ws/metrics")
async def ws_metrics(websocket: WebSocket):
    await websocket.accept()
    queue = metrics_bus.subscribe()
    try:
        while True:
            try:
                payload = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_text(payload)
            except asyncio.TimeoutError:
                await websocket.send_text('{"type":"ping"}')
    except WebSocketDisconnect:
        metrics_bus.unsubscribe(queue)
