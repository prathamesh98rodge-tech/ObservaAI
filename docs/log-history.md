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

**Active branch:** `main`  
**Last completed week:** Week 14 — CLI auto-detection (Claude CLI / Codex CLI / Gemini CLI) + source tagging  
**Next up:** (roadmap complete — see below for future ideas)

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
│   │   │   │   ├── session.py        Session model (id, team_id, workspace, started_at)
│   │   │   │   ├── request.py        Request model (tokens, cost, latency, cache_savings_usd, context_pct, cache_expires_at, status_code)
│   │   │   │   ├── budget.py         Budget model (label, provider, period, limit_usd, alert_pct)
│   │   │   │   ├── team.py           Team + TeamApiKey models (obs- prefixed keys)
│   │   │   │   └── subscription.py   SubscriptionUsage model (provider, plan, hourly/daily/weekly used+limit, recorded_at)
│   │   │   ├── routers/
│   │   │   │   ├── proxy.py           POST /proxy/{provider}/{path} — transparent proxy
│   │   │   │   ├── analytics.py       /analytics/live|tokens|costs|cache|timeline|sessions|rate-limits|errors
│   │   │   │   ├── budgets.py         CRUD + /budgets/alerts
│   │   │   │   ├── teams.py           CRUD teams + API keys
│   │   │   │   ├── estimate.py        POST /estimate — pre-flight token+cost estimate
│   │   │   │   ├── subscriptions.py   POST /subscriptions/ingest | GET /subscriptions | GET /subscriptions/recommend
│   │   │   │   ├── handover.py        POST /handover/generate — markdown context-switch doc
│   │   │   │   └── websocket.py       ws://localhost:8000/ws/metrics
│   │   │   └── services/
│   │   │       ├── pricing.py        Cost + cache savings estimation
│   │   │       ├── request_store.py  record_request() — DB insert + WS broadcast
│   │   │       ├── session_service.py dict[team_id, session_id] keying
│   │   │       ├── metrics_bus.py    async pub/sub MetricsBus
│   │   │       ├── budget_checker.py runs after every request, webhook on alert
│   │   │       └── team_service.py   get_team_id FastAPI dependency (X-ObservaAI-Team-Key)
│   │   ├── alembic/              Async migrations (001–009)
│   │   ├── tests/                pytest + aiosqlite in-memory
│   │   └── requirements.txt
│   │
│   ├── dashboard/                Next.js 15 App Router
│   │   └── src/
│   │       ├── app/
│   │       │   ├── page.tsx          Overview (LiveOverview)
│   │       │   ├── providers/        Per-provider token table
│   │       │   ├── costs/            Donut + area charts, cache hit-rate
│   │       │   ├── sessions/         Collapsible session list + request drill-down (ctx%, cache badge)
│   │       │   ├── budgets/          Create/edit/delete budgets, live spend bars
│   │       │   ├── teams/            Create teams, manage API keys
│   │       │   └── subscriptions/    Capacity bars per provider + ingest form + recommendation banner
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
│   ├── assets/logo.svg           ObservaAI lighthouse SVG logo
│   └── assets/ObservaAI.png      ObservaAI brand logo (PNG — used in README)
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

### Week 10 — Prompt analytics + claude-counter features
**Commits:** `add31ae`, `a73f747`, `ee26f11`
- **Context window %**: `CONTEXT_LIMITS` map in `pricing.py` (all 5 providers); `context_window_pct()` computes `input_tokens / limit * 100`; `context_pct REAL` column + Alembic migration 006; stored on every request; exposed in `/analytics/requests`; dashboard Sessions page shows color-coded badge (green <50%, yellow <80%, red ≥80%)
- **Cache expiry**: `cache_expires_at DATETIME` column + migration 007; set to `created_at + 5 min` for Anthropic requests with cached tokens; `cache_active: bool` computed at query time in `/analytics/requests`; Sessions page shows ⚡ active / expired badge; VS Code status bar appends `· ⚡cache` when last request is within window
- **Rolling rate-limit windows**: `GET /analytics/rate-limits` — per-provider token totals for last 5h and 7d; dashboard Overview shows "Rolling Token Windows" widget with provider rows and reset countdown
- **`/estimate` endpoint**: `POST /estimate` — `{provider, model, messages}` → `{estimated_input_tokens, estimated_cost_usd, context_pct}`; uses `tiktoken` for OpenAI models (with `encoding_for_model` + o200k_base fallback); character heuristic for all others; `tiktoken==0.9.0` added to requirements
- **Error rate analytics**: `status_code INTEGER` column + migration 008; proxy router passes upstream status on every non-streaming request; `GET /analytics/errors` aggregates error/total counts per provider in Python; `fetchErrors()` added to dashboard api.ts
- **CI fixes**: Removed explicit `version:` from `pnpm/action-setup@v4` in `ci.yml` and `release-vscode.yml` — action reads `packageManager` from `package.json` automatically; specifying both causes `ERR_PNPM_BAD_PM_VERSION`
- **Tests**: 10 new tests for Week 10 features (context_window_pct, estimate_tokens, /estimate, /rate-limits, /errors)

