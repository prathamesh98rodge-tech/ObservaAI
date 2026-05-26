"""SubscriptionUsage — manually-ingested usage data for subscription-plan providers."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SubscriptionUsage(Base):
    __tablename__ = "subscription_usage"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider: Mapped[str] = mapped_column(String, index=True)     # claude | openai | gemini
    plan: Mapped[str] = mapped_column(String, default="")          # e.g. "Pro", "Plus"

    # Rolling window limits (0 = unknown/unlimited)
    hourly_limit: Mapped[int] = mapped_column(Integer, default=0)
    daily_limit: Mapped[int] = mapped_column(Integer, default=0)
    weekly_limit: Mapped[int] = mapped_column(Integer, default=0)

    # Current usage snapshot (as of recorded_at)
    hourly_used: Mapped[int] = mapped_column(Integer, default=0)
    daily_used: Mapped[int] = mapped_column(Integer, default=0)
    weekly_used: Mapped[int] = mapped_column(Integer, default=0)

    # Optional raw cost equivalent (for display only — subscription users pay flat rate)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)

    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
