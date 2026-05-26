from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, String

from app.database import get_db, is_postgres
from app.models.request import Request, Session

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── dialect-aware time-bucketing ──────────────────────────────────────────────

_SQLITE_FMT = {
    "minute": "%Y-%m-%dT%H:%M:00",
    "hour":   "%Y-%m-%dT%H:00:00",
    "day":    "%Y-%m-%dT00:00:00",
}
_PG_TRUNC = {"minute": "minute", "hour": "hour", "day": "day"}


def _time_bucket(granularity: str, column):
    """Return a labeled string expression that truncates a timestamp to granularity."""
    if is_postgres():
        return cast(func.date_trunc(_PG_TRUNC[granularity], column), String).label("period")
    return func.strftime(_SQLITE_FMT[granularity], column).label("period")


# ── team_id filter helper ─────────────────────────────────────────────────────

def _team_session_filter(team_id: str | None):
    """Return a WHERE clause element that scopes requests to a team's sessions, or None."""
    if team_id is None:
        return None
    return Request.session_id.in_(
        select(Session.id).where(Session.team_id == team_id)
    )


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    team_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Session).order_by(Session.start_time.desc()).limit(50)
    if team_id is not None:
        stmt = stmt.where(Session.team_id == team_id)
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "workspace_name": s.workspace_name,
            "start_time": s.start_time.isoformat(),
            "end_time": s.end_time.isoformat() if s.end_time else None,
            "total_tokens": s.total_tokens,
            "total_cost": s.total_cost,
        }
        for s in sessions
    ]


@router.get("/requests")
async def list_requests(
    session_id: str | None = Query(None),
    team_id: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Request).order_by(Request.created_at.desc()).limit(limit)
    if session_id:
        stmt = stmt.where(Request.session_id == session_id)
    tf = _team_session_filter(team_id)
    if tf is not None:
        stmt = stmt.where(tf)
    result = await db.execute(stmt)
    requests = result.scalars().all()
    return [
        {
            "id": r.id,
            "provider": r.provider,
            "model": r.model,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "cached_tokens": r.cached_tokens,
            "cache_savings_usd": round(r.cache_savings_usd, 6),
            "latency_ms": r.latency_ms,
            "estimated_cost": r.estimated_cost,
            "streaming": r.streaming,
            "session_id": r.session_id,
            "created_at": r.created_at.isoformat(),
        }
        for r in requests
    ]


@router.get("/tokens")
async def token_usage(
    provider: str | None = Query(None),
    team_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(
        Request.provider,
        Request.model,
        func.sum(Request.input_tokens).label("total_input"),
        func.sum(Request.output_tokens).label("total_output"),
        func.sum(Request.cached_tokens).label("total_cached"),
        func.sum(Request.estimated_cost).label("total_cost"),
        func.count(Request.id).label("request_count"),
        func.avg(Request.latency_ms).label("avg_latency"),
    ).group_by(Request.provider, Request.model)
    if provider:
        stmt = stmt.where(Request.provider == provider)
    tf = _team_session_filter(team_id)
    if tf is not None:
        stmt = stmt.where(tf)
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "provider": r.provider,
            "model": r.model,
            "total_input_tokens": r.total_input or 0,
            "total_output_tokens": r.total_output or 0,
            "total_cached_tokens": r.total_cached or 0,
            "total_cost": round(r.total_cost or 0.0, 6),
            "request_count": r.request_count,
            "avg_latency_ms": round(r.avg_latency or 0.0, 1),
        }
        for r in rows
    ]


@router.get("/costs")
async def cost_breakdown(
    team_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(
        Request.provider,
        func.sum(Request.estimated_cost).label("total_cost"),
        func.sum(Request.input_tokens + Request.output_tokens).label("total_tokens"),
    ).group_by(Request.provider)
    tf = _team_session_filter(team_id)
    if tf is not None:
        stmt = stmt.where(tf)
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "provider": r.provider,
            "total_cost": round(r.total_cost or 0.0, 6),
            "total_tokens": r.total_tokens or 0,
        }
        for r in rows
    ]


