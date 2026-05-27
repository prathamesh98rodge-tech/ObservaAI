"""
Tests for POST /analytics/ingest-cli and the cliActivity aggregation on
GET /analytics/live, plus the GET /setup/shell-exports helper.

These cover the Week 14 CLI auto-detection wiring end-to-end at the HTTP layer.
"""
from fastapi.testclient import TestClient

from app.main import app


def _ingest(client: TestClient, **overrides):
    payload = {
        "provider": "anthropic",
        "model": "claude-3-5-sonnet-20241022",
        "input_tokens": 1000,
        "output_tokens": 200,
    }
    payload.update(overrides)
    return client.post("/analytics/ingest-cli", json=payload)


def test_ingest_cli_creates_request_with_cli_log_source():
    with TestClient(app) as fresh:
        res = _ingest(fresh)
        assert res.status_code == 201
        body = res.json()
        assert "id" in body
        assert body["cost"] >= 0.0

        # The resulting row must appear with source='cli-log' on /analytics/requests
        reqs = fresh.get("/analytics/requests?source=cli-log").json()
        assert len(reqs) == 1
        assert reqs[0]["source"] == "cli-log"
        assert reqs[0]["provider"] == "anthropic"
        assert reqs[0]["input_tokens"] == 1000


def test_ingest_cli_source_filter_excludes_proxied_rows():
    """A row written as 'proxy' should be excluded from ?source=cli-log."""
    with TestClient(app) as fresh:
        # Two CLI rows
        _ingest(fresh)
        _ingest(fresh, provider="openai", model="gpt-4o-mini")

        cli_rows = fresh.get("/analytics/requests?source=cli-log").json()
        proxy_rows = fresh.get("/analytics/requests?source=proxy").json()
        all_rows = fresh.get("/analytics/requests").json()

        assert len(cli_rows) == 2
        assert all(r["source"] == "cli-log" for r in cli_rows)
        assert proxy_rows == []
        assert len(all_rows) == 2


def test_live_metrics_reports_cli_activity_after_ingest():
    """GET /analytics/live cliActivity must reflect detected CLIs + tokensToday."""
    with TestClient(app) as fresh:
        _ingest(fresh, provider="anthropic", input_tokens=500, output_tokens=100)
        _ingest(fresh, provider="openai", model="gpt-4o-mini", input_tokens=200, output_tokens=50)

        live = fresh.get("/analytics/live").json()
        assert "cliActivity" in live
        activity = live["cliActivity"]

        assert set(activity["detected"]) == {"anthropic", "openai"}
        assert activity["tokensToday"] == 500 + 100 + 200 + 50
        assert activity["lastSeenAt"] is not None


def test_live_metrics_cli_activity_empty_by_default():
    """No CLI traffic → cliActivity present but empty/zero."""
    with TestClient(app) as fresh:
        live = fresh.get("/analytics/live").json()
        assert "cliActivity" in live
        assert live["cliActivity"]["detected"] == []
        assert live["cliActivity"]["tokensToday"] == 0
        assert live["cliActivity"]["lastSeenAt"] is None


def test_shell_exports_returns_per_shell_blocks():
    """GET /setup/shell-exports returns export lines for bash/zsh, fish, PowerShell."""
    with TestClient(app) as fresh:
        res = fresh.get("/setup/shell-exports")
        assert res.status_code == 200
        body = res.json()
        assert "gatewayUrl" in body
        assert "exports" in body
        assert "vars" in body

        for shell in ("bash_zsh", "fish", "powershell"):
            assert shell in body["exports"]
            block = body["exports"][shell]
            assert "ANTHROPIC_BASE_URL" in block
            assert "OPENAI_BASE_URL" in block
            assert "GEMINI_API_BASE" in block
            assert "ObservaAI CLI detection" in block  # marker for idempotent append

        # Sanity-check that vars use the configured gateway URL
        assert body["vars"]["ANTHROPIC_BASE_URL"].endswith("/proxy/anthropic")
        assert body["vars"]["OPENAI_BASE_URL"].endswith("/proxy/openai/v1")
        assert body["vars"]["GEMINI_API_BASE"].endswith("/proxy/gemini/v1beta")
