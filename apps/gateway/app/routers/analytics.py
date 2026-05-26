from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.request import Request, Session

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).order_by(Session.start_time.desc()).limit(50))
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
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Request).order_by(Request.created_at.desc()).limit(limit)
    if session_id:
        stmt = stmt.where(Request.session_id == session_id)
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
    db: AsyncSession = Depends(get_db),
):
    stmt = select(
        Request.provider,
        Request.model,
        func.sum(Request.input_tokens).label("total_input"),
        func.sum(Request.output_tokens).label("total_output"),
        func.sum(Request.estimated_cost).label("total_cost"),
        func.count(Request.id).label("request_count"),
        func.avg(Request.latency_ms).label("avg_latency"),
    ).group_by(Request.provider, Request.model)
    if provider:
        stmt = stmt.where(Request.provider == provider)
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "provider": r.provider,
            "model": r.model,
            "total_input_tokens": r.total_input or 0,
            "total_output_tokens": r.total_output or 0,
            "total_cost": round(r.total_cost or 0.0, 6),
            "request_count": r.request_count,
            "avg_latency_ms": round(r.avg_latency or 0.0, 1),
        }
        for r in rows
    ]


@router.get("/costs")
async def cost_breakdown(db: AsyncSession = Depends(get_db)):
    stmt = select(
        Request.provider,
        func.sum(Request.estimated_cost).label("total_cost"),
        func.sum(Request.input_tokens + Request.output_tokens).label("total_tokens"),
    ).group_by(Request.provider)
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


@router.get("/timeline")
async def timeline(
    granularity: Literal["minute", "hour", "day"] = Query("hour"),
    limit: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    fmt = {
        "minute": "%Y-%m-%dT%H:%M:00",
        "hour":   "%Y-%m-%dT%H:00:00",
        "day":    "%Y-%m-%dT00:00:00",
    }[granularity]

    bucket = func.strftime(fmt, Request.created_at).label("period")

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

    result = await db.execute(stmt)
    rows = result.all()

    # Collect distinct providers per bucket in a second query (cheap, one round-trip)
    if rows:
        periods = [r.period for r in rows]
        bucket2 = func.strftime(fmt, Request.created_at).label("period")
        prov_stmt = (
            select(bucket2, Request.provider)
            .where(func.strftime(fmt, Request.created_at).in_(periods))
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
async def live_metrics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            Request.provider,
            Request.model,
            func.sum(Request.input_tokens).label("total_input"),
            func.sum(Request.output_tokens).label("total_output"),
            func.sum(Request.estimated_cost).label("total_cost"),
            func.count(Request.id).label("request_count"),
            func.avg(Request.latency_ms).label("avg_latency"),
        ).group_by(Request.provider, Request.model)
    )
    rows = result.all()
    usage = [
        {
            "provider": r.provider,
            "model": r.model,
            "totalInputTokens": r.total_input or 0,
            "totalOutputTokens": r.total_output or 0,
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
