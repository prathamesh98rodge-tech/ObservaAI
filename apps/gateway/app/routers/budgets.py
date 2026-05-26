"""
Budget management router.

  GET    /budgets              list all budgets with current spend
  POST   /budgets              create a budget
  PATCH  /budgets/{id}         update label / limit / alert_pct / enabled / webhook_url
  DELETE /budgets/{id}         delete a budget
  GET    /budgets/alerts       live triggered alerts (for VS Code extension polling)
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.budget import Budget
from app.models.request import Request, Session

router = APIRouter(prefix="/budgets", tags=["budgets"])

_PERIOD_DELTA = {
    "day":   timedelta(days=1),
    "week":  timedelta(weeks=1),
    "month": timedelta(days=30),
}


# ── helpers ───────────────────────────────────────────────────────────────────

async def _spend_for(db: AsyncSession, budget: Budget, since: datetime) -> float:
    stmt = select(func.sum(Request.estimated_cost)).where(
        Request.created_at >= since
    )
    if budget.workspace_name:
        stmt = stmt.join(Session, Request.session_id == Session.id).where(
            Session.workspace_name == budget.workspace_name
        )
    if budget.provider:
        stmt = stmt.where(Request.provider == budget.provider)
    result = await db.execute(stmt)
    return result.scalar() or 0.0


def _budget_dict(b: Budget, spend: float) -> dict[str, Any]:
    pct = spend / b.limit_usd if b.limit_usd > 0 else 0.0
    return {
        "id": b.id,
        "label": b.label,
        "workspace_name": b.workspace_name,
        "provider": b.provider,
        "period": b.period,
        "limit_usd": b.limit_usd,
        "alert_pct": b.alert_pct,
        "spend_usd": round(spend, 6),
        "spend_pct": round(pct, 4),
        "level": _level(pct, b.alert_pct),
        "webhook_url": b.webhook_url,
        "enabled": b.enabled,
        "notified_level": b.notified_level,
        "created_at": b.created_at.isoformat(),
    }


def _level(pct: float, alert_pct: float) -> str:
    if pct >= 1.0:
        return "exceeded"
    if pct >= alert_pct:
        return "warning"
    return "ok"


# ── schemas ───────────────────────────────────────────────────────────────────

class BudgetCreate(BaseModel):
    label: str = ""
    workspace_name: str = ""
    provider: str = ""
    period: str = "month"
    limit_usd: float = Field(gt=0)
    alert_pct: float = Field(default=0.8, ge=0.01, le=1.0)
    webhook_url: str = ""


class BudgetUpdate(BaseModel):
    label: str | None = None
    limit_usd: float | None = Field(default=None, gt=0)
    alert_pct: float | None = Field(default=None, ge=0.01, le=1.0)
    webhook_url: str | None = None
    enabled: bool | None = None


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_budgets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Budget).order_by(Budget.created_at.asc()))
    budgets = result.scalars().all()

    now = datetime.now(timezone.utc)
    rows = []
    for b in budgets:
        since = now - _PERIOD_DELTA.get(b.period, timedelta(days=30))
        spend = await _spend_for(db, b, since)
        rows.append(_budget_dict(b, spend))
    return rows


@router.post("", status_code=201)
async def create_budget(body: BudgetCreate, db: AsyncSession = Depends(get_db)):
    b = Budget(
        id=str(uuid.uuid4()),
        label=body.label,
        workspace_name=body.workspace_name,
        provider=body.provider,
        period=body.period,
        limit_usd=body.limit_usd,
        alert_pct=body.alert_pct,
        webhook_url=body.webhook_url,
        created_at=datetime.now(timezone.utc),
    )
    db.add(b)
    await db.commit()
    return _budget_dict(b, 0.0)


@router.patch("/{budget_id}")
async def update_budget(
    budget_id: str,
    body: BudgetUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Budget).where(Budget.id == budget_id))
    b = result.scalar_one_or_none()
    if b is None:
        raise HTTPException(status_code=404, detail="Budget not found")

    values: dict[str, Any] = {}
    if body.label is not None:
        values["label"] = body.label
    if body.limit_usd is not None:
        values["limit_usd"] = body.limit_usd
    if body.alert_pct is not None:
        values["alert_pct"] = body.alert_pct
    if body.webhook_url is not None:
        values["webhook_url"] = body.webhook_url
    if body.enabled is not None:
        values["enabled"] = body.enabled
        if body.enabled:
            values["notified_level"] = "none"   # reset alerts on re-enable

    if values:
        await db.execute(update(Budget).where(Budget.id == budget_id).values(**values))
        await db.commit()
        await db.refresh(b)

    now = datetime.now(timezone.utc)
    since = now - _PERIOD_DELTA.get(b.period, timedelta(days=30))
    spend = await _spend_for(db, b, since)
    return _budget_dict(b, spend)


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(budget_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Budget).where(Budget.id == budget_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    await db.execute(delete(Budget).where(Budget.id == budget_id))
    await db.commit()


@router.get("/alerts")
async def get_alerts(
    workspace: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Return all currently triggered budget alerts (live spend query).

    The VS Code extension polls this every 30s to surface notifications.
    """
    stmt = select(Budget).where(Budget.enabled.is_(True))
    result = await db.execute(stmt)
    budgets = result.scalars().all()

    now = datetime.now(timezone.utc)
    alerts = []
    for b in budgets:
        if workspace and b.workspace_name and b.workspace_name != workspace:
            continue
        since = now - _PERIOD_DELTA.get(b.period, timedelta(days=30))
        spend = await _spend_for(db, b, since)
        pct = spend / b.limit_usd if b.limit_usd > 0 else 0.0
        level = _level(pct, b.alert_pct)
        if level != "ok":
            alerts.append({
                "budget_id": b.id,
                "label": b.label or f"{b.provider or 'all'} / {b.period}",
                "level": level,
                "spend_usd": round(spend, 6),
                "limit_usd": b.limit_usd,
                "spend_pct": round(pct, 4),
                "provider": b.provider or None,
                "workspace": b.workspace_name or None,
                "period": b.period,
            })
    return {"alerts": alerts}
