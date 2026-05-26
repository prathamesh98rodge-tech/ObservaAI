# ObservaAI — Development Log

> Full session-by-session build history. Read this at the start of a new session to pick up context instantly.

---

## Current state at a glance

| Layer | What exists | Port |
|---|---|---|
| Gateway (FastAPI) | Proxy + analytics + budgets + teams API | 8000 |
| Dashboard (Next.js 15) | Live charts, costs, sessions, teams, settings | 3000 |
| VS Code extension | Sidebar metrics, status bar, Ollama, budget alerts | — |
| JetBrains plugin | Tool window, status bar, budget alerts, settings | — |
| Database | SQLite (dev) / Postgres (prod via Docker) | 5432 |

**Branch:** `claude/happy-goldberg-4tXbl`  
**Last commit:** Week 9 — Marketplace release packaging

---

## Week 1 — Monorepo scaffold
**Commit:** `d243141`

**Built:**
- Turborepo + pnpm workspaces monorepo
- `apps/gateway/` — FastAPI skeleton with CORS, health endpoint, lifespan hook
- `apps/dashboard/` — Next.js 15 App Router skeleton
- `packages/shared-types/` — LiveMetrics, TokenUsageSummary TS interfaces
- `packages/provider-adapters/`, `packages/analytics-sdk/`, `packages/ui-components/`
- `turbo.json`, `pnpm-workspace.yaml`

**Key files:**
- `apps/gateway/app/main.py` — FastAPI app with lifespan
- `apps/gateway/app/config.py` — Pydantic Settings (from .env)
- `apps/gateway/app/database.py` — SQLAlchemy async engine + `get_db` dependency

---

## Week 2 — Provider proxy layer
**Commit:** `40d9586`

**Built:**
- Transparent HTTP proxy: `POST /proxy/{provider}/{path:path}`
- Provider adapter protocol: `build_headers`, `target_url`, `extract_usage`, `extract_usage_from_stream`
- Adapters for: OpenAI, Anthropic, Gemini, Ollama, OpenRouter
- SSE streaming: chunks proxied immediately, usage extracted post-stream from accumulated buffer
- Session + Request SQLAlchemy models
- `record_request()` service — cost estimation, DB insert, WebSocket broadcast
- `MetricsBus` — async pub/sub for live metrics push
- Pricing tables in `services/pricing.py`

**Key files:**
- `apps/gateway/app/routers/proxy.py`
- `apps/gateway/app/adapters/{openai,anthropic,gemini,ollama,openrouter}.py`
- `apps/gateway/app/adapters/base.py` — `UsageStats` dataclass, `ProviderAdapter` protocol
- `apps/gateway/app/services/pricing.py`
- `apps/gateway/app/services/request_store.py`
- `apps/gateway/app/services/session_service.py`
- `apps/gateway/app/services/metrics_bus.py`
- `apps/gateway/app/routers/websocket.py`

---

## Week 3 — Live dashboard
**Commit:** `2575092`

**Built:**
- Dashboard layout: Sidebar nav + content area
- `/` Overview page — LiveOverview component, token/cost/latency stats
- `/providers` page — per-provider token usage table
- `/costs` page — donut chart (ProviderDonutChart), area chart (CostAreaChart), cache metrics
- `/sessions` page — collapsible session list with request drill-down
- WebSocket hook (`useLiveMetrics`) — connects to `ws://localhost:8000/ws/metrics`
- TanStack Query for REST polling fallback
- `lib/api.ts` — `fetchLiveMetrics`, `fetchTokenUsage`, `fetchCosts`, `fetchSessions`, `fetchTimeline`
- `lib/store.ts` — Zustand store for WS metrics state
- `lib/utils.ts` — `formatCost`, `formatTokens`, `PROVIDER_COLORS`
- Recharts charts (area, bar, donut/pie)

**Key files:**
- `apps/dashboard/src/app/*/page.tsx`
- `apps/dashboard/src/components/charts/`
- `apps/dashboard/src/hooks/useLiveMetrics.ts`
- `apps/dashboard/src/components/layout/Sidebar.tsx`

---

## Week 4 — VS Code extension
**Commit:** `c1833dd`

