"""
Alembic env.py — supports both SQLite (dev/test) and PostgreSQL (production).

For async drivers (asyncpg / aiosqlite) Alembic needs a *synchronous* connection.
We strip the +async dialect prefix and use the sync driver instead.
"""
import asyncio
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

# ── load models so Alembic can see metadata ───────────────────────────────────
from app.database import Base  # noqa: F401
from app.models import request  # noqa: F401  (registers Session + Request on Base)

# ── Alembic Config ─────────────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _sync_url(url: str) -> str:
    """Convert an async driver URL to its synchronous equivalent."""
    return (
        url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
           .replace("sqlite+aiosqlite://", "sqlite://")
    )


def _get_url() -> str:
    from app.config import settings
    return settings.database_url


# ── offline migrations (generate SQL without a live DB) ───────────────────────

def run_migrations_offline() -> None:
    url = _sync_url(_get_url())
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ── online migrations (against a live DB) ─────────────────────────────────────

def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online_async() -> None:
    url = _get_url()
    connectable = create_async_engine(url, poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_migrations_online_async())


# ── entry point ────────────────────────────────────────────────────────────────

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
