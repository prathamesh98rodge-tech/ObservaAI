"""
Anthropic adapter — Messages API, streaming + non-streaming.

Non-streaming response shape:
  { "model": "...", "usage": { "input_tokens": N, "output_tokens": N } }

SSE stream events we care about:
  event: message_start  → data.message.usage.input_tokens
  event: message_delta  → data.usage.output_tokens
"""
import json
from .base import UsageStats, AdapterConfig

PROVIDER = "anthropic"
DEFAULT_BASE_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"


def build_headers(cfg: AdapterConfig) -> dict[str, str]:
    return {
        "x-api-key": cfg.api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
        **cfg.extra_headers,
    }


def target_url(cfg: AdapterConfig, path: str) -> str:
    base = cfg.base_url or DEFAULT_BASE_URL
    return f"{base}/{path.lstrip('/')}"


def extract_usage(response: dict) -> UsageStats:
    usage = response.get("usage") or {}
    return UsageStats(
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        cached_tokens=usage.get("cache_read_input_tokens", 0),
        model=response.get("model", ""),
    )


def extract_usage_from_stream(raw_chunks: bytes) -> UsageStats:
    stats = UsageStats()
    current_event = ""
    for line in raw_chunks.decode(errors="replace").splitlines():
        line = line.strip()
        if line.startswith("event:"):
            current_event = line[6:].strip()
        elif line.startswith("data:"):
            payload = line[5:].strip()
            try:
                data = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if current_event == "message_start":
                msg_usage = (data.get("message") or {}).get("usage") or {}
                stats.input_tokens = msg_usage.get("input_tokens", 0)
                stats.cached_tokens = msg_usage.get("cache_read_input_tokens", 0)
                stats.model = (data.get("message") or {}).get("model", "")
            elif current_event == "message_delta":
                delta_usage = data.get("usage") or {}
                stats.output_tokens = delta_usage.get("output_tokens", 0)
    return stats