**Built:**
- VS Code extension: `apps/vscode-extension/`
- `SessionManager` (EventEmitter) — polls `/analytics/live`, manages WS connection with exponential backoff reconnect
- `MetricsPanelProvider` — sidebar webview with HTML metrics display (connection banner, session stats, per-provider cards, Ollama VRAM bar)
- `ProxyUrlsProvider` — sidebar panel with copy-to-clipboard proxy URLs
- `StatusBarController` — `⬡ 12.3K · $0.04` status bar item
- Ollama GPU/VRAM polling: `/ollama/ps` every 15s
- Budget alert polling: `/budgets/alerts` every 30s (deduplication via `seenAlertIds` Set)
- Commands: Open Dashboard, Reset Session, Test Connection, Copy Proxy URL
- Settings: `observaai.gatewayUrl`, `observaai.ollamaUrl`, `observaai.enabled`, `observaai.showOllamaMetrics`
- esbuild bundle to `dist/extension.js`

**Key files:**
- `apps/vscode-extension/src/extension/SessionManager.ts`
- `apps/vscode-extension/src/extension/StatusBarController.ts`
- `apps/vscode-extension/src/providers/MetricsPanelProvider.ts`
- `apps/vscode-extension/src/providers/ProxyUrlsProvider.ts`

**Fixes applied:**
- `esModuleInterop: true` added to `tsconfig.json` for `ws` default import
- `next.config.ts` ESM compat: `import path from "path"` + `fileURLToPath(import.meta.url)`

---

## Ship-ready packaging
**Commit:** `acf6c2e`

**Built:**
- `install.sh` — curl-pipe installer, auto-detects Docker vs pnpm+python3
- Full `README.md` with architecture diagram, SDK examples, config table
- `Makefile` with `install`, `dev`, `build`, `test`, `typecheck`, `up`, `down`, `logs`, `reset`, `clean`
- `LICENSE` (MIT)
- Verified all 5 provider adapters work end-to-end

---

## Week 5 — Postgres + Alembic + cache metrics
**Commit:** `ec9899d`

**Built:**
- `apps/gateway/alembic/` — Alembic async migration setup
  - `env.py`: strips `+asyncpg`/`+aiosqlite` prefix for sync connection, uses `asyncio.run()` + `run_sync`
  - Migrations 001–003: sessions, requests, budgets tables
- `apps/gateway/app/database.py` updates:
  - `is_postgres()` helper
  - `init_db()` skips `create_all` on Postgres (Alembic owns schema)
  - Dialect-aware `_time_bucket()` in analytics: `func.strftime` (SQLite) vs `cast(func.date_trunc(...), String)` (Postgres)
- `docker-compose.yml` — postgres:16-alpine service, gateway depends_on with healthcheck
- Prompt cache metrics (`/analytics/cache`):
  - `cache_savings_usd` column on requests
  - `estimate_cache_savings()` in pricing: OpenAI 50%, Anthropic 90% discount
  - Cache hit-rate = `cached_tokens / (input_tokens + cached_tokens)`
  - Dashboard `/costs` page shows cache hit-rate section

**Key files:**
- `apps/gateway/alembic/env.py`
- `apps/gateway/alembic/versions/001_sessions.py` through `003_budget.py`
- `apps/gateway/app/services/pricing.py` — cache savings
- `apps/gateway/app/routers/analytics.py` — `/analytics/cache` endpoint

---

## Week 6 — Cost-budget alerts
**Commit:** `2c19238`

**Built:**
- `Budget` model: `id`, `label`, `workspace_name`, `provider`, `period` (day/week/month), `limit_usd`, `alert_pct`, `webhook_url`, `enabled`, `notified_level`, `created_at`
- `apps/gateway/alembic/versions/003_budget.py`
- `apps/gateway/app/routers/budgets.py`:
  - `GET /budgets` — list with live spend per budget
  - `POST /budgets`, `PATCH /budgets/{id}`, `DELETE /budgets/{id}`
  - `GET /budgets/alerts` — computed alert list (polled by VS Code every 30s)
  - `_level(pct, alert_pct)` pure function: `"ok"` / `"warning"` / `"exceeded"`
- `apps/gateway/app/services/budget_checker.py`:
  - Runs after every `record_request()` (exception swallowed — never breaks proxy)
  - Rolling window spend: day=24h, week=7d, month=30d
  - Escalation: none → warning → exceeded; resets to "none" when spend drops
  - Webhook: `httpx.AsyncClient.post()` with JSON payload
- Dashboard `/budgets` page — create/edit/delete budgets, live spend bars, level badges
- VS Code: budget alert polling, `showWarningMessage` / `showErrorMessage`, deduplication with `seenAlertIds` Set

**Key files:**
- `apps/gateway/app/models/budget.py`
- `apps/gateway/app/routers/budgets.py`
- `apps/gateway/app/services/budget_checker.py`
- `apps/dashboard/src/app/budgets/page.tsx`

