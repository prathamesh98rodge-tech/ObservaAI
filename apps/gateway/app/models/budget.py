"""Budget model — per-workspace and per-provider spend limits."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Float, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    label: Mapped[str] = mapped_column(String, default="")

    # Scope — empty string means "all workspaces / all providers"
    workspace_name: Mapped[str] = mapped_column(String, default="")
    provider: Mapped[str] = mapped_column(String, default="")   # "" = all providers

    period: Mapped[str] = mapped_column(String, default="month")   # day | week | month
    limit_usd: Mapped[float] = mapped_column(Float)
    alert_pct: Mapped[float] = mapped_column(Float, default=0.8)   # 0.0 – 1.0

    webhook_url: Mapped[str] = mapped_column(String, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # "none" | "warning" | "exceeded" — reset each period
    notified_level: Mapped[str] = mapped_column(String, default="none")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
