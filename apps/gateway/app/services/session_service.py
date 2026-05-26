"""
Maintains one active gateway session per (team_id) key.
None team_id = anonymous/default workspace session.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.request import Session

# Maps team_id (or None) → active session_id
_sessions: dict[str | None, str] = {}


async def get_or_create_session(
    db: AsyncSession,
    workspace: str = "default",
    team_id: str | None = None,
) -> str:
    if team_id not in _sessions:
        _sessions[team_id] = await _create_session(db, workspace, team_id)
    return _sessions[team_id]


async def _create_session(db: AsyncSession, workspace: str, team_id: str | None) -> str:
    session = Session(
        id=str(uuid.uuid4()),
        workspace_name=workspace,
        team_id=team_id,
        start_time=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    return session.id


def reset_session(team_id: str | None = None) -> None:
    """Reset session for a specific team_id, or all sessions if team_id is the sentinel ALL."""
    _sessions.pop(team_id, None)


def reset_all_sessions() -> None:
    _sessions.clear()