### Week 14 — CLI auto-detection (Claude CLI / Codex CLI / Gemini CLI)

**Problem:** ObservaAI only captures traffic routed through its proxy. Claude CLI, OpenAI Codex CLI, and Google Gemini CLI talk directly to provider APIs — their token and cost usage is invisible in the dashboard and VS Code status bar.

**Solution:** Three-layer approach — static env contribution + dynamic `onDidOpenTerminal` injection + passive Claude CLI log file watcher — plus a `source` column on requests so the dashboard can distinguish CLI-originated traffic from proxied SDK calls.

**Plan document:** `docs/plan-cli-detection.md` (5 steps, generated by `/plan-orchestrate`).

**Gateway changes**
- Alembic migration `010_source.py` — adds `source VARCHAR(20) DEFAULT 'proxy'` column to `requests` table with `ix_requests_source` index
- `Request` SQLAlchemy model: `source` field
- `record_request()` accepts new `source: str = "proxy"` kwarg, persists it
- `POST /analytics/ingest-cli` — accepts `{provider, model, input_tokens, output_tokens, timestamp?, workspace?, team_id?}`, creates a Session + Request with `source='cli-log'`, returns `{id, cost}`
- `GET /analytics/requests` — new `?source=` filter
- `GET /analytics/live` — response extended with `cliActivity: {detected: string[], tokensToday: number, lastSeenAt: ISO | null}`; queried via `WHERE source='cli-log' AND created_at >= today_start GROUP BY provider`
- `GET /setup/shell-exports` (new `app/routers/setup.py`) — returns per-shell export blocks for the current gateway URL; settings.gateway_url added to config

**VS Code extension changes**
- `terminal.integrated.env.{linux,osx,windows}` contributions in `package.json` — set `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `GEMINI_API_BASE` for every terminal VS Code opens
- `window.onDidOpenTerminal` listener — when CLI proxy state is enabled (stored in `globalState`), re-exports the three env vars via `terminal.sendText` (PowerShell on win32, `export` elsewhere)
- New status bar item showing `● CLI proxy: active` / `○ CLI proxy: off` with toggle action
- New commands:
  - `observaai.toggleCliProxy` — flips the globalState flag, updates the status bar
  - `observaai.configureShellForCli` — calls `GET /setup/shell-exports`, shows a QuickPick (bash/zsh, fish, PowerShell), idempotently appends the export block (marker comment `# ObservaAI CLI detection`) to the matching profile file
- `ClaudeLogWatcher` (`apps/vscode-extension/src/extension/ClaudeLogWatcher.ts`):
  - Uses `vscode.workspace.createFileSystemWatcher` on `~/.claude/projects/**/*.jsonl`
  - On change: reads file, slices new lines using a per-file offset Map, parses JSONL, extracts `usage.input_tokens`/`output_tokens` and `model`, POSTs to `/analytics/ingest-cli`
  - Deduplicates via `Set<file:lineNumber>` persisted to `globalState` (capped at 5000 entries)
  - Gracefully no-ops if `~/.claude/` doesn't exist

**Dashboard changes**
- `apps/dashboard/src/lib/api.ts`:
  - `fetchRequests(sessionId?, teamId?, source?)` — new optional `source` filter param
  - `CliActivity` interface exported
