from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers.health import router as health_router
from app.routers.analytics import router as analytics_router
from app.routers.websocket import router as ws_router
from app.routers.proxy import router as proxy_router
from app.routers.ollama_health import router as ollama_health_router
from app.routers.budgets import router as budgets_router
from app.routers.teams import router as teams_router
from app.routers.estimate import router as estimate_router
from app.routers.subscriptions import router as subscriptions_router
from app.routers.handover import router as handover_router
from app.adapters.registry import known_providers
from app.services.session_service import reset_all_sessions


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    description="Unified AI usage monitoring gateway for ObservaAI",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(analytics_router)
app.include_router(ws_router)
app.include_router(proxy_router)
app.include_router(ollama_health_router)
app.include_router(budgets_router)
app.include_router(teams_router)
app.include_router(estimate_router)
app.include_router(subscriptions_router)
app.include_router(handover_router)


@app.get("/providers")
async def list_providers():
    return {"providers": known_providers()}


@app.post("/session/reset")
async def session_reset():
    reset_all_sessions()
    return {"status": "ok", "message": "Session reset. Next request creates a new session."}
