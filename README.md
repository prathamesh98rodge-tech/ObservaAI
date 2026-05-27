<div align="center">

<img src="docs/assets/ObservaAI.png" alt="ObservaAI" width="240" />

# ObservaAI

**Unified AI usage monitor & multi-provider gateway.**  
_Datadog + Grafana + Raycast for LLM workflows._

[![CI](https://github.com/prathamesh98rodge-tech/ObservaAI/actions/workflows/ci.yml/badge.svg)](https://github.com/prathamesh98rodge-tech/ObservaAI/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Python](https://img.shields.io/badge/python-3.12-3776ab.svg)](#)
[![Node](https://img.shields.io/badge/node-22+-339933.svg)](#)
[![Next.js](https://img.shields.io/badge/next.js-15-black.svg)](#)
[![FastAPI](https://img.shields.io/badge/fastapi-0.115-009688.svg)](#)
[![Tests](https://img.shields.io/badge/tests-53%20passing-brightgreen.svg)](#testing)

Route requests for **OpenAI · Anthropic · Gemini · Ollama · OpenRouter** through one
gateway. See tokens, cost, latency and per-provider breakdowns live — from a web
dashboard, VS Code, JetBrains, and the status bar.

[**Beginner? Start here →**](docs/BEGINNER_GUIDE.md)

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

Every team using LLMs hits the same problems:

1. **Cost surprises** — bills arrive at end of month with no per-feature attribution.
2. **Provider lock-in friction** — comparing GPT-4o vs. Claude vs. Gemini means wiring three SDKs and three dashboards.
3. **No live feedback loop** — you don't see token cost while prompting.
4. **No multi-workspace isolation** — one bill for everything, no per-team breakdown.

ObservaAI sits between your code and the providers, transparently records every request, and surfaces the numbers immediately — in a dashboard, in your editor, and in your status bar.

### Features

- **Transparent proxy** for OpenAI, Anthropic, Gemini, Ollama, OpenRouter —
  same request/response shape, including SSE & NDJSON streaming.
- **Token & cost tracking** per request, session, and provider, with built-in price tables.
- **Prompt-cache hit-rate metrics** — tracks cached tokens, measures actual savings (OpenAI 50%, Anthropic 90% discount).
- **Context window %** — every request shows how full the model's context window is (green <50%, yellow <80%, red >80%). Supports all 5 providers with per-model limits.
- **Cache expiry indicator** — Anthropic prompt-cache hits show a live ⚡ active badge (5-min TTL). VS Code status bar appends `· ⚡cache` when the last request is within the cache window.
- **Rolling rate-limit windows** — `GET /analytics/rate-limits` returns per-provider token usage over the last 5 hours and 7 days. Dashboard Overview shows usage bars with countdown to reset.
- **Subscription capacity tracking** — for Claude Pro / ChatGPT Plus / Gemini Pro users who don't use the API. `POST /subscriptions/ingest` records hourly·daily·weekly usage snapshots; `GET /subscriptions` returns the latest per provider; `GET /subscriptions/recommend` picks the provider with most remaining capacity. Dashboard `/subscriptions` page shows color-coded progress bars (green <50%, yellow 50–80%, red >80%). VS Code sidebar shows the same bars, refreshed every 60 s.
- **Provider handover** — `POST /handover/generate` packages your current conversation goal + context into a formatted markdown document. VS Code command `ObservaAI: Prepare Handover` auto-suggests the recommended next provider, then copies the doc to the clipboard so you can paste it straight into ChatGPT or Gemini and continue the session without losing context.
- **Pre-flight cost estimate** — `POST /estimate` accepts `{provider, model, messages}` and returns `{estimated_input_tokens, estimated_cost_usd, context_pct}` without making an API call. Uses `tiktoken` for OpenAI models; character heuristic for others.
- **Error rate analytics** — `GET /analytics/errors` reports non-2xx request counts and error rates per provider. Status codes recorded on every proxied request.
- **Live dashboard** with token usage, cost-over-time charts, provider mix donut, request history, and session drill-down.
- **WebSocket push** — dashboard updates the instant a request completes; HTTP polling fallback when WS is down.
- **Cost-budget alerts** — set per-workspace / per-provider limits; get notified at warning threshold and when exceeded. Supports webhook callbacks (Slack, Discord, etc.).
- **Multi-workspace teams** — create named teams, issue `obs-…` API keys, scope all telemetry per team. Switch workspaces in the dashboard sidebar.
- **VS Code extension** — status-bar token counter (+ ⚡cache indicator), sidebar live metrics, Ollama VRAM monitor, budget alert notifications, one-click proxy URL copy.
- **JetBrains plugin** — same metrics in IntelliJ IDEA, PyCharm, GoLand, WebStorm; tool window + status bar + balloon notifications.
- **CLI auto-detection** — Claude CLI, OpenAI Codex CLI, and Gemini CLI talk directly to provider APIs and are normally invisible. The VS Code extension fixes this by injecting `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, and `GEMINI_API_BASE` into every new integrated terminal, plus a passive `~/.claude/projects/**/*.jsonl` log watcher that POSTs token counts to `/analytics/ingest-cli`. The Sessions page has a Source filter (Proxy / CLI / Manual) and Live Overview shows a CLI Activity card.
- **Cost forecasting + anomaly detection** — `GET /analytics/forecast` projects weekly/monthly cost from the last 30 days; `GET /analytics/anomalies` flags requests with Z-score ≥ 2.5 on cost or token count. Both surface on the Live Overview.
- **Browser companion extension** — MV3 Chrome extension auto-ingests subscription usage from claude.ai, ChatGPT, and Gemini into ObservaAI with zero manual input.
- **Self-host on Kubernetes** — bundled Helm chart with Postgres StatefulSet, Secret-injected API keys, optional Ingress.
- **One-click Railway deploy** — `railway.json` configs in `apps/gateway/` and `apps/dashboard/` for instant cloud hosting.
- **Local-first** — SQLite by default, no external services, no telemetry. Your prompts stay on your machine.
- **Postgres-ready** — swap to Postgres for production; Alembic migrations included.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Your code                                                            │
│   OpenAI SDK    Anthropic SDK    curl    VS Code    JetBrains IDE     │
└──────┬─────────────────┬──────────────┬──────────────┬───────────────┘
       │                 │              │              │
       └── baseURL: ─────┴──────────────┴──────────────┘
             http://localhost:8000/proxy/<provider>
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ObservaAI Gateway  (FastAPI · port 8000)                             │
│  ├─ /proxy/{provider}/{path}    transparent forward + record          │
│  ├─ /proxy/{provider}/{path}    transparent forward + record          │
│  ├─ /analytics/{live,timeline,costs,tokens,sessions,requests,cache}   │
│  ├─ /analytics/{rate-limits,errors}  rolling windows + error rates   │
│  ├─ /estimate                   pre-flight token + cost estimate      │
│  ├─ /ws/metrics                 live WebSocket push                   │
│  ├─ /budgets                    CRUD + /alerts endpoint               │
│  ├─ /teams                      team + API key management             │
│  ├─ /ollama/{status,ps,models}  local model passthrough               │
│  └─ /session/reset              new session                           │
└────────────┬─────────────────────────────────────────────┬───────────┘
             │ SQLite / Postgres                           │ WebSocket
             ▼                                             ▼
   ┌──────────────────────┐                   ┌───────────────────────────┐
   │  Database            │                   │  Dashboard  (Next.js 15)  │
   │  sessions, requests  │                   │  VS Code extension        │
   │  budgets, teams      │                   │  JetBrains plugin         │
   └──────────────────────┘                   └───────────────────────────┘
```

### Monorepo layout

```
ObservaAI/
├── apps/
│   ├── gateway/             FastAPI proxy + analytics + budgets + teams API
│   ├── dashboard/           Next.js 15 dashboard (App Router)
│   ├── vscode-extension/    VS Code sidebar, status bar, budget alerts
│   ├── jetbrains-plugin/    IntelliJ Platform plugin (Kotlin/Gradle)
│   └── browser-extension/   MV3 Chrome extension — auto-ingest from claude.ai / ChatGPT / Gemini
├── packages/
│   ├── shared-types/        TypeScript types shared by dashboard ↔ extensions
│   ├── provider-adapters/   Per-provider request/response helpers
│   ├── analytics-sdk/       Thin REST client for the gateway API
│   └── ui-components/       Reusable React UI primitives
├── docs/
│   ├── BEGINNER_GUIDE.md    First-time setup guide (no experience needed)
│   ├── CHANGELOG.md         Full session-by-session development log
│   └── assets/logo.svg      Brand assets
├── docker-compose.yml       Postgres + gateway + dashboard stack
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
    model="claude-haiku-4-5",
    max_tokens=256,
    messages=[{"role": "user", "content": "hi"}],
)
```

**OpenAI (TypeScript / JS)**
```typescript
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://localhost:8000/proxy/openai/v1" });
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

### Multi-workspace team keys

```python
# Scope all requests to a specific team workspace
client = OpenAI(
    base_url="http://localhost:8000/proxy/openai/v1",
    default_headers={"X-ObservaAI-Team-Key": "obs-your-key-here"},
)
```

Create teams and issue keys at http://localhost:3000/teams.

### VS Code extension

1. Build the `.vsix`:
   ```bash
   cd apps/vscode-extension && pnpm package
   ```
2. In VS Code: `Extensions: Install from VSIX…` → pick the generated file.
3. The **ObservaAI** activity-bar icon opens a sidebar with live metrics and
   proxy-URL copy buttons. The status bar shows running token total + cost.

Settings under `observaai.*`:
- `gatewayUrl` — gateway URL (default: `http://localhost:8000`)
- `teamApiKey` — `obs-…` key to scope metrics to your team workspace
- `ollamaUrl` — local Ollama daemon URL
- `enabled` / `showOllamaMetrics`

Commands (all under `ObservaAI:` in the command palette):
- Open Dashboard · Reset Session · Test Gateway Connection · Copy Proxy URL…

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

### Deploy on Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/prathamesh98rodge-tech/ObservaAI)

1. Click the button above — Railway clones the repo and detects the Dockerfiles automatically.
2. Add a **PostgreSQL** plugin to the project; Railway injects `DATABASE_URL` as an env var.
3. Set your provider API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) as Railway env vars on the gateway service.
4. Set `NEXT_PUBLIC_GATEWAY_URL` on the dashboard service to the gateway's Railway URL.

Each service has a `railway.json` in its directory (`apps/gateway/`, `apps/dashboard/`) with build and health-check settings.

### Self-host on Kubernetes (Helm)

```bash
# Install (bundled Postgres + gateway + dashboard)
helm install observaai ./helm/observaai \
  --set gateway.apiKeys.OPENAI_API_KEY=sk-... \
  --set gateway.apiKeys.ANTHROPIC_API_KEY=sk-ant-...

# Use an external database instead
helm install observaai ./helm/observaai \
  --set postgres.enabled=false \
  --set externalDatabaseUrl="postgresql+asyncpg://user:pass@host:5432/observaai"

# Enable Ingress
helm install observaai ./helm/observaai \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=observaai.mycompany.com
```

The chart (`helm/observaai/`) deploys:
- **Gateway** Deployment + ClusterIP Service
- **Dashboard** Deployment + ClusterIP Service
- **Postgres** StatefulSet + headless Service + PersistentVolumeClaim (5 Gi, skipped when `externalDatabaseUrl` is set)
- **Secret** with `DATABASE_URL` + any API keys
- Optional **Ingress** routing `/api` → gateway, `/` → dashboard

See `helm/observaai/values.yaml` for all configuration options.

### Browser companion extension (Chrome / Chromium)

The companion extension automatically ingests subscription usage from **claude.ai**,
**ChatGPT**, and **Gemini** into ObservaAI — no manual input required.

**How it works:**
- On **claude.ai**: intercepts the SSE stream and captures `message_limit` events
  (remaining messages + reset time) in real time.
- On **ChatGPT**: scrapes visible usage text ("7 GPT-4o messages left") with a
  MutationObserver.
- On **Gemini**: MutationObserver + periodic fallback for late-rendering SPAs.
- All data is debounced (5 s) and POSTed to `http://localhost:8000/subscriptions/ingest`
  via the background service worker.

**Install (developer mode):**

1. Open **Chrome → Settings → Extensions → Manage Extensions** → enable **Developer mode**.
2. Click **Load unpacked** and select `apps/browser-extension/`.
3. The ObservaAI icon appears in the toolbar. Click it to see sync status per provider.
4. If your gateway runs on a different port, click **Settings** in the popup to update the URL.

Once installed, every time you send a message in claude.ai / ChatGPT / Gemini the usage
snapshot silently syncs to ObservaAI. Open the **Subscriptions** page in the dashboard
(`http://localhost:3000/subscriptions`) to see the live capacity bars.

### CLI auto-detection (Claude CLI · Codex CLI · Gemini CLI)

CLIs like `claude`, `codex`, and `gemini` normally talk directly to provider APIs, so
ObservaAI never sees their traffic. The VS Code extension fixes this in three layers:

| Layer | What it does | When it kicks in |
|---|---|---|
| **Static env contribution** | `terminal.integrated.env.{linux,osx,windows}` in `package.json` sets `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `GEMINI_API_BASE` for every terminal VS Code opens | Immediately, every new terminal |
| **Dynamic `onDidOpenTerminal`** | When CLI Proxy is enabled, also re-exports the vars via `terminal.sendText` so they survive shell-rc resets | New terminals while extension is active |
| **Claude CLI log watcher** | Watches `~/.claude/projects/**/*.jsonl`, parses new entries on file change, POSTs token counts to `POST /analytics/ingest-cli` (recorded with `source='cli-log'`); dedup set persisted in `globalState` | Any Claude CLI session, even if env injection is off |

**Status bar:** `● CLI proxy: active` (click to toggle).
**Sidebar filter:** Sessions page has a Source chip group — `All` / `Proxy` / `CLI` / `Manual`.
**Live Overview:** CLI Activity card shows detected CLIs, tokens today, last seen time.

If you use the CLIs outside VS Code, run:

```
ObservaAI: Configure Shell for CLI Detection   (Command Palette)
```

This calls `GET /setup/shell-exports`, detects your default shell (bash / zsh / fish / PowerShell),
and idempotently appends a marker-wrapped export block to your shell profile so any future
terminal session (Warp, iTerm, Windows Terminal, etc.) routes CLI traffic through ObservaAI too.

```
┌─────────────────┐    ANTHROPIC_BASE_URL    ┌──────────────────────┐
│ Claude CLI      │ ──────────────────────►  │ ObservaAI Gateway    │
│ Codex CLI       │     OPENAI_BASE_URL      │ /proxy/<provider>    │
│ Gemini CLI      │     GEMINI_API_BASE      │  source = 'proxy'    │
└─────────────────┘                          └──────────┬───────────┘
                                                        │
┌─────────────────┐                                     │
│ Claude CLI logs │ ──── log watcher (passive) ────►    │
│ ~/.claude/      │     POST /analytics/ingest-cli      │
│   projects/...  │       source = 'cli-log'            │
└─────────────────┘                                     │
                                                        ▼
                                              ┌──────────────────────┐
                                              │ Live Overview        │
                                              │  · CLI Activity card │
                                              │ Sessions page        │
                                              │  · Source filter     │
                                              └──────────────────────┘
```

---

## Configuration

Everything lives in `.env`:

| Variable | Default | Notes |
| --- | --- | --- |
| `DEBUG` | `false` | Verbose FastAPI logs |
| `DATABASE_URL` | `sqlite+aiosqlite:///./observaai.db` | Any SQLAlchemy async URL |
| `OPENAI_API_KEY` | `""` | Injected into `Authorization: Bearer` |
| `ANTHROPIC_API_KEY` | `""` | Injected into `x-api-key` |
| `GEMINI_API_KEY` | `""` | Injected as `?key=` |
| `OPENROUTER_API_KEY` | `""` | |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama daemon |
| `CORS_ORIGINS` | `["http://localhost:3000", ...]` | JSON array of allowed origins |
| `NEXT_PUBLIC_GATEWAY_URL` | `http://localhost:8000` | Dashboard → gateway URL |

---

## Development

### Prerequisites
- Node 22+ and **pnpm** 9+
- Python 3.12+
- (optional) Docker + Compose for the full containerized stack
- (optional) JDK 21 + Gradle 8 for the JetBrains plugin

### From scratch

```bash
git clone https://github.com/prathamesh98rodge-tech/ObservaAI.git
cd ObservaAI
make install            # JS deps + Python venv + .env
make dev                # gateway (port 8000) + dashboard (port 3000)
```

### Useful commands

```bash
make test               # gateway pytest suite (53 tests)
make typecheck          # tsc --noEmit across all TS apps
make build              # production build of dashboard + VS Code extension
make build-jetbrains    # build JetBrains plugin ZIP (needs JDK 21 + network)
make up                 # full Docker stack (gateway + dashboard + Postgres)
make logs               # tail container logs
make reset              # drop local SQLite DB
make clean              # remove node_modules, .venv, .next, dist
make migrate            # apply pending Alembic migrations (Postgres)
```

### Project scripts

| Workspace | Command | What it does |
| --- | --- | --- |
| `@observaai/dashboard` | `pnpm dev` / `pnpm build` | Next.js 15 App Router |
| `observaai-vscode` | `pnpm build` / `pnpm package` | esbuild → `dist/extension.js` / `.vsix` |
| `observaai-jetbrains` | `./gradlew buildPlugin` | Kotlin → plugin ZIP |
| `apps/gateway` | `.venv/bin/uvicorn app.main:app --reload` | FastAPI on :8000 |

---

## Testing

```bash
make test
# 53 passed in ~15s
```

Covers:
- End-to-end proxying for all 5 providers (non-streaming + streaming)
- Token extraction from each provider's response shape
- Cost estimation + cache savings against the built-in price table
- All `/analytics/*` endpoints including SQLite time-bucketing
- Budget CRUD, alert level computation, not-found cases
- Team auth: valid key resolves team_id; invalid key returns 401
- Unknown-provider 404 path
- `context_window_pct()` for known and unknown models
- `estimate_tokens()` heuristic fallback
- `POST /estimate` response shape and context_pct calculation
- `GET /analytics/rate-limits` and `GET /analytics/errors` empty-state responses

---

## Security

ObservaAI is **local-first by design**:

- **No outbound telemetry.** The gateway only talks to the providers you call.
- **API keys never leave your machine.** They live in `.env` (gitignored), are injected into upstream requests server-side, and are never sent to the dashboard or extension.
- **Team API keys** (`obs-…`) are stored in plaintext in the local database — treat them like passwords; revoke them in the Teams UI if compromised.
- **CORS is strict** — only the origins listed in `CORS_ORIGINS` can call the gateway from a browser.
- **Hop-by-hop headers stripped** before responding (`connection`, `transfer-encoding`, etc.).
- **SQLite is local-file** by default; nothing is uploaded.

If you deploy the gateway behind a public hostname:
1. Put it behind TLS (nginx/Caddy/Traefik).
2. Restrict `CORS_ORIGINS` to your real dashboard hostname only.
3. Add auth middleware or a reverse-proxy `auth_request`.
4. Switch `DATABASE_URL` to Postgres for concurrent writers.

---

## Roadmap

| Status | Feature |
|---|---|
| ✅ | Turborepo monorepo scaffold |
| ✅ | Transparent proxy — OpenAI, Anthropic, Gemini, Ollama, OpenRouter |
| ✅ | Token & cost tracking with built-in price tables |
| ✅ | Live dashboard (Next.js 15, WebSocket push, HTTP polling fallback) |
| ✅ | VS Code extension — sidebar, status bar, Ollama VRAM, budget alerts |
| ✅ | Postgres support + Alembic migrations |
| ✅ | Prompt cache hit-rate metrics |
| ✅ | Cost-budget alerts (per-workspace, per-provider, webhook callbacks) |
| ✅ | Multi-workspace teams with `obs-…` API key authentication |
| ✅ | JetBrains plugin (IntelliJ, PyCharm, GoLand, WebStorm) |
| ✅ | VS Code + JetBrains Marketplace releases (CI/CD workflows, packaging, icons, store metadata) |
| ✅ | Context window % per request, cache expiry indicator, rolling rate-limit windows, `/estimate` endpoint, error rate analytics |
| ✅ | Subscription capacity tracking — ingest Claude Pro / ChatGPT Plus / Gemini Pro hourly·daily·weekly usage; progress bars in VS Code sidebar + dashboard `/subscriptions`; `POST /handover/generate` packages context for one-command provider switching |
| ✅ | Browser companion extension (MV3) — auto-ingest usage bars from claude.ai / chat.openai.com / gemini.google.com |
| ✅ | Cost forecasting + anomaly detection — `/analytics/forecast`, `/analytics/anomalies` (Z-score), Live Overview widgets |
| ✅ | Self-hosted Helm chart / Railway one-click deploy |
| ✅ | CLI auto-detection — VS Code terminal env injection, Claude CLI log watcher, shell profile setup, Source filter, CLI Activity card |

---

## Docs

| Document | Description |
|---|---|
| [Beginner Guide](docs/BEGINNER_GUIDE.md) | First-time setup, no prior experience needed |
| [Development Log](docs/CHANGELOG.md) | Full week-by-week build history and architecture decisions |

---

## License

MIT © ObservaAI contributors. See [LICENSE](LICENSE).
