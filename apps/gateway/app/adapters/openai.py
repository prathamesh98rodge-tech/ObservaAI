"""
OpenAI adapter — handles Chat Completions (streaming + non-streaming).
Transparently injects stream_options: {include_usage: true} so we always
get token counts back in the final SSE chunk.
"""
import json
from .base import UsageStats, AdapterConfig

PROVIDER = "openai"
DEFAULT_BASE_URL = "https://api.openai.com"


def build_headers(cfg: AdapterConfig) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {cfg.api_key}",
        "Content-Type": "application/json",
        **cfg.extra_headers,
    }


def target_url(cfg: AdapterConfig, path: str) -> str:
    base = cfg.base_url or DEFAULT_BASE_URL
    return f"{base}/{path.lstrip('/')}"


def patch_streaming_body(body: dict) -> dict:
    """Inject stream_options so OpenAI includes usage in the stream."""
    if body.get("stream"):
        body.setdefault("stream_options", {})
        body["stream_options"]["include_usage"] = True
    return body


def extract_usage(response: dict) -> UsageStats:
    usage = response.get("usage") or {}
    return UsageStats(
        input_tokens=usage.get("prompt_tokens", 0),
        output_tokens=usage.get("completion_tokens", 0),
        cached_tokens=(usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0),
        reasoning_tokens=(usage.get("completion_tokens_details") or {}).get("reasoning_tokens", 0),
        model=response.get("model", ""),
    )


def extract_usage_from_stream(raw_chunks: bytes) -> UsageStats:
    """
    Walk SSE lines looking for a data chunk that carries usage.
    OpenAI places a usage chunk immediately before data: [DONE].
    """
    stats = UsageStats()
    for line in raw_chunks.decode(errors="replace").splitlines():
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            continue
        try:
            chunk = json.loads(payload)
        except json.JSONDecodeError:
            continue
        usage = chunk.get("usage")
        if usage:
            stats.input_tokens = usage.get("prompt_tokens", 0)
            stats.output_tokens = usage.get("completion_tokens", 0)
            stats.cached_tokens = (usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
            stats.reasoning_tokens = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)
        if not stats.model:
            stats.model = chunk.get("model", "")
    return stats
