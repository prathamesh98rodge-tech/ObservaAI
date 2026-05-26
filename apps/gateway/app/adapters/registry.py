"""
Maps provider slug → adapter module + AdapterConfig built from settings.
"""
import types
from app.config import settings
from app.adapters.base import AdapterConfig
from app.adapters import openai, anthropic, gemini, ollama, openrouter


def _cfg(api_key: str, base_url: str = "") -> AdapterConfig:
    return AdapterConfig(api_key=api_key, base_url=base_url)


_ADAPTERS: dict[str, types.ModuleType] = {
    "openai":      openai,
    "anthropic":   anthropic,
    "gemini":      gemini,
    "ollama":      ollama,
    "openrouter":  openrouter,
}

_CONFIGS: dict[str, AdapterConfig] = {
    "openai":      _cfg(settings.openai_api_key),
    "anthropic":   _cfg(settings.anthropic_api_key),
    "gemini":      _cfg(settings.gemini_api_key),
    "ollama":      _cfg("", settings.ollama_base_url),
    "openrouter":  _cfg(settings.openrouter_api_key),
}


def get_adapter(provider: str) -> tuple[types.ModuleType, AdapterConfig]:
    mod = _ADAPTERS.get(provider)
    cfg = _CONFIGS.get(provider)
    if mod is None or cfg is None:
        raise ValueError(f"Unknown provider: {provider!r}")
    return mod, cfg


def known_providers() -> list[str]:
    return list(_ADAPTERS.keys())
