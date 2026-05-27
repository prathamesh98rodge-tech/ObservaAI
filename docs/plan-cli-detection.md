# Plan: Week 14 — CLI Detection & Auto-Ingestion

**Problem:** ObservaAI only captures traffic routed through its proxy. Claude CLI,
OpenAI Codex CLI, and Google Gemini CLI talk directly to provider APIs — their token
and cost usage is completely invisible in the dashboard and VS Code status bar.

**Goal:** Make CLI tool usage visible in ObservaAI with zero friction for the user.

---

## Step 1 — Design: source tagging in the data model

Add a `source` enum column (`proxy` | `cli-log` | `manual`) to the `Request` model
and Alembic migration `010_source.py`. Update `record_request()` to accept and store
the source. Expose `source` in all `/analytics/` responses. This lets the dashboard
distinguish between proxied SDK calls and CLI-originated usage.

**Acceptance criteria:**
- Alembic migration creates `source VARCHAR(20) DEFAULT 'proxy'`
- All existing rows default to `proxy`; new rows carry correct source
- `GET /analytics/requests` returns `source` per row
- `GET /analytics/live` aggregates by source alongside provider

---

## Step 2 — Implement: VS Code terminal environment injection

When the VS Code extension activates, register a `window.onDidOpenTerminal` listener
that injects `ANTHROPIC_BASE_URL=http://localhost:8000/proxy/anthropic`,
`OPENAI_BASE_URL=http://localhost:8000/proxy/openai/v1`, and
`GEMINI_API_BASE=http://localhost:8000/proxy/gemini` into every new integrated
terminal via `terminal.sendText`. Also set these via the
`terminal.integrated.env.<platform>` contribution point in `package.json` so they
apply to all shells. Add a sidebar indicator "CLI proxy: active" with a green dot.
Add a VS Code command "ObservaAI: Toggle CLI Proxy" to enable/disable.

**Acceptance criteria:**
- New terminals automatically have all three env vars set
- `echo $ANTHROPIC_BASE_URL` in VS Code terminal returns `http://localhost:8000/...`
- Toggle command updates the sidebar indicator and removes/restores env vars
- Claude CLI, Codex CLI, Gemini CLI launched from VS Code terminal route traffic
  through ObservaAI and appear in the dashboard

---

## Step 3 — Implement: Claude CLI log file watcher

The Claude CLI writes conversation JSONL files at
`~/.claude/projects/<hash>/conversations/<id>.jsonl`. Each entry contains
`message`, `usage` (input_tokens, output_tokens), model, and timestamp.

Add a `ClaudeLogWatcher` class to the VS Code extension that:
1. Uses `vscode.workspace.createFileSystemWatcher` on `~/.claude/projects/**/*.jsonl`
2. On file change, reads new lines since last file size, parses JSONL entries
3. Extracts token counts and POSTs to `POST /analytics/ingest-cli` (new gateway endpoint)
4. Deduplicates via a local Set of `<file>:<lineNumber>` keys persisted to extension storage
5. Shows ingested count in sidebar under a "Claude CLI" section

New gateway endpoint `POST /analytics/ingest-cli` accepts:
`{ provider, model, input_tokens, output_tokens, source: "cli-log", timestamp }`.
Internally creates a Session + Request record with `source = "cli-log"`.

**Acceptance criteria:**
- After a `claude` CLI session, token counts appear in ObservaAI within 5 s of
  the conversation ending
- No duplicate entries on VS Code reload
- Log watcher gracefully handles missing `~/.claude/` directory

---

## Step 4 — Implement: shell profile setup helper

Add VS Code command "ObservaAI: Configure Shell for CLI Detection" and a gateway
endpoint `GET /setup/shell-exports` that returns the correct export lines for the
current gateway URL.

The command:
1. Calls `GET /setup/shell-exports` to get the current gateway URL
2. Detects the user's default shell (bash/zsh/fish/PowerShell)
3. Shows a QuickPick with shell options
4. Opens the correct profile file and appends the export block (wrapped in a
   `# ObservaAI CLI detection` comment so it can be removed cleanly)
5. Shows an info message "Restart your terminal to activate"

Shell output example (bash/zsh):
```bash
# ObservaAI CLI detection — added by VS Code extension
export ANTHROPIC_BASE_URL="http://localhost:8000/proxy/anthropic"
export OPENAI_BASE_URL="http://localhost:8000/proxy/openai/v1"
export GEMINI_API_BASE="http://localhost:8000/proxy/gemini/v1beta"
```

**Acceptance criteria:**
- Command detects shell correctly on macOS/Linux/Windows
- Profile file gets the export block appended exactly once (idempotent)
- `GET /setup/shell-exports` returns correct URLs for custom gateway ports

---

## Step 5 — Implement: dashboard CLI activity section

Update the Sessions page and Live Overview to surface CLI-originated traffic.

Sessions page:
- Add a `Source` filter chip group: `All` / `Proxy` / `CLI` / `Manual`
- CLI rows show a terminal icon badge next to the provider name

Live Overview:
- Add a "CLI Activity" card alongside the existing Provider Breakdown
- Shows: last CLI session time, total CLI tokens today, which CLIs were detected

`GET /analytics/live` response extended with:
```json
{
  "cliActivity": {
    "detected": ["claude", "codex"],
    "tokensToday": 12400,
    "lastSeenAt": "2026-05-27T..."
  }
}
```

**Acceptance criteria:**
- Sessions page Source filter works without full page reload
- CLI badge renders correctly on dark theme
- `cliActivity` field is present even when no CLI traffic exists (empty/zero values)
