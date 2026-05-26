# ObservaAI — Session Log & History

> **Read this at the start of every new session.**  
> Contains full build history, key file map, architecture decisions, and the current sprint plan.  
> Append new entries here as each week completes.

---

## Quick-start for a new session

```bash
git checkout claude/happy-goldberg-4tXbl   # or main
# Gateway
cd apps/gateway && pip install -r requirements.txt && uvicorn app.main:app --reload
# Dashboard
cd apps/dashboard && pnpm dev
```

URLs: Gateway → http://localhost:8000 | Dashboard → http://localhost:3000

---

## Current state at a glance

| Layer | What exists | Port |
|---|---|---|
| Gateway (FastAPI) | Proxy + analytics + budgets + teams API | 8000 |
| Dashboard (Next.js 15) | Live charts, costs, sessions, teams, budgets, settings | 3000 |
| VS Code extension | Sidebar metrics, status bar, Ollama, budget alerts, team key | — |
| JetBrains plugin | Tool window, status bar, budget alerts, settings, team key | — |
| Database | SQLite (dev) / Postgres (prod via Docker Compose) | 5432 |
| CI/CD | GitHub Actions: ci.yml, release-vscode.yml, release-jetbrains.yml | — |

**Active branch:** `claude/happy-goldberg-4tXbl` (merges into `main` after each week)  
**Last completed week:** Week 9 — Marketplace release packaging  
**Next up:** Week 10 — Context window %, cache expiry, rolling rate-limit windows, `/estimate` endpoint

---

## Monorepo layout

