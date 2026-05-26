"""
Transparent AI proxy router.

Route pattern:  /proxy/{provider}/{path:path}

Examples:
  POST /proxy/openai/v1/chat/completions
  POST /proxy/anthropic/v1/messages
  POST /proxy/gemini/v1beta/models/gemini-2.5-flash:generateContent
  POST /proxy/ollama/api/chat
  POST /proxy/openrouter/api/v1/chat/completions

The proxy:
  1. Forwards the request to the upstream provider with auth headers injected.
  2. For non-streaming: captures the response, extracts token usage, returns body.
  3. For streaming: proxies each raw chunk immediately to the client, then extracts
     usage from the accumulated stream after the connection closes.
  4. Records every request in the DB and broadcasts live metrics.

Responses are transparent — the client receives exactly what the provider sends.
"""
import json
import time
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.registry import get_adapter
from app.database import get_db
from app.services.request_store import record_request
from app.services.team_service import get_team_id

router = APIRouter(tags=["proxy"])

_FORWARD_REQ_HEADERS = frozenset(["content-type", "accept", "accept-encoding"])
_STRIP_RESP_HEADERS = frozenset([
    "content-encoding", "transfer-encoding", "connection",
    "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "upgrade",
])

TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=5.0)


@router.api_route("/proxy/{provider}/{path:path}", methods=["GET", "POST", "PUT", "DELETE"], operation_id="proxy_request")
async def proxy(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    team_id: str | None = Depends(get_team_id),
):
    try:
        adapter, cfg = get_adapter(provider)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider!r}. "
                            f"Valid providers: openai, anthropic, gemini, ollama, openrouter")

    raw_body = await request.body()
    body_json: dict = {}
    if raw_body:
        try:
            body_json = json.loads(raw_body)
        except json.JSONDecodeError:
            pass

    is_streaming = bool(body_json.get("stream", False))
    temperature = body_json.get("temperature")

    # Patch body for providers that need stream options injected
    if is_streaming and hasattr(adapter, "patch_streaming_body"):
        body_json = adapter.patch_streaming_body(body_json)
        raw_body = json.dumps(body_json).encode()

    upstream_url = adapter.target_url(cfg, path)
    upstream_headers = adapter.build_headers(cfg)

    # Forward safe client headers (excluding auth which we replace)
    for h, v in request.headers.items():
        if h.lower() in _FORWARD_REQ_HEADERS and h.lower() not in upstream_headers:
            upstream_headers[h] = v

    # Carry query params through (needed for Gemini ?alt=sse, etc.)
    params = dict(request.query_params)

    if is_streaming:
        return StreamingResponse(
            _stream_proxy(
                provider=provider,
                adapter=adapter,
                upstream_url=upstream_url,
                headers=upstream_headers,
                params=params,
                body=raw_body,
                temperature=temperature,
                db=db,
                team_id=team_id,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-ObservaAI-Provider": provider,
            },
        )

    # ── Non-streaming ─────────────────────────────────────────────────────────
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            upstream = await client.request(
                method=request.method,
                url=upstream_url,
                headers=upstream_headers,
                params=params,
                content=raw_body,
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"Upstream {provider} timed out")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream {provider} error: {exc}")

    latency_ms = int((time.monotonic() - start) * 1000)

    # Extract usage and record (fire-and-forget background task)
    response_body = upstream.content
    usage_stats = _safe_extract_usage(adapter, response_body)
    background_tasks.add_task(
        record_request,
        db,
        provider=provider,
        usage=usage_stats,
        latency_ms=latency_ms,
        streaming=False,
        temperature=temperature,
        team_id=team_id,
    )

    resp_headers = {
        k: v for k, v in upstream.headers.items()
        if k.lower() not in _STRIP_RESP_HEADERS
    }
    resp_headers["X-ObservaAI-Provider"] = provider
    resp_headers["X-ObservaAI-Latency-Ms"] = str(latency_ms)

    return Response(
        content=response_body,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type", "application/json"),
    )


async def _stream_proxy(
    *,
    provider: str,
    adapter,
    upstream_url: str,
    headers: dict,
    params: dict,
    body: bytes,
    temperature: float | None,
    db: AsyncSession,
    team_id: str | None = None,
) -> AsyncGenerator[bytes, None]:
    accumulated: list[bytes] = []
    start = time.monotonic()

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            async with client.stream(
                "POST",
                upstream_url,
                headers=headers,
                params=params,
                content=body,
            ) as response:
                async for chunk in response.aiter_bytes():
                    accumulated.append(chunk)
                    yield chunk
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        err_payload = json.dumps({"error": {"message": str(exc), "provider": provider}})
        yield f"data: {err_payload}\n\n".encode()
        return

    latency_ms = int((time.monotonic() - start) * 1000)
    raw = b"".join(accumulated)
    usage_stats = _safe_extract_usage_stream(adapter, raw)

    await record_request(
        db,
        provider=provider,
        usage=usage_stats,
        latency_ms=latency_ms,
        streaming=True,
        temperature=temperature,
        team_id=team_id,
    )


def _safe_extract_usage(adapter, body: bytes):
    from app.adapters.base import UsageStats
    try:
        return adapter.extract_usage(json.loads(body))
    except Exception:
        return UsageStats()


def _safe_extract_usage_stream(adapter, raw: bytes):
    from app.adapters.base import UsageStats
    try:
        return adapter.extract_usage_from_stream(raw)
    except Exception:
        return UsageStats()
