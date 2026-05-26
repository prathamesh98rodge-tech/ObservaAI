PRICING: dict[tuple[str, str], tuple[float, float]] = {
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


def estimate_cost(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
    key = (provider, model)
    if key not in PRICING:
        key = next(
            (k for k in PRICING if k[0] == provider and model.startswith(k[1])),
            None,
        )
    if key is None:
        return 0.0
    input_price, output_price = PRICING[key]
    return (input_tokens / 1_000_000) * input_price + (output_tokens / 1_000_000) * output_price