```
ObservaAI/
├── apps/
│   ├── gateway/                  FastAPI proxy + analytics API
│   │   ├── app/
│   │   │   ├── main.py           FastAPI app, lifespan, router mounts
│   │   │   ├── config.py         Pydantic Settings (.env)
│   │   │   ├── database.py       SQLAlchemy async engine, get_db, init_db, is_postgres()
│   │   │   ├── adapters/         ProviderAdapter protocol + 5 adapters
│   │   │   │   ├── base.py       UsageStats dataclass, ProviderAdapter protocol
│   │   │   │   ├── openai.py
│   │   │   │   ├── anthropic.py
│   │   │   │   ├── gemini.py
│   │   │   │   ├── ollama.py
│   │   │   │   └── openrouter.py
│   │   │   ├── models/
│   │   │   │   ├── session.py    Session model (id, team_id, workspace, started_at)
│   │   │   │   ├── request.py    Request model (tokens, cost, latency, cache_savings_usd)
│   │   │   │   ├── budget.py     Budget model (label, provider, period, limit_usd, alert_pct)
│   │   │   │   └── team.py       Team + TeamApiKey models (obs- prefixed keys)
│   │   │   ├── routers/
│   │   │   │   ├── proxy.py      POST /proxy/{provider}/{path} — transparent proxy
│   │   │   │   ├── analytics.py  /analytics/live|tokens|costs|cache|timeline|sessions
│   │   │   │   ├── budgets.py    CRUD + /budgets/alerts
│   │   │   │   ├── teams.py      CRUD teams + API keys
│   │   │   │   └── websocket.py  ws://localhost:8000/ws/metrics
│   │   │   └── services/
│   │   │       ├── pricing.py        Cost + cache savings estimation
│   │   │       ├── request_store.py  record_request() — DB insert + WS broadcast
│   │   │       ├── session_service.py dict[team_id, session_id] keying
│   │   │       ├── metrics_bus.py    async pub/sub MetricsBus
│   │   │       ├── budget_checker.py runs after every request, webhook on alert
│   │   │       └── team_service.py   get_team_id FastAPI dependency (X-ObservaAI-Team-Key)
│   │   ├── alembic/              Async migrations (001–005)
│   │   ├── tests/                pytest + aiosqlite in-memory
│   │   └── requirements.txt
│   │
│   ├── dashboard/                Next.js 15 App Router
│   │   └── src/
│   │       ├── app/
│   │       │   ├── page.tsx          Overview (LiveOverview)
│   │       │   ├── providers/        Per-provider token table
│   │       │   ├── costs/            Donut + area charts, cache hit-rate
│   │       │   ├── sessions/         Collapsible session list + request drill-down
│   │       │   ├── budgets/          Create/edit/delete budgets, live spend bars
│   │       │   └── teams/            Create teams, manage API keys
│   │       ├── components/
│   │       │   ├── charts/           ProviderDonutChart, CostAreaChart, etc.
│   │       │   └── layout/Sidebar.tsx Team switcher + nav
│   │       ├── hooks/useLiveMetrics.ts  WebSocket hook with reconnect
│   │       └── lib/
│   │           ├── api.ts            All fetch helpers (accept teamId param)
│   │           ├── store.ts          Zustand (selectedTeamId persisted, metrics ephemeral)
│   │           └── utils.ts          formatCost, formatTokens, PROVIDER_COLORS
│   │
│   ├── vscode-extension/
│   │   ├── src/extension/
│   │   │   ├── index.ts          activate/deactivate, command registrations
│   │   │   ├── SessionManager.ts EventEmitter, polls /analytics/live every 8s, WS reconnect
│   │   │   └── StatusBarController.ts  ⬡ 12.3K · $0.04
│   │   ├── src/providers/
│   │   │   ├── MetricsPanelProvider.ts  Sidebar webview (connection, stats, providers, Ollama)
│   │   │   └── ProxyUrlsProvider.ts     Copy-to-clipboard proxy URLs
│   │   ├── media/                icon.png (128×128), icon.svg, observaai-activity-bar.svg
│   │   ├── package.json          Full marketplace metadata, @vscode/vsce
│   │   └── .vscodeignore
│   │
│   └── jetbrains-plugin/         Kotlin + Gradle, IntelliJ Platform Gradle Plugin v1 (1.17.4)
│       └── src/main/kotlin/ai/observaai/
│           ├── MetricsState.kt       Data classes (MetricsState, ProviderUsage, BudgetAlert)
│           ├── MetricsTopic.kt       METRICS_TOPIC application bus topic
│           ├── ObservaAISettings.kt  PersistentStateComponent → observaai.xml
│           ├── GatewayPoller.kt      ScheduledExecutor, polls live+alerts, fires notifications
│           ├── SettingsConfigurable.kt Settings → Tools → ObservaAI
│           ├── toolwindow/
│           │   ├── MetricsToolWindowFactory.kt
│           │   └── MetricsPanel.kt   JTextPane HTML, dark/light theme, Disposer lifecycle
│           └── statusbar/
│               ├── TokenStatusBarWidget.kt   ⬡ tokens · $cost
│               └── TokenStatusBarWidgetFactory.kt
│
├── packages/
│   └── shared-types/             LiveMetrics, TokenUsageSummary TS interfaces
│
├── docs/
│   ├── log-history.md            ← YOU ARE HERE — session context file
│   ├── CHANGELOG.md              Same history in CHANGELOG format
│   ├── BEGINNER_GUIDE.md         Zero-to-running guide for first-time users
│   └── assets/logo.svg           ObservaAI lighthouse SVG logo
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                gateway pytest + dashboard + extension typecheck on every push
│   │   ├── release-vscode.yml    triggered on vscode-v* tags
│   │   └── release-jetbrains.yml triggered on jetbrains-v* tags
│   └── PUBLISHING.md             Secrets + manual release flow docs
│
├── scripts/generate_icon.py      Generates media/icon.png (128×128) without external deps
├── docker-compose.yml            postgres:16-alpine + gateway
├── Makefile                      install, dev, build, test, up, down, reset, build-jetbrains
├── install.sh                    curl-pipe installer
└── README.md                     Full project README with badges + architecture diagram
```

---

## Week-by-week build history

### Week 1 — Monorepo scaffold
**Commit:** `d243141`
- Turborepo + pnpm workspaces monorepo
- `apps/gateway/` FastAPI skeleton (CORS, health endpoint, lifespan)
- `apps/dashboard/` Next.js 15 App Router skeleton
- `packages/shared-types/` — LiveMetrics, TokenUsageSummary TS interfaces
- `turbo.json`, `pnpm-workspace.yaml`

