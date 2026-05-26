"""FastAPI dependency for team authentication via X-ObservaAI-Team-Key header."""
from fastapi import Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone

from app.database import get_db
from app.models.team import TeamApiKey

import fastapi


async def get_team_id(
    x_observaai_team_key: str | None = Header(None),
    db: AsyncSession = fastapi.Depends(get_db),
) -> str | None:
    """
    Resolve the X-ObservaAI-Team-Key header to a team_id.
    Returns None if no key supplied (anonymous / default workspace).
    Raises 401 if a key is supplied but invalid or disabled.
    """
    if not x_observaai_team_key:
        return None

    result = await db.execute(
        select(TeamApiKey).where(
            TeamApiKey.api_key == x_observaai_team_key,
            TeamApiKey.enabled == True,  # noqa: E712
        )
    )
    key_row = result.scalar_one_or_none()
    if key_row is None:
        raise HTTPException(status_code=401, detail="Invalid or disabled team API key")

    await db.execute(
        update(TeamApiKey)
        .where(TeamApiKey.id == key_row.id)
        .values(last_used_at=datetime.now(timezone.utc))
    )
    await db.commit()

    return key_row.team_id
