"""
Subscription usage endpoints for web-UI (non-API) providers.

POST /subscriptions/ingest   — record a usage snapshot
GET  /subscriptions          — latest snapshot per provider
GET  /subscriptions/recommend — suggest best next provider
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.subscription import SubscriptionUsage

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

PROVIDER_ORDER = ["claude", "openai", "gemini"]


class IngestRequest(BaseModel):
    provider: str
    plan: str = ""
    hourly_limit: int = 0
    daily_limit: int = 0
    weekly_limit: int = 0
    hourly_used: int = 0
    daily_used: int = 0
    weekly_used: int = 0
    estimated_cost_usd: float = 0.0


def _capacity_pct(used: int, limit: int) -> float | None:
    if limit <= 0:
        return None
    return round(used / limit * 100, 1)


def _row_to_dict(row: SubscriptionUsage) -> dict:
    return {
        "id": row.id,
        "provider": row.provider,
        "plan": row.plan,
        "hourly_limit": row.hourly_limit,
        "daily_limit": row.daily_limit,
        "weekly_limit": row.weekly_limit,
        "hourly_used": row.hourly_used,
        "daily_used": row.daily_used,
        "weekly_used": row.weekly_used,
        "hourly_pct": _capacity_pct(row.hourly_used, row.hourly_limit),
        "daily_pct": _capacity_pct(row.daily_used, row.daily_limit),
        "weekly_pct": _capacity_pct(row.weekly_used, row.weekly_limit),
        "estimated_cost_usd": row.estimated_cost_usd,
        "recorded_at": row.recorded_at.isoformat(),
    }


@router.post("/ingest", status_code=201)
async def ingest(body: IngestRequest, db: AsyncSession = Depends(get_db)):
    row = SubscriptionUsage(
        provider=body.provider.lower(),
        plan=body.plan,
        hourly_limit=body.hourly_limit,
        daily_limit=body.daily_limit,
        weekly_limit=body.weekly_limit,
        hourly_used=body.hourly_used,
        daily_used=body.daily_used,
        weekly_used=body.weekly_used,
        estimated_cost_usd=body.estimated_cost_usd,
        recorded_at=datetime.now(timezone.utc),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_dict(row)


@router.get("")
async def get_subscriptions(db: AsyncSession = Depends(get_db)):
    # Latest snapshot per provider (subquery: max recorded_at per provider)
    sub = (
        select(SubscriptionUsage.provider, func.max(SubscriptionUsage.recorded_at).label("max_ts"))
        .group_by(SubscriptionUsage.provider)
        .subquery()
    )
    stmt = select(SubscriptionUsage).join(
        sub,
        (SubscriptionUsage.provider == sub.c.provider)
        & (SubscriptionUsage.recorded_at == sub.c.max_ts),
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {"subscriptions": [_row_to_dict(r) for r in rows]}


@router.get("/recommend")
async def recommend(db: AsyncSession = Depends(get_db)):
    sub = (
        select(SubscriptionUsage.provider, func.max(SubscriptionUsage.recorded_at).label("max_ts"))
        .group_by(SubscriptionUsage.provider)
        .subquery()
    )
    stmt = select(SubscriptionUsage).join(
        sub,
        (SubscriptionUsage.provider == sub.c.provider)
        & (SubscriptionUsage.recorded_at == sub.c.max_ts),
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    candidates = []
    for row in rows:
        hourly_pct = _capacity_pct(row.hourly_used, row.hourly_limit) or 0.0
        order_score = PROVIDER_ORDER.index(row.provider) if row.provider in PROVIDER_ORDER else 99
        candidates.append((hourly_pct, order_score, row))

    candidates.sort(key=lambda x: (x[0], x[1]))

    if not candidates:
        return {"recommended": None, "reason": "No subscription data ingested yet."}

    best = candidates[0][2]
    hourly_pct = _capacity_pct(best.hourly_used, best.hourly_limit)
    reason = (
        f"{best.provider.title()} has the most remaining hourly capacity"
        if hourly_pct is not None
        else f"{best.provider.title()} is the first configured provider"
    )
    return {
        "recommended": best.provider,
        "reason": reason,
        "snapshot": _row_to_dict(best),
    }
