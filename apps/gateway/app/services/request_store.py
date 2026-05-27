"""
Persists a completed request and broadcasts live metrics to WebSocket clients.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.request import Request, Session
from app.adapters.base import UsageStats
from app.services.pricing import estimate_cost, estimate_cache_savings, context_window_pct
from app.services.metrics_bus import metrics_bus
from app.services.session_service import get_or_create_session
from app.services.budget_checker import check_budgets

# Anthropic caches for 5 minutes after first use.
_ANTHROPIC_CACHE_TTL = timedelta(minutes=5)


async def record_request(
    db: AsyncSession,
    *,
    provider: str,
    usage: UsageStats,
    latency_ms: int,
    streaming: bool,
    workspace: str = "default",
    temperature: float | None = None,
    team_id: str | None = None,
    status_code: int | None = None,
    source: str = "proxy",
) -> Request:
    model = usage.model or "unknown"
    cost = estimate_cost(provider, model, usage.input_tokens, usage.output_tokens)
    savings = estimate_cache_savings(provider, model, usage.cached_tokens)
    ctx_pct = context_window_pct(model, usage.input_tokens)
    session_id = await get_or_create_session(db, workspace, team_id=team_id)

    now = datetime.now(timezone.utc)
    cache_expires_at = (
        now + _ANTHROPIC_CACHE_TTL
        if provider == "anthropic" and usage.cached_tokens > 0
        else None
    )

    req = Request(
        id=str(uuid.uuid4()),
        provider=provider,
        model=model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cached_tokens=usage.cached_tokens,
        reasoning_tokens=usage.reasoning_tokens,
        cache_savings_usd=savings,
        latency_ms=latency_ms,
        estimated_cost=cost,
        streaming=streaming,
        temperature=temperature,
        context_pct=ctx_pct,
        cache_expires_at=cache_expires_at,
        status_code=status_code,
        source=source,
        created_at=now,
        session_id=session_id,
    )
    db.add(req)

    await db.execute(
        update(Session)
        .where(Session.id == session_id)
        .values(
            total_tokens=Session.total_tokens + usage.input_tokens + usage.output_tokens,
            total_cost=Session.total_cost + cost,
        )
    )
    await db.commit()

    await _broadcast_live(db)

    # Budget check runs last — failure must never break the proxy response
    try:
        await check_budgets(db, workspace, provider)
    except Exception:
        pass

    return req


async def _broadcast_live(db: AsyncSession) -> None:
    from sqlalchemy import func
    result = await db.execute(
        select(
            Request.provider,
            Request.model,
            func.sum(Request.input_tokens).label("ti"),
            func.sum(Request.output_tokens).label("to_"),
            func.sum(Request.cached_tokens).label("tc"),
            func.sum(Request.cache_savings_usd).label("cs"),
            func.sum(Request.estimated_cost).label("cost"),
            func.count(Request.id).label("rc"),
            func.avg(Request.latency_ms).label("al"),
        ).group_by(Request.provider, Request.model)
    )
    rows = result.all()
    usage = [
        {
            "provider": r.provider,
            "model": r.model,
            "totalInputTokens": r.ti or 0,
            "totalOutputTokens": r.to_ or 0,
            "totalCachedTokens": r.tc or 0,
            "cacheSavingsUsd": round(r.cs or 0.0, 6),
            "totalCost": round(r.cost or 0.0, 6),
            "requestCount": r.rc,
            "avgLatencyMs": round(r.al or 0.0, 1),
        }
        for r in rows
    ]
    total_tokens = sum(u["totalInputTokens"] + u["totalOutputTokens"] for u in usage)
    total_cost = sum(u["totalCost"] for u in usage)
    avg_latency = sum(u["avgLatencyMs"] for u in usage) / len(usage) if usage else 0

    await metrics_bus.publish({
        "sessionTokens": total_tokens,
        "sessionCost": round(total_cost, 6),
        "avgLatencyMs": round(avg_latency, 1),
        "requestsInFlight": 0,
        "usageByProvider": usage,
    })
