"""Add budgets table.

Revision ID: 003
Revises: 002
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False, server_default=""),
        sa.Column("workspace_name", sa.String(), nullable=False, server_default=""),
        sa.Column("provider", sa.String(), nullable=False, server_default=""),
        sa.Column("period", sa.String(), nullable=False, server_default="month"),
        sa.Column("limit_usd", sa.Float(), nullable=False),
        sa.Column("alert_pct", sa.Float(), nullable=False, server_default="0.8"),
        sa.Column("webhook_url", sa.String(), nullable=False, server_default=""),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("notified_level", sa.String(), nullable=False, server_default="none"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_budgets_enabled", "budgets", ["enabled"])


def downgrade() -> None:
    op.drop_table("budgets")