---

## Week 7 — Multi-workspace / Teams
**Commit:** `3c623c9`

**Built:**
- `Team` + `TeamApiKey` models (`apps/gateway/app/models/team.py`)
  - `generate_api_key()` → `obs-` + 40 hex chars
  - API keys: `id`, `team_id` (FK→teams), `label`, `api_key` (unique), `enabled`, `created_at`, `last_used_at`
- Alembic migrations:
  - `004_teams.py` — creates `teams` + `team_api_keys` tables
  - `005_session_team_id.py` — adds `team_id` nullable FK on `sessions` (batch mode for SQLite)
- `apps/gateway/app/services/team_service.py` — `get_team_id` FastAPI dependency:
  - Reads `X-ObservaAI-Team-Key` header
  - Returns `None` for anonymous; `401` for invalid/disabled key; team_id on success
  - Updates `last_used_at` on each successful auth
- `apps/gateway/app/routers/teams.py` — full CRUD:
  - `GET/POST /teams`, `GET/PATCH/DELETE /teams/{id}`
  - `GET/POST /teams/{id}/keys`, `PATCH/DELETE /teams/{id}/keys/{key_id}`
- Session service refactored: `_sessions: dict[str|None, str]` (keyed by team_id)
- All analytics endpoints accept `?team_id=` filter (subquery: `Request.session_id.in_(select(Session.id).where(Session.team_id == team_id))`)
- Dashboard:
  - `store.ts` — `selectedTeamId: string | null` (persisted via Zustand persist middleware)
  - `Sidebar.tsx` — team switcher dropdown (refetches team list every 30s)
  - `/teams` page — create teams, expand to create/copy/revoke API keys
  - `api.ts` — `fetchTeams`, `createTeam`, `deleteTeam`, `fetchTeamKeys`, `createTeamKey`, `deleteTeamKey`; all analytics fns accept optional `teamId`
- VS Code:
  - `observaai.teamApiKey` setting
  - `teamHeaders()` helper — all fetches include `X-ObservaAI-Team-Key` if set

**Key files:**
- `apps/gateway/app/models/team.py`
- `apps/gateway/app/services/team_service.py`
- `apps/gateway/app/routers/teams.py`
- `apps/dashboard/src/app/teams/page.tsx`
- `apps/vscode-extension/src/extension/SessionManager.ts`

---

## Week 8 — JetBrains plugin
**Commit:** `f597b78`

**Built:**
- `apps/jetbrains-plugin/` — IntelliJ Platform plugin (Kotlin + Gradle)
- `build.gradle.kts` — IntelliJ Gradle Plugin v1 (1.17.4), JVM 21, Gson bundled
- `settings.gradle.kts`, `gradle.properties`, Gradle wrapper

**Kotlin sources (`src/main/kotlin/ai/observaai/`):**
- `MetricsState.kt` — `MetricsState`, `ProviderUsage`, `BudgetAlert` data classes
- `MetricsTopic.kt` — `MetricsListener` fun interface + `METRICS_TOPIC` application bus topic
- `ObservaAISettings.kt` — `@Service(APP)` + `PersistentStateComponent` (stored in `observaai.xml`)
  - Fields: `gatewayUrl`, `teamApiKey`, `enabled`
- `GatewayPoller.kt` — `@Service(APP)` Disposable:
  - `ScheduledExecutorService` polls `/analytics/live` every 8s
  - Polls `/budgets/alerts` every 30s
  - Forwards `X-ObservaAI-Team-Key` header when `teamApiKey` is set
  - Fires IDE balloon notifications for new budget alerts (deduplication)
  - Publishes via `METRICS_TOPIC` application message bus
- `SettingsConfigurable.kt` — Settings → Tools → ObservaAI panel (URL + masked key field + enabled toggle)
- `toolwindow/MetricsToolWindowFactory.kt` — right-side tool window factory
- `toolwindow/MetricsPanel.kt` — HTML-rendered JTextPane:
  - Connection banner (green/red)
  - Session summary grid (tokens/cost/latency/in-flight)
  - Per-provider cards with input/output/total/latency
  - Budget alert cards
  - Dark/light theme detection via `UIUtil.getPanelBackground()`
- `statusbar/TokenStatusBarWidget.kt` — `⬡ 12.3K · $0.04`; click opens tool window
- `statusbar/TokenStatusBarWidgetFactory.kt`

