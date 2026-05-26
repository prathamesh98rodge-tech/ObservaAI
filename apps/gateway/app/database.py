from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=settings.debug)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def is_postgres() -> bool:
    return settings.database_url.startswith("postgresql")


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create all tables from metadata.

    Used for SQLite (dev / test). In production with PostgreSQL, run
    `alembic upgrade head` instead — init_db is a no-op there because
    Alembic owns the schema.
    """
    if is_postgres():
        return
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
