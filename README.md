<div align="center">

# ObservaAI

**Unified AI usage monitor & multi-provider gateway.**
_Datadog + Grafana + Raycast for LLM workflows._

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Python](https://img.shields.io/badge/python-3.12-3776ab.svg)](#)
[![Node](https://img.shields.io/badge/node-22+-339933.svg)](#)
[![Next.js](https://img.shields.io/badge/next.js-15-black.svg)](#)
[![FastAPI](https://img.shields.io/badge/fastapi-0.115-009688.svg)](#)

Route requests for **OpenAI · Anthropic · Gemini · Ollama · OpenRouter** through one
gateway. See tokens, cost, latency and per-provider breakdowns live — from a web
dashboard, a VS Code sidebar, and the status bar.

</div>

---

## Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/prathamesh98rodge-tech/ObservaAI/main/install.sh | bash
```

The installer auto-detects Docker (preferred) or falls back to `pnpm + python3`,
clones the repo, copies `.env.example → .env`, and starts the stack.

After it finishes:
- Dashboard → http://localhost:3000
- Gateway   → http://localhost:8000

Edit `.env` to add your provider API keys, then point any LLM SDK at
`http://localhost:8000/proxy/<provider>` instead of the provider's own URL.

---

## Why ObservaAI

Every team using LLMs hits the same three problems:

1. **Cost surprises** — bills arrive at the end of the month with no per-feature
   attribution.
2. **Provider lock-in friction** — comparing GPT-4o vs. Claude vs. Gemini means
   wiring three SDKs and three dashboards.
3. **No live feedback loop** — you don't see token cost while you're prompting,
   so you optimize blind.

ObservaAI sits between your code and the providers, transparently records every
request, and surfaces the numbers immediately — in a dashboard, in your editor,
and in your status bar.

### Features

- **Transparent proxy** for OpenAI, Anthropic, Gemini, Ollama, OpenRouter —
  same request/response shape, including SSE & NDJSON streaming.
- **Token & cost tracking** per request, session, and provider, with built-in
  price tables you can override.
- **Live dashboard** with token usage, cost-over-time, provider mix, request
  history, and per-session drill-down.
- **WebSocket push** — the dashboard updates the instant a request completes;
  HTTP polling falls back automatically when WS is down.
- **VS Code extension** — status-bar token counter, sidebar with live metrics,
  Ollama VRAM monitor, one-click proxy URL copy.
- **Local-first** — SQLite by default, no external services, no telemetry. Your
  prompts stay on your machine.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Your code                                                            │
│    OpenAI SDK     Anthropic SDK     curl       VS Code Copilot        │
└──────┬──────────────────┬──────────────┬──────────────┬───────────────┘
       │                  │              │              │
       └─── baseURL: ─────┴──────────────┴──────────────┘
              http://localhost:8000/proxy/<provider>
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ObservaAI Gateway  (FastAPI · port 8000)                             │
│  ├─ /proxy/{provider}/{path}    transparent forward + record          │
│  ├─ /analytics/{live,timeline,costs,tokens,sessions,requests}         │
│  ├─ /ws/metrics                 live push                             │
│  ├─ /ollama/{status,ps,models}  local model passthrough               │
│  └─ /session/reset              new session                           │
└────────────┬────────────────────────────────────────────────┬─────────┘
             │ SQLite (aiosqlite)                             │ WebSocket
             ▼                                                ▼
   ┌──────────────────────┐                       ┌───────────────────────┐
   │  observaai.db        │                       │  Dashboard (Next 15)  │
   │  sessions, requests  │                       │  + VS Code extension  │
   └──────────────────────┘                       └───────────────────────┘
```

Monorepo layout:

```
ObservaAI/
├── apps/
│   ├── gateway/             FastAPI proxy + analytics API
│   ├── dashboard/           Next.js 15 dashboard (App Router)
│   └── vscode-extension/    VS Code sidebar + status bar
├── packages/
│   ├── shared-types/        TS types shared by dashboard ↔ extension
│   ├── provider-adapters/   Per-provider request/response helpers
│   ├── analytics-sdk/       Thin REST client for the gateway API
│   └── ui-components/       Reusable React UI primitives
├── infrastructure/          Docker, Alembic migrations
├── docker-compose.yml
├── install.sh               One-shot installer (curl-pipe friendly)
└── Makefile                 Common dev tasks
```

---

## Usage

### Drop-in SDK examples

**OpenAI (Python)**
```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/proxy/openai/v1")
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "hi"}],
)
```

**Anthropic (Python)**
```python
from anthropic import Anthropic
client = Anthropic(base_url="http://localhost:8000/proxy/anthropic")
msg = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=256,
    messages=[{"role": "user", "content": "hi"}],
)
```

**Ollama (curl)**
```bash
curl http://localhost:8000/proxy/ollama/api/chat -d '{
  "model": "llama3.2",
  "messages": [{"role": "user", "content": "hi"}]
}'
```

Streaming, system prompts, tool use — everything works the same way it does
against the provider directly. The gateway is transparent.

### VS Code extension

1. Build the `.vsix`:
   ```bash
   cd apps/vscode-extension && pnpm package
   ```
2. In VS Code: `Extensions: Install from VSIX…` → pick the generated file.
3. The **ObservaAI** activity-bar icon opens a sidebar with live metrics and
   proxy-URL copy buttons. The status bar shows running token total + cost.

Commands (all under `ObservaAI:` in the command palette):
- Open Dashboard
- Reset Session
- Test Gateway Connection
- Copy Proxy URL…

### JetBrains plugin (IntelliJ IDEA, PyCharm, GoLand, …)

> **Requires:** JDK 21 · Gradle 8+ · network access to download IntelliJ SDK (~600 MB, one-time)

1. Build the plugin ZIP:
   ```bash
   make build-jetbrains
   # or: cd apps/jetbrains-plugin && ./gradlew buildPlugin
   ```
   Output: `apps/jetbrains-plugin/build/distributions/observaai-jetbrains-0.1.0.zip`

2. In your JetBrains IDE: **Settings → Plugins → ⚙ → Install Plugin from Disk…** → select the ZIP.

3. Restart the IDE. **ObservaAI** appears in the right tool-window stripe and the status bar.

Configure under **Settings → Tools → ObservaAI**:

| Setting | Default | Notes |
|---|---|---|
| Gateway URL | `http://localhost:8000` | URL of the running ObservaAI gateway |
| Team API Key | _(blank)_ | `obs-…` key scopes metrics to your workspace |
| Enabled | `true` | Disable to pause telemetry collection |

**Features:**
- Live metrics panel (tokens, cost, avg latency, per-provider breakdown)
- Status bar widget: `⬡ 12.3K · $0.04` — click to open the metrics panel
- Budget alerts as IDE balloon notifications (warning / exceeded)
- Dark/light theme aware

---

## Configuration

Everything lives in `.env`:

| Variable                  | Default                                     | Notes |
| ------------------------- | ------------------------------------------- | ----- |
| `DEBUG`                   | `false`                                     | Verbose FastAPI logs |
| `DATABASE_URL`            | `sqlite+aiosqlite:///./observaai.db`        | Any SQLAlchemy async URL |
| `OPENAI_API_KEY`          | `""`                                        | Injected into `Authorization: Bearer` |
| `ANTHROPIC_API_KEY`       | `""`                                        | Injected into `x-api-key` |
| `GEMINI_API_KEY`          | `""`                                        | Injected as `?key=` |
| `OPENROUTER_API_KEY`      | `""`                                        | |
| `OLLAMA_BASE_URL`         | `http://localhost:11434`                    | Local Ollama daemon |
| `CORS_ORIGINS`            | `["http://localhost:3000", ...]`            | JSON array of allowed origins |
| `NEXT_PUBLIC_GATEWAY_URL` | `http://localhost:8000`                     | Dashboard → gateway URL |

The dashboard `/settings` page shows live connection status, the API key form
(read-only — actual values are loaded from `.env`), and copy buttons for every
proxy URL.

---

## Development

### Prereqs
- Node 22+ and **pnpm** 9+
- Python 3.12+
- (optional) Docker + Compose for the containerized stack

### From scratch

```bash
git clone https://github.com/prathamesh98rodge-tech/ObservaAI.git
cd ObservaAI
make install            # JS deps + Python venv + .env
make dev                # gateway + dashboard, concurrently
```

### Useful commands

```bash
make test               # gateway pytest suite (16 tests)
make typecheck          # tsc --noEmit across all TS apps
make build              # production build of dashboard + extension
make up                 # full Docker stack, detached
make logs               # tail container logs
make reset              # drop local SQLite DB
make clean              # remove node_modules, .venv, .next, dist
```

### Project scripts

| Workspace              | Command                                  | What it does                |
| ---------------------- | ---------------------------------------- | --------------------------- |
| `@observaai/dashboard` | `pnpm dev` / `pnpm build`                | Next.js 15 App Router       |
| `observaai-vscode`     | `pnpm build` / `pnpm package`            | esbuild → `dist/extension.js` / `.vsix` |
| `apps/gateway`         | `.venv/bin/uvicorn app.main:app --reload`| FastAPI on :8000            |

---

## Testing

The gateway has a real pytest suite (`apps/gateway/tests/`) that uses **respx**
to mock upstream provider HTTP calls:

```bash
make test
# .................... 16 passed in 1.17s
```

It covers:
- End-to-end proxying for all 5 providers (non-streaming + streaming)
- Token extraction from each provider's response shape
- Cost estimation against the built-in price table
- All `/analytics/*` endpoints, including SQLite time-bucketing
- Unknown-provider 404 path

---

## Security

ObservaAI is **local-first by design**:

- **No outbound telemetry.** The gateway only talks to the providers you call.
- **API keys never leave your machine.** They live in `.env` (gitignored), are
  injected into upstream requests server-side, and are never sent to the
  dashboard or extension. The settings UI is display-only.
- **CORS is strict** — only the origins listed in `CORS_ORIGINS` can call the
  gateway from a browser.
- **Hop-by-hop response headers are stripped** before responding (`connection`,
  `transfer-encoding`, etc.) to avoid leaking proxy plumbing.
- **SQLite is local-file** by default; nothing is uploaded.

If you deploy the gateway behind a public hostname:
1. Put it behind TLS (reverse proxy with nginx/Caddy/Traefik).
2. Restrict `CORS_ORIGINS` to your real dashboard hostname only.
3. Add an auth layer (`X-API-Key` middleware or a reverse-proxy `auth_request`).
4. Switch `DATABASE_URL` to Postgres for concurrent writers.

---

## Roadmap

- [ ] Postgres support + Alembic migrations
- [ ] Cost-budget alerts (per-workspace, per-provider)
- [ ] Prompt cache hit-rate metrics
- [ ] Marketplace release of the VS Code extension
- [x] JetBrains plugin (IntelliJ, PyCharm, GoLand, …)
- [ ] Per-team / multi-workspace mode

---

## License

MIT © ObservaAI contributors. See [LICENSE](LICENSE).
