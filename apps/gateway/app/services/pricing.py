PRICING: dict[tuple[str, str], tuple[float, float]] = {
    # (provider, model): (input_price_per_M, output_price_per_M) in USD
    ("anthropic", "claude-opus-4-7"):   (15.0,  75.0),
    ("anthropic", "claude-sonnet-4-6"): (3.0,   15.0),
    ("anthropic", "claude-haiku-4-5"):  (0.8,   4.0),
    ("openai",    "gpt-4o"):            (2.5,   10.0),
    ("openai",    "gpt-4o-mini"):       (0.15,  0.6),
    ("openai",    "o3"):                (10.0,  40.0),
    ("gemini",    "gemini-2.5-pro"):    (1.25,  10.0),
    ("gemini",    "gemini-2.5-flash"):  (0.075, 0.3),
    ("ollama",    "local"):             (0.0,   0.0),
}

# Context window size per model (in tokens).
CONTEXT_LIMITS: dict[str, int] = {
    "claude-opus-4-7":    200_000,
    "claude-sonnet-4-6":  200_000,
    "claude-haiku-4-5":   200_000,
    "gpt-4o":             128_000,
    "gpt-4o-mini":        128_000,
    "o3":                 200_000,
    "gemini-2.5-pro":   1_048_576,
    "gemini-2.5-flash": 1_048_576,
}

# Fraction of the input price that cached tokens are billed at.
# Savings = cached_tokens * input_price * (1 - CACHE_RATE[provider])
_CACHE_RATE: dict[str, float] = {
    "openai":    0.50,   # 50% of regular input price
    "anthropic": 0.10,   # 10% of regular input price (90% discount)
}


def _resolve_key(provider: str, model: str) -> tuple[str, str] | None:
    key = (provider, model)
    if key in PRICING:
        return key
    return next((k for k in PRICING if k[0] == provider and model.startswith(k[1])), None)


def estimate_cost(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
    key = _resolve_key(provider, model)
    if key is None:
        return 0.0
    input_price, output_price = PRICING[key]
    return (input_tokens / 1_000_000) * input_price + (output_tokens / 1_000_000) * output_price


def estimate_cache_savings(provider: str, model: str, cached_tokens: int) -> float:
    """Return the USD amount saved by prompt-cache hits vs billing at full input price."""
    if cached_tokens == 0:
        return 0.0
    key = _resolve_key(provider, model)
    if key is None:
        return 0.0
    input_price, _ = PRICING[key]
    cache_rate = _CACHE_RATE.get(provider, 0.0)
    # Savings = what we would have paid at full rate − what we actually paid
    full_cost = (cached_tokens / 1_000_000) * input_price
    actual_cost = full_cost * cache_rate
    return full_cost - actual_cost


def context_window_pct(model: str, input_tokens: int) -> float | None:
    """Return input_tokens as a percentage of the model's context window, or None if unknown."""
    limit = next(
        (v for k, v in CONTEXT_LIMITS.items() if model == k or model.startswith(k)),
        None,
    )
    if limit is None:
        return None
    return round(input_tokens / limit * 100, 1)


def estimate_tokens(provider: str, model: str, messages: list[dict]) -> int:
    """Estimate input token count from messages without an API call."""
    text = " ".join(
        part if isinstance(part, str) else part.get("text", "")
        for m in messages
        for part in ([m.get("content", "")] if isinstance(m.get("content"), str) else (m.get("content") or []))
    )
    if provider == "openai":
        try:
            import tiktoken
            try:
                enc = tiktoken.encoding_for_model(model)
            except KeyError:
                enc = tiktoken.get_encoding("o200k_base")
            return len(enc.encode(text))
        except Exception:
            pass
    # Generic heuristic: ~4 characters per token
    return max(1, len(text) // 4)
