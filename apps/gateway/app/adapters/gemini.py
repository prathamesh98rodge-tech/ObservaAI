"""
Gemini adapter — generateContent endpoint (REST).

Response shape:
  { "usageMetadata": { "promptTokenCount": N, "candidatesTokenCount": N },
    "modelVersion": "gemini-2.5-pro" }

Streaming returns a JSON array of GenerateContentResponse objects separated
by commas; we look at the last complete object for usageMetadata.
"""
import json
from .base import UsageStats, AdapterConfig

PROVIDER = "gemini"
DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com"


def build_headers(cfg: AdapterConfig) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        **cfg.extra_headers,
    }


def target_url(cfg: AdapterConfig, path: str) -> str:
    base = cfg.base_url or DEFAULT_BASE_URL
    url = f"{base}/{path.lstrip('/')}"
    if cfg.api_key:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}key={cfg.api_key}"
    return url


def extract_usage(response: dict) -> UsageStats:
    meta = response.get("usageMetadata") or {}
    return UsageStats(
        input_tokens=meta.get("promptTokenCount", 0),
        output_tokens=meta.get("candidatesTokenCount", 0),
        cached_tokens=meta.get("cachedContentTokenCount", 0),
        model=response.get("modelVersion", ""),
    )


def extract_usage_from_stream(raw_chunks: bytes) -> UsageStats:
    """
    Gemini streaming sends JSON fragments that form an array.
    We scan backwards for the last usageMetadata block.
    """
    text = raw_chunks.decode(errors="replace")
    # Strip outer array brackets and try to find the last object
    stats = UsageStats()
    # Walk lines looking for usageMetadata objects
    depth = 0
    buf: list[str] = []
    for line in text.splitlines():
        stripped = line.strip().rstrip(",")
        if stripped.startswith("{"):
            buf = [stripped]
            depth = stripped.count("{") - stripped.count("}")
        elif buf:
            buf.append(stripped)
            depth += stripped.count("{") - stripped.count("}")
            if depth <= 0:
                try:
                    obj = json.loads("\n".join(buf))
                    usage = extract_usage(obj)
                    if usage.input_tokens or usage.output_tokens:
                        stats = usage
                except json.JSONDecodeError:
                    pass
                buf = []
    return stats
