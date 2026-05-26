"""
Ollama adapter — local HTTP API (NDJSON streaming).

Non-streaming response:
  { "model": "llama3", "prompt_eval_count": N, "eval_count": N }

Streaming: NDJSON lines, last line has "done": true and the counts.
"""
import json
from .base import UsageStats, AdapterConfig

PROVIDER = "ollama"


def build_headers(cfg: AdapterConfig) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        **cfg.extra_headers,
    }


def target_url(cfg: AdapterConfig, path: str) -> str:
    base = cfg.base_url or "http://localhost:11434"
    return f"{base}/{path.lstrip('/')}"


def extract_usage(response: dict) -> UsageStats:
    return UsageStats(
        input_tokens=response.get("prompt_eval_count", 0),
        output_tokens=response.get("eval_count", 0),
        model=response.get("model", ""),
    )


def extract_usage_from_stream(raw_chunks: bytes) -> UsageStats:
    """Ollama streams NDJSON; the final line with done=true has the counts."""
    stats = UsageStats()
    for line in raw_chunks.decode(errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("done"):
            stats = extract_usage(obj)
    return stats
