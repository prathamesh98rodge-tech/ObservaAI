"""Team and API-key management endpoints."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.team import Team, TeamApiKey, generate_api_key

router = APIRouter(prefix="/teams", tags=["teams"])


# ── schemas ───────────────────────────────────────────────────────────────────

class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str | None = None


class ApiKeyCreate(BaseModel):
    label: str = ""


class ApiKeyUpdate(BaseModel):
    label: str | None = None
    enabled: bool | None = None


# ── team CRUD ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_teams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Team).order_by(Team.created_at.asc()))
    teams = result.scalars().all()
    return [_team_dict(t) for t in teams]


@router.post("", status_code=201)
async def create_team(body: TeamCreate, db: AsyncSession = Depends(get_db)):
    team = Team(
        id=str(uuid.uuid4()),
        name=body.name,
        created_at=datetime.now(timezone.utc),
    )
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return _team_dict(team)


@router.get("/{team_id}")
async def get_team(team_id: str, db: AsyncSession = Depends(get_db)):
    team = await _get_team_or_404(db, team_id)
    return _team_dict(team)


@router.patch("/{team_id}")
async def update_team(team_id: str, body: TeamUpdate, db: AsyncSession = Depends(get_db)):
    team = await _get_team_or_404(db, team_id)
    if body.name is not None:
        team.name = body.name
    await db.commit()
    await db.refresh(team)
    return _team_dict(team)


@router.delete("/{team_id}", status_code=204)
async def delete_team(team_id: str, db: AsyncSession = Depends(get_db)):
    team = await _get_team_or_404(db, team_id)
    await db.delete(team)
    await db.commit()
    return Response(status_code=204)


# ── API key CRUD ──────────────────────────────────────────────────────────────

@router.get("/{team_id}/keys")
async def list_keys(team_id: str, db: AsyncSession = Depends(get_db)):
    await _get_team_or_404(db, team_id)
    result = await db.execute(
        select(TeamApiKey)
        .where(TeamApiKey.team_id == team_id)
        .order_by(TeamApiKey.created_at.asc())
    )
    keys = result.scalars().all()
    return [_key_dict(k) for k in keys]


@router.post("/{team_id}/keys", status_code=201)
async def create_key(
    team_id: str,
    body: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
):
    await _get_team_or_404(db, team_id)
    key = TeamApiKey(
        id=str(uuid.uuid4()),
        team_id=team_id,
        label=body.label,
        api_key=generate_api_key(),
        enabled=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    return _key_dict(key)


@router.patch("/{team_id}/keys/{key_id}")
async def update_key(
    team_id: str,
    key_id: str,
    body: ApiKeyUpdate,
    db: AsyncSession = Depends(get_db),
):
    key = await _get_key_or_404(db, team_id, key_id)
    if body.label is not None:
        key.label = body.label
    if body.enabled is not None:
        key.enabled = body.enabled
    await db.commit()
    await db.refresh(key)
    return _key_dict(key)


@router.delete("/{team_id}/keys/{key_id}", status_code=204)
async def delete_key(
    team_id: str,
    key_id: str,
    db: AsyncSession = Depends(get_db),
):
    key = await _get_key_or_404(db, team_id, key_id)
    await db.delete(key)
    await db.commit()
    return Response(status_code=204)


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_team_or_404(db: AsyncSession, team_id: str) -> Team:
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


async def _get_key_or_404(db: AsyncSession, team_id: str, key_id: str) -> TeamApiKey:
    result = await db.execute(
        select(TeamApiKey).where(
            TeamApiKey.id == key_id,
            TeamApiKey.team_id == team_id,
        )
    )
    key = result.scalar_one_or_none()
    if key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    return key


def _team_dict(t: Team) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "created_at": t.created_at.isoformat(),
    }


def _key_dict(k: TeamApiKey) -> dict:
    return {
        "id": k.id,
        "team_id": k.team_id,
        "label": k.label,
        "api_key": k.api_key,
        "enabled": k.enabled,
        "created_at": k.created_at.isoformat(),
        "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
    }
