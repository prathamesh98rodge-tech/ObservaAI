"""Add team_id column to sessions table.

Revision ID: 005
Revises: 004
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("team_id", sa.String(), nullable=True),
    )
    # SQLite doesn't support ADD CONSTRAINT via ALTER TABLE, so use batch mode
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.create_index("ix_sessions_team_id", ["team_id"])


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_index("ix_sessions_team_id")
        batch_op.drop_column("team_id")
