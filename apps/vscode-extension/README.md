# ObservaAI — VS Code Extension

Real-time AI cost and token monitoring directly inside VS Code.

## Features

- **Live Metrics panel** — tokens, cost, latency and per-provider breakdown updated every 8 seconds
- **Proxy URLs panel** — one-click copy for all five provider proxy URLs
- **Status bar** — `⬡ 12.3K · $0.04` always-visible token and cost counter
- **Budget alerts** — VS Code notification banners when you approach or exceed a spending limit
- **Ollama GPU / VRAM** — monitors local Ollama model load (optional)
- **Multi-workspace** — team API key scopes all telemetry to a named workspace

## Prerequisites

ObservaAI gateway must be running locally (default `http://localhost:8000`).

Quick start:

```bash
git clone https://github.com/prathamesh98rodge-tech/ObservaAI
cd ObservaAI
make dev
```

See the [Beginner Guide](https://github.com/prathamesh98rodge-tech/ObservaAI/blob/main/docs/BEGINNER_GUIDE.md) for full setup instructions.

## Usage

### Point your SDK at the gateway

```python
# Python + OpenAI
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/proxy/openai/v1")
```

```typescript
// TypeScript + OpenAI
const client = new OpenAI({ baseURL: "http://localhost:8000/proxy/openai/v1" });
```

Then make requests as normal — the extension's sidebar and status bar update automatically.

### Commands

| Command | Description |
|---|---|
| `ObservaAI: Open Dashboard` | Open the web dashboard in a browser |
| `ObservaAI: Reset Session` | Start a new session (resets counters) |
| `ObservaAI: Test Gateway Connection` | Verify the gateway is reachable |
| `ObservaAI: Copy Proxy URL…` | Copy a provider proxy URL to clipboard |

### Settings

| Setting | Default | Description |
|---|---|---|
| `observaai.gatewayUrl` | `http://localhost:8000` | Gateway address |
| `observaai.ollamaUrl` | `http://localhost:11434` | Local Ollama address |
| `observaai.enabled` | `true` | Enable/disable telemetry |
| `observaai.showOllamaMetrics` | `true` | Show Ollama GPU/VRAM panel |
| `observaai.teamApiKey` | `""` | Team API key (`obs-…`) for workspace scoping |

## Multi-workspace

```python
client = OpenAI(
    base_url="http://localhost:8000/proxy/openai/v1",
    default_headers={"X-ObservaAI-Team-Key": "obs-your-key-here"}
)
```

Create teams and API keys at `http://localhost:3000/teams`, then paste the key into **Settings → Extensions → ObservaAI → Team API Key**.

## Supported providers

| Provider | Proxy path |
|---|---|
| OpenAI | `/proxy/openai/v1` |
| Anthropic | `/proxy/anthropic` |
| Google Gemini | `/proxy/gemini` |
| Ollama | `/proxy/ollama` |
| OpenRouter | `/proxy/openrouter` |

## Links

- [GitHub repository](https://github.com/prathamesh98rodge-tech/ObservaAI)
- [Beginner Guide](https://github.com/prathamesh98rodge-tech/ObservaAI/blob/main/docs/BEGINNER_GUIDE.md)
- [Report an issue](https://github.com/prathamesh98rodge-tech/ObservaAI/issues)