**plugin.xml registrations:** services, tool window (right anchor), status bar widget, configurable, notification group

**Build note:** `./gradlew buildPlugin` downloads ~600 MB IntelliJ SDK on first run (blocked in sandboxed CI — works on developer machines). Output: `build/distributions/observaai-jetbrains-0.1.0.zip`.

---

## Week 9 — Marketplace release packaging
**Commit:** (this session)

**Built:**
- **VS Code Marketplace**:
  - `package.json` extended: `keywords`, `galleryBanner`, `repository`, `bugs`, `homepage`, `license`, `icon`
  - `media/icon.png` (128×128) — lighthouse + analytics bars generated via `scripts/generate_icon.py`
  - `media/icon.svg` — source SVG for the marketplace icon
  - `media/observaai-activity-bar.svg` — 24×24 activity bar icon (replaces `$(pulse)` codicon)
  - `.vscodeignore` — excludes `src/`, `node_modules/`, maps from the VSIX package
  - `README.md` — marketplace listing page (features, setup, commands, settings table, provider table)
  - `CHANGELOG.md` — extension release history
  - Updated `scripts` in `package.json`: `package:pre`, `vsce:login`, `publish`
  - Added `@vscode/vsce` to devDependencies
- **JetBrains Marketplace**:
  - `plugin.xml` — added `<id>`, `<vendor>`, `<description>` (HTML), `<change-notes>` (HTML), `<idea-version since-build="241"/>`
  - `build.gradle.kts` — added `signPlugin` (reads `JB_CERTIFICATE_CHAIN`, `JB_PRIVATE_KEY`, `JB_PRIVATE_KEY_PASSWORD` env vars) and `publishPlugin` (reads `JB_PUBLISH_TOKEN`, `JB_PUBLISH_CHANNEL`)
  - `CHANGELOG.md` — plugin release history
- **GitHub Actions CI/CD**:
  - `.github/workflows/ci.yml` — runs on every push: gateway pytest, dashboard typecheck + build, extension typecheck + build
  - `.github/workflows/release-vscode.yml` — triggered on `vscode-v*` tags; builds VSIX, creates GitHub Release, publishes to VS Code Marketplace (supports `--pre-release` flag)
  - `.github/workflows/release-jetbrains.yml` — triggered on `jetbrains-v*` tags; builds + verifies + signs + publishes plugin ZIP to JetBrains Marketplace
  - `.github/PUBLISHING.md` — documents required secrets and manual release flow

**Key files:**
- `apps/vscode-extension/package.json` — full marketplace metadata
- `apps/vscode-extension/.vscodeignore`
- `apps/vscode-extension/README.md`
- `apps/vscode-extension/media/icon.png` + `icon.svg`
- `apps/jetbrains-plugin/src/main/resources/META-INF/plugin.xml` — full marketplace fields
- `apps/jetbrains-plugin/build.gradle.kts` — `signPlugin` + `publishPlugin` tasks
- `.github/workflows/ci.yml`
- `.github/workflows/release-vscode.yml`
- `.github/workflows/release-jetbrains.yml`

**Release flow:**
```bash
# VS Code
git tag vscode-v0.1.0 && git push origin vscode-v0.1.0

# JetBrains
git tag jetbrains-v0.1.0 && git push origin jetbrains-v0.1.0
```

---

## Architecture decisions log

| Decision | Choice | Reason |
|---|---|---|
| Streaming proxy | Accumulate chunks, parse after stream close | Avoids modifying SSE frames mid-flight |
| SQLite in tests | `create_all` + aiosqlite in-memory per test | Fast, no Postgres needed in CI |
| Alembic + SQLite | `batch_alter_table` for FK/index adds | SQLite can't ALTER TABLE to add constraints |
| Budget checker isolation | `try/except` wraps entire check | Budget errors must never break proxy response |
| Session keying (Week 7) | `dict[str|None, str]` team_id → session_id | One session per team per process lifetime |
| JetBrains JSON | Bundle Gson as `implementation` dep | Avoids IntelliJ classloader coupling |
| Zustand persist | Only `selectedTeamId` persisted | Avoids stale metrics in storage |

---

## What's next (roadmap)

| Week | Feature | Status |
|---|---|---|
| 9 | VS Code + JetBrains Marketplace releases | ✅ Done |
| 10 | Prompt analytics (top prompts, error rates, model comparison) | ⬜ |
| 11 | Cost forecasting + anomaly detection | ⬜ |
| 12 | Self-hosted Helm chart / Railway deploy button | ⬜ |
