"""
Ollama metrics endpoints — proxy to local Ollama instance.

GET /ollama/status  → check if Ollama is running + version
GET /ollama/ps      → proxy to Ollama GET /api/ps (running models + VRAM)
GET /ollama/models  → proxy to Ollama GET /api/tags (available models)
"""
import httpx
from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/ollama", tags=["ollama"])


@router.get("/status")
async def ollama_status():
    """Check if Ollama is running and return its version."""
    base_url = settings.ollama_base_url
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{base_url}/api/version")
            resp.raise_for_status()
            data = resp.json()
            return {
                "online": True,
                "version": data.get("version"),
                "base_url": base_url,
            }
    except (httpx.ConnectError, httpx.TimeoutException, Exception):
        return {
            "online": False,
            "version": None,
            "base_url": base_url,
        }


@router.get("/ps")
async def ollama_ps():
    """Proxy to Ollama /api/ps — running models and VRAM usage."""
    base_url = settings.ollama_base_url
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base_url}/api/ps")
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return {"models": []}


@router.get("/models")
async def ollama_models():
    """Proxy to Ollama /api/tags — list available local models."""
    base_url = settings.ollama_base_url
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base_url}/api/tags")
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return {"models": []}
