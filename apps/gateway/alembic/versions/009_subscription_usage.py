"""Add subscription_usage table.

Revision ID: 009
Revises: 008
Create Date: 2026-05-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscription_usage",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("plan", sa.String(), nullable=False, server_default=""),
        sa.Column("hourly_limit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("daily_limit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("weekly_limit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hourly_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("daily_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("weekly_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_subscription_usage_provider", "subscription_usage", ["provider"])
    op.create_index("ix_subscription_usage_recorded_at", "subscription_usage", ["recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_subscription_usage_recorded_at", "subscription_usage")
    op.drop_index("ix_subscription_usage_provider", "subscription_usage")
    op.drop_table("subscription_usage")