### Week 2 — Provider proxy layer
**Commit:** `40d9586`
- Transparent HTTP proxy: `POST /proxy/{provider}/{path:path}`
- ProviderAdapter protocol: `build_headers`, `target_url`, `extract_usage`, `extract_usage_from_stream`
- Adapters: OpenAI, Anthropic, Gemini, Ollama, OpenRouter
- SSE streaming: chunks proxied immediately, usage extracted post-stream
- Session + Request SQLAlchemy models
- `record_request()` — cost estimation, DB insert, WebSocket broadcast
- `MetricsBus` — async pub/sub for live metrics
- Pricing tables in `services/pricing.py`

### Week 3 — Live dashboard
**Commit:** `2575092`
- Dashboard layout: Sidebar + content area
- Pages: `/` Overview, `/providers`, `/costs` (donut + area charts), `/sessions`
- `useLiveMetrics` WebSocket hook + TanStack Query polling fallback
- Recharts charts, Zustand store, `formatCost` / `formatTokens` utils

### Week 4 — VS Code extension
**Commit:** `c1833dd`
- `SessionManager` — polls `/analytics/live`, WS reconnect with exponential backoff
- `MetricsPanelProvider` — sidebar webview (connection banner, session stats, per-provider cards, Ollama VRAM)
- `StatusBarController` — `⬡ 12.3K · $0.04`
- Budget alert polling every 30s, dedup via `seenAlertIds`
- esbuild bundle → `dist/extension.js`

### Ship-ready packaging
**Commit:** `acf6c2e`
- `install.sh` — curl-pipe installer (Docker vs manual)
- Full `README.md`, `Makefile`, `LICENSE`

### Week 5 — Postgres + Alembic + cache metrics
**Commit:** `ec9899d`
- Alembic async migrations 001–003 (sessions, requests, budgets)
- `is_postgres()` helper; `init_db()` skips `create_all` on Postgres
- `_time_bucket()`: `func.strftime` (SQLite) vs `cast(func.date_trunc(...), String)` (Postgres)
- `docker-compose.yml` with postgres:16-alpine
- Cache metrics: `cache_savings_usd`, `estimate_cache_savings()`, `/analytics/cache` endpoint
- Dashboard `/costs` shows cache hit-rate section

### Week 6 — Cost-budget alerts
**Commit:** `2c19238`
- `Budget` model: label, workspace, provider, period (day/week/month), limit_usd, alert_pct, webhook_url
- `GET/POST/PATCH/DELETE /budgets`, `GET /budgets/alerts`
- `budget_checker.py`: runs after every request, escalation none→warning→exceeded, webhook via httpx
- Dashboard `/budgets` page: create/edit/delete, live spend bars, level badges
- VS Code: `showWarningMessage` / `showErrorMessage` on alert

### Week 7 — Multi-workspace / Teams
**Commit:** `3c623c9`
- `Team` + `TeamApiKey` models; `generate_api_key()` → `obs-` + 40 hex chars
- Alembic migrations 004 (teams + team_api_keys) + 005 (session.team_id FK, batch mode for SQLite)
- `team_service.py`: `get_team_id` FastAPI dependency — reads `X-ObservaAI-Team-Key` header
- Full CRUD `/teams` + `/teams/{id}/keys`
- Session keying changed: `dict[str|None, str]` team_id → session_id
- Analytics: `?team_id=` filter on all endpoints via subquery
- Dashboard: team switcher dropdown in Sidebar, `/teams` page, Zustand persist for `selectedTeamId`
- VS Code: `observaai.teamApiKey` setting, `teamHeaders()` helper

### Week 8 — JetBrains plugin
**Commit:** `f597b78`
- IntelliJ Platform Gradle Plugin v1 (1.17.4), JVM 21, Gson bundled as `implementation`
- `GatewayPoller`: ScheduledExecutorService, polls `/analytics/live` every 8s + `/budgets/alerts` every 30s
- `MetricsPanel`: JTextPane HTML, dark/light theme via `UIUtil.getPanelBackground()`
- `TokenStatusBarWidget`: `⬡ tokens · $cost`, click → open tool window
- `ObservaAISettings`: PersistentStateComponent → `observaai.xml`
- `Disposer.register(this, conn)` pattern for bus connection lifecycle
- Build note: `./gradlew buildPlugin` needs ~600 MB IntelliJ SDK download (blocked in CI sandbox)