@router.get("/cache")
async def cache_metrics(
    team_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Prompt-cache hit-rate and savings, globally and per provider."""
    stmt = select(
        Request.provider,
        func.sum(Request.input_tokens).label("input_tokens"),
        func.sum(Request.cached_tokens).label("cached_tokens"),
        func.sum(Request.cache_savings_usd).label("savings_usd"),
        func.count(Request.id).label("request_count"),
    ).group_by(Request.provider)
    tf = _team_session_filter(team_id)
    if tf is not None:
        stmt = stmt.where(tf)
    result = await db.execute(stmt)
    rows = result.all()

    by_provider = []
    total_input = 0
    total_cached = 0
    total_savings = 0.0

    for r in rows:
        inp = r.input_tokens or 0
        cached = r.cached_tokens or 0
        savings = r.savings_usd or 0.0
        billable = inp + cached
        hit_rate = cached / billable if billable > 0 else 0.0

        total_input += inp
        total_cached += cached
        total_savings += savings

        by_provider.append({
            "provider": r.provider,
            "inputTokens": inp,
            "cachedTokens": cached,
            "savingsUsd": round(savings, 6),
            "hitRate": round(hit_rate, 4),
            "requestCount": r.request_count,
        })

    total_billable = total_input + total_cached
    global_hit_rate = total_cached / total_billable if total_billable > 0 else 0.0

    return {
        "totalCachedTokens": total_cached,
        "totalSavingsUsd": round(total_savings, 6),
        "hitRate": round(global_hit_rate, 4),
        "byProvider": by_provider,
    }


@router.get("/timeline")
async def timeline(
    granularity: Literal["minute", "hour", "day"] = Query("hour"),
    limit: int = Query(24, ge=1, le=168),
    team_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    bucket = _time_bucket(granularity, Request.created_at)
    tf = _team_session_filter(team_id)

    stmt = (
        select(
            bucket,
            func.sum(Request.input_tokens).label("input_tokens"),
            func.sum(Request.output_tokens).label("output_tokens"),
            func.sum(Request.estimated_cost).label("cost"),
            func.count(Request.id).label("requests"),
        )
        .group_by(bucket)
        .order_by(bucket.asc())
        .limit(limit)
    )
    if tf is not None:
        stmt = stmt.where(tf)

    result = await db.execute(stmt)
    rows = result.all()

    if rows:
        periods = [r.period for r in rows]
        bucket2 = _time_bucket(granularity, Request.created_at)
        prov_stmt = (
            select(bucket2, Request.provider)
            .where(_time_bucket(granularity, Request.created_at).in_(periods))
            .distinct()
        )
        prov_result = await db.execute(prov_stmt)
        from collections import defaultdict
        providers_map: dict[str, list[str]] = defaultdict(list)
        for period, provider in prov_result.all():
            if provider not in providers_map[period]:
                providers_map[period].append(provider)
    else:
        providers_map = {}

    return [
        {
            "period": r.period,
            "input_tokens": r.input_tokens or 0,
            "output_tokens": r.output_tokens or 0,
            "cost": round(r.cost or 0.0, 6),
            "requests": r.requests,
            "providers": providers_map.get(r.period, []),
        }
        for r in rows
    ]


@router.get("/live")
async def live_metrics(
    team_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    tf = _team_session_filter(team_id)
    stmt = select(
        Request.provider,
        Request.model,
        func.sum(Request.input_tokens).label("total_input"),
        func.sum(Request.output_tokens).label("total_output"),
        func.sum(Request.cached_tokens).label("total_cached"),
        func.sum(Request.cache_savings_usd).label("total_savings"),
        func.sum(Request.estimated_cost).label("total_cost"),
        func.count(Request.id).label("request_count"),
        func.avg(Request.latency_ms).label("avg_latency"),
    ).group_by(Request.provider, Request.model)
    if tf is not None:
        stmt = stmt.where(tf)
    result = await db.execute(stmt)
    rows = result.all()
    usage = [
        {
            "provider": r.provider,
            "model": r.model,
            "totalInputTokens": r.total_input or 0,
            "totalOutputTokens": r.total_output or 0,
            "totalCachedTokens": r.total_cached or 0,
            "cacheSavingsUsd": round(r.total_savings or 0.0, 6),
            "totalCost": round(r.total_cost or 0.0, 6),
            "requestCount": r.request_count,
            "avgLatencyMs": round(r.avg_latency or 0.0, 1),
        }
        for r in rows
    ]
    total_tokens = sum(u["totalInputTokens"] + u["totalOutputTokens"] for u in usage)
    total_cost = sum(u["totalCost"] for u in usage)
    return {
        "sessionTokens": total_tokens,
        "sessionCost": round(total_cost, 6),
        "avgLatencyMs": round(sum(u["avgLatencyMs"] for u in usage) / len(usage), 1) if usage else 0,
        "requestsInFlight": 0,
        "usageByProvider": usage,
    }
