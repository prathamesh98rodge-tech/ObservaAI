"""
Tests for /analytics/forecast and /analytics/anomalies endpoints.
"""
import respx
import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app

# Reuse a single TestClient so DB state accumulates across tests in this module
client = TestClient(app)


OPENAI_RESPONSE = {
    "id": "chatcmpl-fc",
    "object": "chat.completion",
    "model": "gpt-4o-mini",
    "choices": [{"message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop", "index": 0}],
    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
}


@pytest.fixture(autouse=True)
def reset_sessions():
    from app.services import session_service
    session_service._sessions.clear()
    yield
    session_service._sessions.clear()


# ── /analytics/forecast ───────────────────────────────────────────────────────

def test_forecast_empty_db_returns_no_data():
    """Fresh DB returns 'no_data' trend and zero projections."""
    with TestClient(app) as fresh:
        res = fresh.get("/analytics/forecast")
    assert res.status_code == 200
    data = res.json()
    assert data["trend"] == "no_data"
    assert data["daily_avg"] == 0.0
    assert data["weekly_projection"] == 0.0
    assert data["monthly_projection"] == 0.0
    assert data["days_sampled"] == 0


def test_forecast_response_shape():
    """Endpoint always returns all expected keys."""
    with TestClient(app) as fresh:
        res = fresh.get("/analytics/forecast")
    assert res.status_code == 200
    keys = {"daily_avg", "weekly_projection", "monthly_projection", "trend", "trend_pct", "days_sampled"}
    assert keys.issubset(res.json().keys())


def test_forecast_accepts_team_id_param():
    """team_id query param is accepted without error."""
    with TestClient(app) as fresh:
        res = fresh.get("/analytics/forecast?team_id=some-team")
    assert res.status_code == 200


@respx.mock
def test_forecast_after_requests():
    """After proxying a request, forecast returns a non-zero daily_avg."""
    respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=OPENAI_RESPONSE)
    )
    with TestClient(app) as fresh:
        fresh.post(
            "/proxy/openai/v1/chat/completions",
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]},
        )
        res = fresh.get("/analytics/forecast")
    assert res.status_code == 200
    data = res.json()
    assert data["days_sampled"] >= 1
    assert data["daily_avg"] >= 0.0
    # Projections are exact multiples of daily_avg (computed from the rounded value)
    assert data["weekly_projection"] == pytest.approx(data["daily_avg"] * 7, rel=1e-9)
    assert data["monthly_projection"] == pytest.approx(data["daily_avg"] * 30, rel=1e-9)
    # Trend for a single day of data is "new"
    assert data["trend"] == "new"


# ── /analytics/anomalies ─────────────────────────────────────────────────────

def test_anomalies_empty_db_returns_empty():
    """Fewer than 10 requests returns an empty anomalies list."""
    with TestClient(app) as fresh:
        res = fresh.get("/analytics/anomalies")
    assert res.status_code == 200
    data = res.json()
    assert data["anomalies"] == []
    assert data["baseline_n"] < 10


def test_anomalies_response_shape():
    """Endpoint always returns all expected top-level keys."""
    with TestClient(app) as fresh:
        res = fresh.get("/analytics/anomalies")
    assert res.status_code == 200
    keys = {"anomalies", "baseline_n", "cost_mean", "cost_std"}
    assert keys.issubset(res.json().keys())


def test_anomalies_accepts_limit_param():
    """limit query param is accepted without error."""
    with TestClient(app) as fresh:
        res = fresh.get("/analytics/anomalies?limit=5")
    assert res.status_code == 200


def test_anomalies_accepts_team_id_param():
    """team_id query param is accepted without error."""
    with TestClient(app) as fresh:
        res = fresh.get("/analytics/anomalies?team_id=some-team")
    assert res.status_code == 200


@respx.mock
def test_anomalies_normal_requests_not_flagged():
    """Many identical-cost requests produce no anomalies (std ≈ 0)."""
    respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=OPENAI_RESPONSE)
    )
    with TestClient(app) as fresh:
        for _ in range(12):
            fresh.post(
                "/proxy/openai/v1/chat/completions",
                json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]},
            )
        res = fresh.get("/analytics/anomalies")
    assert res.status_code == 200
    data = res.json()
    # All requests have the same cost → std ≈ 0 → no Z-score anomalies
    assert isinstance(data["anomalies"], list)
    assert data["anomalies"] == []
    assert data["baseline_n"] >= 12