### Week 9 — Marketplace release packaging
**Commits:** `d17f465`, `52a456e`
- **VS Code**: full marketplace `package.json` (keywords, galleryBanner, icon, repository), `.vscodeignore`, `README.md`, `CHANGELOG.md`, `media/icon.png` (128×128), `media/observaai-activity-bar.svg`, `@vscode/vsce` added
- **JetBrains**: `plugin.xml` with `<id>`, `<vendor>`, HTML description + change-notes, `<idea-version since-build="241"/>`. `build.gradle.kts` adds `signPlugin` + `publishPlugin` (env var driven)
- **GitHub Actions**: `ci.yml` (gateway pytest + dashboard + extension on every push), `release-vscode.yml` (on `vscode-v*` tag), `release-jetbrains.yml` (on `jetbrains-v*` tag)
- **Fix**: `pnpm-lock.yaml` updated after lockfile went stale (caused VS Code + Dashboard CI failures)
- **Release commands**: `git tag vscode-v0.1.0 && git push origin vscode-v0.1.0`

---

## Architecture decisions

| Decision | Choice | Reason |
|---|---|---|
| Streaming proxy | Accumulate chunks, parse after stream close | Avoids modifying SSE frames mid-flight |
| SQLite in tests | `create_all` + aiosqlite in-memory per test | Fast, no Postgres needed in CI |
| Alembic + SQLite | `batch_alter_table` for FK/index adds | SQLite can't ALTER TABLE to add constraints |
| Budget checker isolation | `try/except` wraps entire check | Budget errors must never break proxy response |
| Session keying | `dict[str|None, str]` team_id → session_id | One session per team per process lifetime |
| JetBrains JSON | Bundle Gson as `implementation` dep | Avoids IntelliJ classloader coupling |
| Zustand persist | Only `selectedTeamId` persisted | Avoids stale metrics in storage |
| Lockfile discipline | Always run `pnpm install` after editing any `package.json` | CI uses `--frozen-lockfile`; mismatch = hard fail |

---

## Known gotchas

- **Stale SQLite DB**: if `sessions` table missing `team_id`, delete `apps/gateway/observaai.db` and restart — `init_db()` recreates it
- **JetBrains build**: `./gradlew buildPlugin` blocked in CI sandbox (needs `download.jetbrains.com`); works on developer machine
- **pnpm lockfile**: any `package.json` change requires `pnpm install` before commit or CI fails with `--frozen-lockfile`
- **TypeScript TanStack Query**: never pass async functions directly as `queryFn` when they have optional params — wrap in `() => fn()`
- **HeadersInit not in Node**: VS Code extension runs in Node context; use `Record<string, string>` not `HeadersInit`

---

## Competitive analysis — claude-counter (inspiration project)

**Repo:** https://github.com/she-llac/claude-counter  
**What it is:** Chrome extension for claude.ai only — injects into the DOM to show token count, cache timer, and rate-limit usage bars.

### What they do that we don't (yet)

| Feature | Their approach | Our advantage when we build it |
|---|---|---|
| Context window % | Client-side `o200k_base` tokenizer, counts tokens vs 200K limit | We see exact server-reported token counts at proxy, all 5 providers |
| Cache expiry countdown | Tracks `cachedUntil` timestamp (Anthropic caches 5 min) | We persist `created_at` per request — can calculate server-side |
| Rolling 5h/7d rate-limit bars | Intercepts Claude's SSE `message_limit` events | We see raw token counts at proxy, no scraping needed |
| Pre-send token estimate | `o200k_base` tokenizer before user hits send | We can add a `/estimate` endpoint using `tiktoken` / Anthropic count API |

### What we have that they never will
- Multi-provider (all 5 — not just Claude)
- Persistent history (SQLite/Postgres)
- Real dollar cost + budget alerts + webhooks
- Team workspaces + API key scoping
- VS Code + JetBrains IDE-native integration (not browser-only)
- Works with any SDK (Python, TS, curl) — not just the claude.ai web UI

