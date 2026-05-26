"""Add context_pct column to requests table.

Revision ID: 006
Revises: 005
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("requests") as batch_op:
        batch_op.add_column(sa.Column("context_pct", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("requests") as batch_op:
        batch_op.drop_column("context_pct")