- `apps/dashboard/src/app/sessions/page.tsx`:
  - `SourceFilter` chip group (`All` / `Proxy` / `CLI` / `Manual`), re-queries with new filter on click
  - `Terminal` icon badge next to provider name on rows with `source === 'cli-log'`
- `apps/dashboard/src/components/LiveOverview.tsx`:
  - New `useQuery` polling `/analytics/live` for `cliActivity` (30 s)
  - `CliActivityCard` component — cyan-tinted card with `Terminal` icon, chip per detected CLI, two-column grid (tokens today, last seen)

**Logo / design consistency**
- Copied `apps/vscode-extension/media/icon.{svg,png}` to:
  - `apps/dashboard/public/logo.svg`, `logo.png`, `favicon.svg`
  - `apps/browser-extension/icons/icon.svg`, `icon128.png`
- Dashboard `Sidebar` now renders the SVG logo next to the "ObservaAI" title
- Dashboard `layout.tsx` metadata sets `icons.icon` → `/favicon.svg`
- Browser extension `manifest.json` declares `icons` (16/48/128) + `action.default_icon`
- Browser extension popup + options HTML render the 22 px logo in the header

**Tests added**
- `apps/gateway/tests/conftest.py` — autouse fixture truncates all SQLite tables before each test (fixes test-state accumulation that was breaking Week 12 tests in CI)
- `apps/gateway/tests/test_analytics_forecast.py` — projections asserted with `pytest.approx(rel=1e-9)` against the rounded `daily_avg`; `anomalies == []` and `baseline_n >= 12` for the constant-cost test

**Bug fixes**
- `analytics.py` `/forecast`: compute `weekly_projection`/`monthly_projection` from the **rounded** `daily_avg` so JSON-level invariants hold: `weekly = round(round(daily, 6) * 7, 6)` rather than `weekly = round(raw * 7, 6)` (the previous version diverged by up to 4e-6 due to two independent rounds)
- `LiveOverview.tsx`: moved `cliActivity` declaration after `const data = wsMetrics ?? restData` (was raising TS2448 "Block-scoped variable used before its declaration")

**Test count:** 48 passing (was 35 at start of Week 13)
**Commits:** `0f784a3` (feature), `2604da7` (CI fixes)

---

### Week 12 — Cost forecasting + anomaly detection

**Gateway changes** (`apps/gateway/app/routers/analytics.py`)

- `import statistics` added (stdlib — no new pip dep)
- `GET /analytics/forecast?team_id=` — queries last 30 days of daily cost buckets, computes `daily_avg`, `weekly_projection` (×7), `monthly_projection` (×30); trend field compares last-7-day avg vs prior-7-day avg: `up` (>10%), `down` (<-10%), `stable`, `new` (insufficient history), `no_data`
- `GET /analytics/anomalies?team_id=&limit=` — fetches last 200 requests, computes population mean + std of costs and token counts, flags any where Z-score ≥ 2.5; returns list with `type` (`cost_spike` / `token_spike`), `value`, `expected`, `z_score`, provider, model, timestamp; uses std lib `statistics` module

**Dashboard changes**

- `apps/dashboard/src/lib/api.ts`: `ForecastData` and `AnomalyEntry` interfaces; `fetchForecast()` and `fetchAnomalies()` helpers
- `apps/dashboard/src/components/LiveOverview.tsx`:
  - Two new `useQuery` hooks polling forecast (120 s) and anomalies (60 s)
  - `ForecastWidget` — three projection cells (daily/weekly/monthly) + trend badge with `TrendingUp` / `TrendingDown` / `Minus` icon; only rendered when `days_sampled > 0`
  - `AnomalyFeed` + `AnomalyRow` — yellow-tinted list of flagged requests showing value vs expected + Z-score; only rendered when anomalies are present

**Tests** (`apps/gateway/tests/test_analytics_forecast.py`) — 9 tests:
- forecast empty DB → `no_data` trend, zero projections
- forecast response shape (all keys present)
- forecast accepts `team_id` param
- forecast after proxy requests → projections = `daily_avg × 7/30`, trend = `new`
- anomalies empty DB → empty list, `baseline_n < 10`
- anomalies response shape
- anomalies accepts `limit` param
- anomalies accepts `team_id` param
- 12 identical-cost requests → std ≈ 0 → no anomalies flagged