---

## Week 10 plan — Prompt analytics + claude-counter features

> Replaces original "Prompt analytics" plan with a more impactful combined sprint.

### 1. Context window % per request
**Where:** `apps/gateway/app/services/pricing.py` + `apps/gateway/app/models/request.py`  
**What:**
- Add `context_limit` map per model (e.g. gpt-4o=128K, claude-3-5-sonnet=200K, gemini-1.5-pro=1M)
- Compute `context_pct = round(input_tokens / context_limit * 100, 1)` in `record_request()`
- Add `context_pct` column to `Request` model + Alembic migration `006_context_pct.py`
- Expose in `/analytics/live` response
- Show in dashboard `/sessions` request drill-down (color: green <50%, yellow <80%, red >80%)
- Show in VS Code sidebar and JetBrains panel

### 2. Cache expiry status per request
**Where:** `apps/gateway/app/models/request.py` + `apps/gateway/app/routers/analytics.py`  
**What:**
- Add `cache_expires_at` column: `created_at + timedelta(minutes=5)` when `cached_tokens > 0` (Anthropic only)
- `/analytics/sessions` response includes `cache_expires_at` and `cache_active: bool` (server computes at query time)
- Dashboard `/sessions`: green "cache ✓" badge on requests within cache window, grey "cache ✗" after
- VS Code status bar: append `· ⚡cache` when last request is within cache window

### 3. Rolling token-rate windows (5h / 7d per provider)
**Where:** `apps/gateway/app/routers/analytics.py`  
**What:**
- New endpoint `GET /analytics/rate-limits` — returns per-provider token usage for last 5h and 7d
- Response: `{ provider, tokens_5h, tokens_7d, reset_5h_at, reset_7d_at }`
- Dashboard: new widget on Overview page with usage bars + "resets in Xh Ym" countdown
- VS Code + JetBrains: show in sidebar/panel below per-provider cards

### 4. `/estimate` endpoint (pre-flight cost estimate)
**Where:** `apps/gateway/app/routers/` — new file `estimate.py`  
**What:**
- `POST /estimate` — body: `{ provider, model, messages: [...] }`
- Uses `tiktoken` (pip) for OpenAI models; Anthropic's `client.messages.count_tokens()` for Claude; character heuristic for others
- Returns: `{ estimated_input_tokens, estimated_cost_usd, context_pct }`
- VS Code command: "ObservaAI: Estimate cost of clipboard prompt" — reads clipboard, calls `/estimate`, shows info message

### 5. Top prompts / error rate analytics (original Week 10 plan)
**Where:** `apps/gateway/app/routers/analytics.py` + dashboard  
**What:**
- Track `status_code` on `Request` model (already have it from proxy response)
- New endpoint `GET /analytics/errors` — error rate per provider per time bucket
- Dashboard `/providers` page: add error rate column + sparkline

### Alembic migrations needed
- `006_context_pct.py` — adds `context_pct REAL` to requests
- `007_cache_expires_at.py` — adds `cache_expires_at DATETIME` to requests

### New pip dependency
- `tiktoken` — for OpenAI token counting in `/estimate`

---

## Roadmap

| Week | Feature | Status |
|---|---|---|
| 1 | Monorepo scaffold | ✅ |
| 2 | Provider proxy layer (5 providers) | ✅ |
| 3 | Live dashboard (Next.js 15, WebSocket) | ✅ |
| 4 | VS Code extension | ✅ |
| 4.5 | Ship-ready packaging (install.sh, Makefile, README) | ✅ |
| 5 | Postgres + Alembic + cache metrics | ✅ |
| 6 | Cost-budget alerts (per-workspace, webhooks) | ✅ |
| 7 | Multi-workspace teams + API key auth | ✅ |
| 8 | JetBrains plugin | ✅ |
| 9 | Marketplace release packaging (CI/CD, icons, store metadata) | ✅ |
| 10 | Context window %, cache expiry, rate-limit windows, /estimate | ✅ |
| 11 | Cost forecasting + anomaly detection | ⬜ |
| 12 | Self-hosted Helm chart / Railway deploy button | ⬜ |
