"""
Maintains one active gateway session per process.
Creates a new session in the DB on first use (or after reset).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.request import Session


_active_session_id: str | None = None


async def get_or_create_session(db: AsyncSession, workspace: str = "default") -> str:
    global _active_session_id
    if _active_session_id is None:
        _active_session_id = await _create_session(db, workspace)
    return _active_session_id


async def _create_session(db: AsyncSession, workspace: str) -> str:
    session = Session(
        id=str(uuid.uuid4()),
        workspace_name=workspace,
        start_time=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    return session.id


def reset_session() -> None:
    global _active_session_id
    _active_session_id = None