---

### Week 11b — Browser companion extension (MV3)

**Goal:** Automatically ingest subscription usage from claude.ai / ChatGPT / Gemini into ObservaAI — no manual input required.

**New app:** `apps/browser-extension/`

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest — `storage` permission, host_permissions for 3 domains + localhost:8000 |
| `background.js` | Service worker — receives `OBSERVAAI_USAGE` messages, POSTs to `/subscriptions/ingest`, tracks last-ingest status per provider in `chrome.storage.local` |
| `content/claude.js` | Injects a `<script>` into the MAIN world to override `window.fetch` and tee SSE completion streams; listens for `message_limit` events (`{remaining, resetAt}`); ISOLATED-world relay debounces 5 s then sends to background; MutationObserver fallback scrapes visible usage text |
| `content/openai.js` | MutationObserver DOM scraper — matches text patterns like "7 GPT-4o messages left until…" and "7 of 50 messages"; debounced 5 s |
| `content/gemini.js` | MutationObserver + 30 s periodic poll for late-rendering Gemini SPA; same pattern matching |
| `popup/popup.html+js` | Status popup: gateway connectivity dot, per-provider last-sync time (ok/error/never), "Settings" link via `chrome.runtime.openOptionsPage()` |
| `options/options.html+js` | Single gateway-URL setting, persisted to `chrome.storage.local`; defaults to `http://localhost:8000` |

**Key decisions**
- MAIN-world fetch override via injected `<script>` (compatible with Chrome 88+, avoids `world: "MAIN"` content-script field which requires Chrome 111+)
- `window.postMessage` bridge from MAIN-world interceptor → ISOLATED-world relay → background
- 5 s debounce in content scripts; background does not re-debounce (MV3 service workers can be unloaded, storage is the source of truth)
- Only talks to `http://localhost:8000` — never external servers

**README updates**
- Added "Browser companion extension" section under Usage
- Added `browser-extension/` to monorepo layout

---

### Week 11a — Subscription capacity tracking + provider handover
**Commit:** `ead5b7f`

**Problem being solved:** Users with Claude Pro / ChatGPT Plus / Gemini Pro subscriptions never route traffic through the ObservaAI proxy, so usage is invisible. During long coding sessions, Claude hits its rate limit → user manually saves context → switches provider → repeats setup. This sprint makes ObservaAI useful for subscription users too.

**Gateway changes**
- `SubscriptionUsage` SQLAlchemy model: `provider`, `plan`, `hourly/daily/weekly_used`, `hourly/daily/weekly_limit`, `estimated_cost_usd`, `recorded_at`
- Alembic migration `009_subscription_usage.py`
- `POST /subscriptions/ingest` — records a manual usage snapshot; computes `hourly_pct`, `daily_pct`, `weekly_pct` on the fly
- `GET /subscriptions` — returns latest snapshot per provider (subquery: `MAX(recorded_at) GROUP BY provider`)
- `GET /subscriptions/recommend` — sorts providers by `hourly_pct` ascending; ties broken by PROVIDER_ORDER (claude → openai → gemini); returns `recommended`, `reason`, `snapshot`
- `POST /handover/generate` — pure text generation, no DB; body: `{current_provider, next_provider, goal, context_summary, files_in_scope?, last_message?}`; returns formatted markdown doc the user pastes into the next provider's chat

**VS Code extension changes**
- `SubscriptionCapacity` interface added to `SessionManager.ts`
- `subscriptionUsages: SubscriptionCapacity[]` field on `ExtendedMetrics`; `SUBSCRIPTION_POLL_INTERVAL_MS = 60_000`
- `fetchSubscriptions()` polls `GET /subscriptions` every 60 s
- `MetricsPanelProvider.ts`: new CSS classes `.cap-card`, `.cap-bar-wrap`, `.cap-bar-fill`; `renderSubscriptions()` JS function with `capColor()` (green/yellow/red thresholds); bars appear above the API-traffic provider cards
- Two new command palette commands:
  - `ObservaAI: Update Subscription Usage` — guided QuickPick + InputBox flow → POST to `/subscriptions/ingest`
  - `ObservaAI: Prepare Handover (Switch Provider)` — fetches recommendation, walks through QuickPicks, calls `/handover/generate`, copies markdown to clipboard

