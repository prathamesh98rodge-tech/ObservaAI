"""Team and TeamApiKey models for multi-workspace support."""
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

_KEY_PREFIX = "obs-"


def generate_api_key() -> str:
    """Return a new random API key with the obs- prefix."""
    return _KEY_PREFIX + secrets.token_hex(20)   # obs- + 40 hex chars


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    api_keys: Mapped[list["TeamApiKey"]] = relationship(
        "TeamApiKey", back_populates="team", cascade="all, delete-orphan"
    )


class TeamApiKey(Base):
    __tablename__ = "team_api_keys"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id: Mapped[str] = mapped_column(String, ForeignKey("teams.id"))
    label: Mapped[str] = mapped_column(String, default="")
    api_key: Mapped[str] = mapped_column(String, unique=True)   # plaintext — local server
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    team: Mapped["Team"] = relationship("Team", back_populates="api_keys")
