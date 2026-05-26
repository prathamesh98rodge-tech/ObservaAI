"""
Budget checker — runs after every request to detect threshold crossings.

Budgets can be scoped to:
  - Any workspace / any provider  (workspace="" provider="")
  - A specific workspace          (workspace="myproject" provider="")
  - A specific provider           (workspace="" provider="openai")
  - Both                          (workspace="myproject" provider="openai")

Period windows are rolling:
  day   → last 24 hours
  week  → last 7 days
  month → last 30 days

Notification levels (stored on the Budget row):
  "none"     → no alert sent yet this window
  "warning"  → crossed alert_pct threshold
  "exceeded" → crossed 100% of limit

Levels only escalate. They reset to "none" when spend drops back below the
alert threshold (possible if the period window rolls forward).
"""
import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from app.models.request import Request
from app.models.budget import Budget

log = logging.getLogger(__name__)

_PERIOD_DELTA = {
    "day":   timedelta(days=1),
    "week":  timedelta(weeks=1),
    "month": timedelta(days=30),
}


async def check_budgets(db: AsyncSession, workspace: str, provider: str) -> None:
    """Check all enabled budgets that match (workspace, provider)."""
    result = await db.execute(
        select(Budget).where(Budget.enabled.is_(True))
    )
    budgets = result.scalars().all()
    if not budgets:
        return

    now = datetime.now(timezone.utc)

    for budget in budgets:
        # Skip if this budget's scope doesn't match the current request
        if budget.workspace_name and budget.workspace_name != workspace:
            continue
        if budget.provider and budget.provider != provider:
            continue

        since = now - _PERIOD_DELTA.get(budget.period, timedelta(days=30))
        spend = await _spend_in_window(db, budget, since)
        await _maybe_notify(db, budget, spend, now)


async def _spend_in_window(db: AsyncSession, budget: Budget, since: datetime) -> float:
    stmt = select(func.sum(Request.estimated_cost)).where(
        Request.created_at >= since
    )
    if budget.workspace_name:
        from app.models.request import Session
        stmt = stmt.join(Session, Request.session_id == Session.id).where(
            Session.workspace_name == budget.workspace_name
        )
    if budget.provider:
        stmt = stmt.where(Request.provider == budget.provider)

    result = await db.execute(stmt)
    return result.scalar() or 0.0


async def _maybe_notify(
    db: AsyncSession, budget: Budget, spend: float, now: datetime
) -> None:
    pct = spend / budget.limit_usd if budget.limit_usd > 0 else 0.0

    if pct >= 1.0 and budget.notified_level != "exceeded":
        new_level = "exceeded"
        await _fire(budget, spend, "exceeded")
    elif pct >= budget.alert_pct and budget.notified_level == "none":
        new_level = "warning"
        await _fire(budget, spend, "warning")
    elif pct < budget.alert_pct and budget.notified_level != "none":
        # Spend dropped back below threshold (period rolled) — reset
        new_level = "none"
    else:
        return

    await db.execute(
        update(Budget)
        .where(Budget.id == budget.id)
        .values(notified_level=new_level)
    )
    await db.commit()


async def _fire(budget: Budget, spend: float, level: str) -> None:
    """Log the alert and, if configured, POST to the webhook URL."""
    log.warning(
        "Budget alert [%s] budget=%s level=%s spend=%.4f limit=%.4f",
        budget.label or budget.id, budget.id, level, spend, budget.limit_usd,
    )
    if not budget.webhook_url:
        return
    payload = {
        "budget_id": budget.id,
        "label": budget.label,
        "level": level,
        "spend_usd": round(spend, 6),
        "limit_usd": budget.limit_usd,
        "pct": round(spend / budget.limit_usd, 4) if budget.limit_usd > 0 else 0,
        "provider": budget.provider or None,
        "workspace": budget.workspace_name or None,
        "period": budget.period,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(budget.webhook_url, json=payload)
    except Exception as exc:
        log.warning("Webhook POST failed for budget %s: %s", budget.id, exc)