**Dashboard changes**
- `apps/dashboard/src/lib/api.ts`: `SubscriptionCapacity` interface, `fetchSubscriptions()`, `ingestSubscription()`, `fetchRecommendation()`
- `apps/dashboard/src/app/subscriptions/page.tsx`: per-provider `ProviderCard` with `CapacityBar` components (hourly/daily/weekly), recommendation banner, ingest form (provider + plan + 3 window pairs), TanStack Query with 60 s refetch
- `Sidebar.tsx`: added "Subscriptions" nav link (Activity icon)

**Tests**
- `tests/test_subscriptions.py`: 8 tests — ingest creates record, lowercase normalisation, zero-limit → null pct, latest-per-provider query, recommend picks lowest hourly pct, recommend on empty state, handover markdown generation, handover without optional fields

**Logo**
- `docs/assets/ObservaAI.png` added; README updated to use PNG instead of SVG

---

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

## Week 11b plan — Browser companion extension (MV3)

**Goal:** Automatically ingest subscription usage data directly from the provider web UIs — no manual input required.

### Approach: MV3 Chrome extension with DOM scraping

Each provider exposes usage numbers in their web UI:
- **claude.ai** — usage meter in the sidebar (claude-counter reverse-engineered this: intercepts SSE `message_limit` events)
- **chat.openai.com** — usage bars in the account menu
- **gemini.google.com** — usage info in account/subscription settings

The companion extension will:
1. Run a content script on each provider domain
2. Scrape/intercept the usage numbers (MutationObserver on the relevant DOM elements)
3. POST to `http://localhost:8000/subscriptions/ingest` whenever a change is detected

### Files to create

```
apps/browser-extension/
├── manifest.json          MV3 manifest (host_permissions for all 3 domains)
├── background.js          Service worker — receives messages from content scripts, POSTs to gateway
├── content/
│   ├── claude.js          Intercepts claude.ai SSE message_limit events + DOM scraping
│   ├── openai.js          DOM scraping for ChatGPT usage meter
│   └── gemini.js          DOM scraping for Gemini usage meter
├── popup/
│   ├── popup.html         Simple status popup: connection indicator + last-ingested per provider
│   └── popup.js
└── options/
    ├── options.html       Gateway URL setting (default: http://localhost:8000)
    └── options.js
```

### Key technical notes

- **claude.ai**: SSE stream contains `message_limit` events with `{remaining, total}` fields — intercept via `fetch` override in content script (same approach as claude-counter)
- **chat.openai.com**: usage visible in DOM at `data-testid="usage-bar"` or similar — use MutationObserver; may need to trigger account menu open
- **gemini.google.com**: less well-documented; start with MutationObserver on the usage section, fall back to periodic scrape
- **Security**: extension only talks to `http://localhost:8000` — never to external servers. Add to `host_permissions` in manifest.
- **Rate of ingestion**: debounce 5 s after a DOM change — don't spam the gateway on every keystroke

### Integration with 11a

Once 11b is running, the manual "Update Subscription Usage" VS Code command and the dashboard ingest form become backup methods. The browser extension handles it automatically in the background.

### What to do next session

1. Create `apps/browser-extension/manifest.json` (MV3, permissions: `storage`, `scripting`, host_permissions for 3 domains + localhost:8000)
2. `background.js` — message handler that calls `fetch('http://localhost:8000/subscriptions/ingest', ...)`
3. `content/claude.js` — intercept `fetch` to capture SSE `message_limit` payload
4. `popup/popup.html + popup.js` — show last ingest time + connection status per provider
5. Load unpacked in Chrome DevTools and test against real claude.ai session
6. Add `apps/browser-extension/` to README install instructions

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
| 11a | Subscription capacity tracking + provider handover | ✅ |
| 11b | Browser companion extension (MV3) — auto-ingest from claude.ai / ChatGPT / Gemini | ✅ |
| 12 | Cost forecasting + anomaly detection | ✅ |
| 13 | Self-hosted Helm chart / Railway deploy button | ✅ |
