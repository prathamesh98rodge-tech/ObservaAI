import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
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
    source: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Request).order_by(Request.created_at.desc()).limit(limit)
    if session_id:
        stmt = stmt.where(Request.session_id == session_id)
    if source:
        stmt = stmt.where(Request.source == source)
    tf = _team_session_filter(team_id)
    if tf is not None:
        stmt = stmt.where(tf)
    result = await db.execute(stmt)
    requests = result.scalars().all()
    now = datetime.now(timezone.utc)
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
            "context_pct": r.context_pct,
            "cache_expires_at": r.cache_expires_at.isoformat() if r.cache_expires_at else None,
            "cache_active": (r.cache_expires_at is not None and r.cache_expires_at > now),
            "status_code": r.status_code,
            "source": r.source,
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

    # CLI activity aggregation
    now_live = datetime.now(timezone.utc)
    today_start = now_live.replace(hour=0, minute=0, second=0, microsecond=0)
    cli_stmt = (
        select(
            Request.provider,
            func.sum(Request.input_tokens + Request.output_tokens).label("tokens"),
            func.max(Request.created_at).label("last_seen"),
        )
        .where(Request.source == "cli-log")
        .where(Request.created_at >= today_start)
        .group_by(Request.provider)
    )
    if tf is not None:
        cli_stmt = cli_stmt.where(tf)
    cli_rows = (await db.execute(cli_stmt)).all()
    cli_detected = [r.provider for r in cli_rows]
    cli_tokens_today = sum(r.tokens or 0 for r in cli_rows)
    cli_last_seen = max((r.last_seen for r in cli_rows), default=None)

    return {
        "sessionTokens": total_tokens,
        "sessionCost": round(total_cost, 6),
        "avgLatencyMs": round(sum(u["avgLatencyMs"] for u in usage) / len(usage), 1) if usage else 0,
        "requestsInFlight": 0,
        "usageByProvider": usage,
        "cliActivity": {
            "detected": cli_detected,
            "tokensToday": cli_tokens_today,
            "lastSeenAt": cli_last_seen.isoformat() if cli_last_seen else None,
        },
    }


