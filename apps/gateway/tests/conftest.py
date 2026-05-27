"""
Shared pytest fixtures.

Truncates all SQLite tables before each test so tests are fully isolated.
Uses the synchronous sqlite3 module to avoid async event-loop conflicts with
the ASGI TestClient.
"""
import os
import sqlite3

import pytest


_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "observaai.db")


@pytest.fixture(autouse=True)
def isolate_db():
    """Clear every table in the SQLite test database before each test."""
    db = os.path.normpath(_DB_PATH)
    if os.path.exists(db):
        conn = sqlite3.connect(db)
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = OFF")
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'alembic%'"
        )
        for (table,) in cur.fetchall():
            cur.execute(f"DELETE FROM [{table}]")  # brackets handle reserved-word names
        conn.commit()
        cur.execute("PRAGMA foreign_keys = ON")
        conn.close()
    yield
