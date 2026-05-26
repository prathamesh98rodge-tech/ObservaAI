from dataclasses import dataclass, field


@dataclass
class UsageStats:
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    reasoning_tokens: int = 0
    model: str = ""


@dataclass
class AdapterConfig:
    """Runtime config passed to each adapter."""
    api_key: str = ""
    base_url: str = ""         # override upstream base URL (e.g. for Ollama)
    extra_headers: dict[str, str] = field(default_factory=dict)
