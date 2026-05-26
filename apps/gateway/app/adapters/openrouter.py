"""
OpenRouter adapter — OpenAI-compatible API, same response shape.
Adds HTTP-Referer and X-Title headers as recommended by OpenRouter.
"""
from .base import UsageStats, AdapterConfig
from . import openai as _openai

PROVIDER = "openrouter"
DEFAULT_BASE_URL = "https://openrouter.ai"


def build_headers(cfg: AdapterConfig) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {cfg.api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "ObservaAI",
        **cfg.extra_headers,
    }


def target_url(cfg: AdapterConfig, path: str) -> str:
    base = cfg.base_url or DEFAULT_BASE_URL
    return f"{base}/{path.lstrip('/')}"


# OpenRouter uses OpenAI response format
patch_streaming_body = _openai.patch_streaming_body
extract_usage = _openai.extract_usage
extract_usage_from_stream = _openai.extract_usage_from_stream
