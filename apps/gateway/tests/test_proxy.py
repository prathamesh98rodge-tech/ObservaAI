"""
Integration tests for the proxy router using respx to mock upstream providers.
No real API keys required.
"""
import json
import pytest
import respx
import httpx
from httpx import AsyncClient
from fastapi.testclient import TestClient

from app.main import app


# ── helpers ──────────────────────────────────────────────────────────────────

OPENAI_RESPONSE = {
    "id": "chatcmpl-test",
    "object": "chat.completion",
    "model": "gpt-4o-mini",
    "choices": [{"message": {"role": "assistant", "content": "Hello!"}, "finish_reason": "stop", "index": 0}],
    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
}

ANTHROPIC_RESPONSE = {
    "id": "msg_test",
    "type": "message",
    "role": "assistant",
    "model": "claude-haiku-4-5",
    "content": [{"type": "text", "text": "Hello!"}],
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 12, "output_tokens": 6},
}

GEMINI_RESPONSE = {
    "candidates": [{"content": {"parts": [{"text": "Hello!"}], "role": "model"}, "finishReason": "STOP"}],
    "usageMetadata": {"promptTokenCount": 8, "candidatesTokenCount": 4},
    "modelVersion": "gemini-2.5-flash",
}

OLLAMA_RESPONSE = {
    "model": "llama3",
    "message": {"role": "assistant", "content": "Hello!"},
    "done": True,
    "prompt_eval_count": 20,
    "eval_count": 8,
}

OPENAI_STREAM = (
    'data: {"id":"c1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"delta":{"content":"Hi"},"index":0}]}\n\n'
    'data: {"id":"c1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n'
    "data: [DONE]\n\n"
)


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_session():
    from app.services import session_service
    session_service._active_session_id = None
    yield
    session_service._active_session_id = None


# ── non-streaming tests ───────────────────────────────────────────────────────

@respx.mock
def test_proxy_openai_non_stream():
    respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=OPENAI_RESPONSE)
    )
    with TestClient(app) as client:
        res = client.post(
            "/proxy/openai/v1/chat/completions",
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["model"] == "gpt-4o-mini"
    assert res.headers.get("x-observaai-provider") == "openai"


@respx.mock
def test_proxy_anthropic_non_stream():
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(200, json=ANTHROPIC_RESPONSE)
    )
    with TestClient(app) as client:
        res = client.post(
            "/proxy/anthropic/v1/messages",
            json={"model": "claude-haiku-4-5", "max_tokens": 100,
                  "messages": [{"role": "user", "content": "hi"}]},
        )
    assert res.status_code == 200
    assert res.json()["model"] == "claude-haiku-4-5"


@respx.mock
def test_proxy_gemini_non_stream():
    respx.post(
        url__regex=r"https://generativelanguage\.googleapis\.com/.*"
    ).mock(return_value=httpx.Response(200, json=GEMINI_RESPONSE))
    with TestClient(app) as client:
        res = client.post(
            "/proxy/gemini/v1beta/models/gemini-2.5-flash:generateContent",
            json={"contents": [{"parts": [{"text": "hi"}]}]},
        )
    assert res.status_code == 200
    assert "candidates" in res.json()


@respx.mock
def test_proxy_ollama_non_stream():
    respx.post("http://localhost:11434/api/chat").mock(
        return_value=httpx.Response(200, json=OLLAMA_RESPONSE)
    )
    with TestClient(app) as client:
        res = client.post(
            "/proxy/ollama/api/chat",
            json={"model": "llama3", "messages": [{"role": "user", "content": "hi"}]},
        )
    assert res.status_code == 200
    assert res.json()["model"] == "llama3"


def test_proxy_unknown_provider():
    with TestClient(app) as client:
        res = client.post("/proxy/unknown_provider/v1/chat", json={})
    assert res.status_code == 404


# ── token extraction unit tests ───────────────────────────────────────────────

def test_openai_usage_extraction():
    from app.adapters.openai import extract_usage
    stats = extract_usage(OPENAI_RESPONSE)
    assert stats.input_tokens == 10
    assert stats.output_tokens == 5
    assert stats.model == "gpt-4o-mini"


def test_anthropic_usage_extraction():
    from app.adapters.anthropic import extract_usage
    stats = extract_usage(ANTHROPIC_RESPONSE)
    assert stats.input_tokens == 12
    assert stats.output_tokens == 6


def test_gemini_usage_extraction():
    from app.adapters.gemini import extract_usage
    stats = extract_usage(GEMINI_RESPONSE)
    assert stats.input_tokens == 8
    assert stats.output_tokens == 4


def test_ollama_usage_extraction():
    from app.adapters.ollama import extract_usage
    stats = extract_usage(OLLAMA_RESPONSE)
    assert stats.input_tokens == 20
    assert stats.output_tokens == 8


def test_openai_stream_extraction():
    from app.adapters.openai import extract_usage_from_stream
    stats = extract_usage_from_stream(OPENAI_STREAM.encode())
    assert stats.input_tokens == 10
    assert stats.output_tokens == 2


def test_anthropic_stream_extraction():
    from app.adapters.anthropic import extract_usage_from_stream
    sse = (
        "event: message_start\n"
        'data: {"type":"message_start","message":{"model":"claude-haiku-4-5","usage":{"input_tokens":15,"output_tokens":0}}}\n\n'
        "event: message_delta\n"
        'data: {"type":"message_delta","delta":{},"usage":{"output_tokens":42}}\n\n'
        "event: message_stop\n"
        'data: {"type":"message_stop"}\n\n'
    )
    stats = extract_usage_from_stream(sse.encode())
    assert stats.input_tokens == 15
    assert stats.output_tokens == 42


def test_ollama_stream_extraction():
    from app.adapters.ollama import extract_usage_from_stream
    ndjson = (
        '{"model":"llama3","message":{"role":"assistant","content":"Hell"},"done":false}\n'
        '{"model":"llama3","message":{"role":"assistant","content":"o!"},"done":false}\n'
        '{"model":"llama3","message":{"role":"assistant","content":""},"done":true,"prompt_eval_count":9,"eval_count":3}\n'
    )
    stats = extract_usage_from_stream(ndjson.encode())
    assert stats.input_tokens == 9
    assert stats.output_tokens == 3


# ── pricing unit tests ────────────────────────────────────────────────────────

def test_cost_estimation():
    from app.services.pricing import estimate_cost
    cost = estimate_cost("openai", "gpt-4o", 1_000_000, 1_000_000)
    assert cost == pytest.approx(12.5)   # $2.5 in + $10 out

    cost = estimate_cost("anthropic", "claude-sonnet-4-6", 1_000_000, 1_000_000)
    assert cost == pytest.approx(18.0)   # $3 in + $15 out

    cost = estimate_cost("ollama", "llama3", 9999, 9999)
    assert cost == 0.0                   # local = free


def test_analytics_live_empty():
    with TestClient(app) as client:
        res = client.get("/analytics/live")
    assert res.status_code == 200
    data = res.json()
    assert "usageByProvider" in data
    assert "sessionTokens" in data


def test_analytics_timeline_empty():
    with TestClient(app) as client:
        res = client.get("/analytics/timeline")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_analytics_timeline_granularity_and_limit():
    with TestClient(app) as client:
        for granularity in ("minute", "hour", "day"):
            res = client.get(f"/analytics/timeline?granularity={granularity}&limit=10")
            assert res.status_code == 200
            assert isinstance(res.json(), list)