@router.get("/rate-limits")
async def rate_limit_windows(
    team_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Rolling token usage for the last 5 hours and 7 days, per provider."""
    now = datetime.now(timezone.utc)
    cutoff_5h = now - timedelta(hours=5)
    cutoff_7d = now - timedelta(days=7)
    tf = _team_session_filter(team_id)

    async def _query(cutoff: datetime):
        stmt = select(
            Request.provider,
            func.sum(Request.input_tokens + Request.output_tokens).label("tokens"),
        ).where(Request.created_at >= cutoff).group_by(Request.provider)
        if tf is not None:
            stmt = stmt.where(tf)
        return (await db.execute(stmt)).all()

    rows_5h, rows_7d = await _query(cutoff_5h), await _query(cutoff_7d)
    map_5h = {r.provider: r.tokens or 0 for r in rows_5h}
    map_7d = {r.provider: r.tokens or 0 for r in rows_7d}
    providers = set(map_5h) | set(map_7d)

    return [
        {
            "provider": p,
            "tokens_5h": map_5h.get(p, 0),
            "tokens_7d": map_7d.get(p, 0),
            "reset_5h_at": (now + timedelta(hours=5)).isoformat(),
            "reset_7d_at": (now + timedelta(days=7)).isoformat(),
        }
        for p in sorted(providers)
    ]


@router.get("/errors")
async def error_rate(
    team_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Error rate per provider: counts of non-2xx requests vs total."""
    tf = _team_session_filter(team_id)
    all_stmt = select(Request.provider, Request.status_code)
    if tf is not None:
        all_stmt = all_stmt.where(tf)
    rows = (await db.execute(all_stmt)).all()

    from collections import defaultdict
    totals: dict[str, int] = defaultdict(int)
    errors: dict[str, int] = defaultdict(int)
    for provider, status_code in rows:
        totals[provider] += 1
        if status_code is not None and status_code >= 400:
            errors[provider] += 1

    return [
        {
            "provider": p,
            "total_requests": totals[p],
            "error_requests": errors[p],
            "error_rate": round(errors[p] / totals[p], 4) if totals[p] > 0 else 0.0,
        }
        for p in sorted(totals)
    ]


@router.get("/forecast")
async def cost_forecast(
    team_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Daily cost projection from the last 30 days of activity.
    Returns daily_avg, weekly/monthly projections, and trend vs the prior period.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)
    tf = _team_session_filter(team_id)

    day_bucket = _time_bucket("day", Request.created_at)
    stmt = (
        select(day_bucket, func.sum(Request.estimated_cost).label("cost"))
        .where(Request.created_at >= cutoff)
        .group_by(day_bucket)
        .order_by(day_bucket.asc())
    )
    if tf is not None:
        stmt = stmt.where(tf)
    result = await db.execute(stmt)
    rows = result.all()

    daily_costs = [float(r.cost or 0.0) for r in rows]
    n = len(daily_costs)

    if n == 0:
        return {
            "daily_avg": 0.0,
            "weekly_projection": 0.0,
            "monthly_projection": 0.0,
            "trend": "no_data",
            "trend_pct": 0.0,
            "days_sampled": 0,
        }

    daily_avg = sum(daily_costs) / n

    # Trend: recent 7 days vs prior 7 days
    recent7 = daily_costs[-7:]
    prior7 = daily_costs[-14:-7] if n >= 14 else []

    if prior7:
        recent_avg = sum(recent7) / len(recent7)
        prior_avg = sum(prior7) / len(prior7)
        trend_pct = round((recent_avg - prior_avg) / prior_avg * 100, 1) if prior_avg > 0 else 0.0
        if trend_pct > 10:
            trend = "up"
        elif trend_pct < -10:
            trend = "down"
        else:
            trend = "stable"
    else:
        trend_pct = 0.0
        trend = "new"

    return {
        "daily_avg": round(daily_avg, 6),
        "weekly_projection": round(daily_avg * 7, 6),
        "monthly_projection": round(daily_avg * 30, 6),
        "trend": trend,
        "trend_pct": trend_pct,
        "days_sampled": n,
    }


@router.get("/anomalies")
async def detect_anomalies(
    team_id: str | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    Flags requests whose cost or token count is more than 2.5 standard deviations
    above the mean of the last 200 requests (Z-score anomaly detection).
    """
    tf = _team_session_filter(team_id)
    stmt = (
        select(Request)
        .order_by(Request.created_at.desc())
        .limit(200)
    )
    if tf is not None:
        stmt = stmt.where(tf)
    result = await db.execute(stmt)
    reqs = result.scalars().all()  # most-recent first

    if len(reqs) < 10:
        return {"anomalies": [], "baseline_n": len(reqs), "cost_mean": 0.0, "cost_std": 0.0}

    costs = [float(r.estimated_cost or 0.0) for r in reqs]
    tokens = [(r.input_tokens or 0) + (r.output_tokens or 0) for r in reqs]

    cost_mean = statistics.mean(costs)
    cost_std = statistics.stdev(costs) if len(costs) > 1 else 0.0
    tok_mean = statistics.mean(tokens)
    tok_std = statistics.stdev(tokens) if len(tokens) > 1 else 0.0

    THRESHOLD = 2.5
    found = []

    for req in reqs:  # already most-recent first
        c = float(req.estimated_cost or 0.0)
        t = (req.input_tokens or 0) + (req.output_tokens or 0)

        if cost_std > 0 and c > cost_mean:
            z = (c - cost_mean) / cost_std
            if z >= THRESHOLD:
                found.append({
                    "request_id": req.id,
                    "provider": req.provider,
                    "model": req.model,
                    "created_at": req.created_at.isoformat(),
                    "input_tokens": req.input_tokens or 0,
                    "output_tokens": req.output_tokens or 0,
                    "cost_usd": round(c, 6),
                    "type": "cost_spike",
                    "value": round(c, 6),
                    "expected": round(cost_mean, 6),
                    "z_score": round(z, 2),
                })
                if len(found) >= limit:
                    break
                continue

        if tok_std > 0 and t > tok_mean:
            z = (t - tok_mean) / tok_std
            if z >= THRESHOLD:
                found.append({
                    "request_id": req.id,
                    "provider": req.provider,
                    "model": req.model,
                    "created_at": req.created_at.isoformat(),
                    "input_tokens": req.input_tokens or 0,
                    "output_tokens": req.output_tokens or 0,
                    "cost_usd": round(c, 6),
                    "type": "token_spike",
                    "value": t,
                    "expected": round(tok_mean, 1),
                    "z_score": round(z, 2),
                })
                if len(found) >= limit:
                    break

    return {
        "anomalies": found,
        "baseline_n": len(reqs),
        "cost_mean": round(cost_mean, 6),
        "cost_std": round(cost_std, 6),
    }


class CliIngestPayload(BaseModel):
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    timestamp: str | None = None
    workspace: str = "default"
    team_id: str | None = None


@router.post("/ingest-cli", status_code=201)
async def ingest_cli(
    payload: CliIngestPayload,
    db: AsyncSession = Depends(get_db),
):
    """Accept token usage reported by the VS Code CLI log watcher and store it as source='cli-log'."""
    from app.models.request import Request as Req, Session
    from app.services.session_service import get_or_create_session
    from app.services.pricing import estimate_cost

    cost = estimate_cost(payload.provider, payload.model, payload.input_tokens, payload.output_tokens)
    session_id = await get_or_create_session(db, payload.workspace, team_id=payload.team_id)

    ts = datetime.now(timezone.utc)
    if payload.timestamp:
        try:
            ts = datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00"))
        except ValueError:
            pass

    req = Req(
        id=str(uuid.uuid4()),
        provider=payload.provider,
        model=payload.model,
        input_tokens=payload.input_tokens,
        output_tokens=payload.output_tokens,
        cached_tokens=0,
        reasoning_tokens=0,
        cache_savings_usd=0.0,
        latency_ms=0,
        estimated_cost=cost,
        streaming=False,
        source="cli-log",
        created_at=ts,
        session_id=session_id,
    )
    db.add(req)
    from sqlalchemy import update
    await db.execute(
        update(Session)
        .where(Session.id == session_id)
        .values(
            total_tokens=Session.total_tokens + payload.input_tokens + payload.output_tokens,
            total_cost=Session.total_cost + cost,
        )
    )
    await db.commit()
    return {"id": req.id, "cost": round(cost, 6)}
