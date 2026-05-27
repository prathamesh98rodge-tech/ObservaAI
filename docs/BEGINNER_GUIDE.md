# ObservaAI — Beginner's Guide

> You've never heard of ObservaAI before. This guide takes you from zero to a working setup in about 15 minutes.

---

## What is ObservaAI?

Think of it as a **speedometer for your AI spending**.

When you use ChatGPT's API, Claude, or Gemini in your code, you send requests to their servers and they charge you per token (roughly per word). Most developers only find out how much they spent at the end of the month, on their billing page.

ObservaAI sits in the middle — between your code and the AI provider — and counts everything in real time:

```
Your code  →  ObservaAI gateway  →  OpenAI / Claude / Gemini
                     ↓
              Dashboard: how many tokens, how much cost, how fast
```

You don't change your code much — you just change the URL you send requests to.

---

## Do I need this?

You'll find ObservaAI useful if you:
- Are building an app that calls any LLM API
- Want to know how much each feature/prompt costs before the bill arrives
- Are switching between providers (OpenAI vs Claude vs Gemini) and want to compare
- Work in a team and want separate usage tracking per person or project
- Run local models with Ollama and want the same dashboard

---

## What you need before starting

You need **one** of these two setups:

### Option A — Docker (recommended, easiest)
1. Install **Docker Desktop**: https://www.docker.com/products/docker-desktop/
2. That's it. Docker includes everything else.

### Option B — Manual (if you don't want Docker)
1. **Node.js 22+** — https://nodejs.org (click "LTS" version)
2. **pnpm** — after installing Node, open a terminal and run: `npm install -g pnpm`
3. **Python 3.12+** — https://python.org/downloads

**Not sure which to pick?** Go with Docker — it's one command and everything works together automatically.

---

## Step 1: Install ObservaAI

Open your terminal (Terminal on Mac, Command Prompt on Windows, or any Linux terminal) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/prathamesh98rodge-tech/ObservaAI/main/install.sh | bash
```

This command:
1. Downloads ObservaAI
2. Installs all dependencies
3. Creates a configuration file (`.env`)
4. Starts the gateway and dashboard

When it finishes you'll see something like:
```
✓ Gateway running at http://localhost:8000
✓ Dashboard running at http://localhost:3000
```

---

## Step 2: Add your API keys

Open the file `.env` inside the `ObservaAI` folder in a text editor. Find these lines and fill in your keys:

```env
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
GEMINI_API_KEY=your-gemini-key-here
```

**Where do I get API keys?**
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/keys
- Google Gemini: https://aistudio.google.com/app/apikey

You only need keys for providers you actually use. Leave the others blank.

After editing `.env`, restart the gateway:
```bash
cd ObservaAI
make dev
```

---

## Step 3: Point your code at ObservaAI

This is the only code change you need to make. Change the **base URL** in your AI SDK to go through ObservaAI instead of directly to the provider.

### Python + OpenAI
```python
from openai import OpenAI

# Before (direct to OpenAI):
# client = OpenAI()

# After (through ObservaAI):
client = OpenAI(base_url="http://localhost:8000/proxy/openai/v1")

# Everything else stays exactly the same:
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Python + Anthropic
```python
from anthropic import Anthropic

# After:
client = Anthropic(base_url="http://localhost:8000/proxy/anthropic")

message = client.messages.create(
    model="claude-haiku-4-5",
    max_tokens=256,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(message.content[0].text)
```

### JavaScript / TypeScript + OpenAI
```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8000/proxy/openai/v1",
});

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Just using curl (any provider)
```bash
curl http://localhost:8000/proxy/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

---

## Step 4: Watch the dashboard

Open your browser and go to **http://localhost:3000**

You'll see a live dashboard that updates every time you make an API call:

- **Overview** — total tokens used this session, total cost, average latency, and a **Rolling Token Windows** widget showing how many tokens you've used in the last 5 hours and 7 days per provider
- **Providers** — breakdown by OpenAI/Claude/Gemini/etc
- **Costs** — cost over time chart, which provider costs most
- **Sessions** — history of your request sessions. Click any session to expand it and see individual requests with:
  - **Ctx %** — how full the model's context window is (green = fine, yellow = getting full, red = nearly full)
  - **Cache** — ⚡ active badge when an Anthropic prompt-cache hit is still within its 5-minute window
- **Budgets** — set spending limits with email/webhook alerts

Try making a few API calls through ObservaAI and watch the numbers update live.

---

## Step 5 (optional): Install the editor extension

### VS Code

1. Open VS Code
2. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
3. Type "Install from VSIX" and select it
4. Navigate to `ObservaAI/apps/vscode-extension/` and open the `.vsix` file
   *(If there's no `.vsix` yet: open a terminal in that folder and run `pnpm package`)*

You'll see:
- An **ObservaAI icon** in the left sidebar (activity bar)
- A **status bar item** at the bottom: `⬡ 0 · <$0.0001` — this shows live token count and cost
- Click the icon for the full metrics panel

### JetBrains (IntelliJ, PyCharm, GoLand…)

1. Build the plugin: `cd ObservaAI && make build-jetbrains`
2. In your JetBrains IDE: **Settings → Plugins → ⚙ gear icon → Install Plugin from Disk…**
3. Pick the `.zip` from `apps/jetbrains-plugin/build/distributions/`
4. Restart the IDE

---

## Step 6 (optional): Auto-track Claude CLI / Codex CLI / Gemini CLI

Do you use any of these in your terminal?

- `claude` (Anthropic's official CLI)
- `codex` (OpenAI's coding CLI)
- `gemini` (Google AI Studio CLI)

By default, ObservaAI **doesn't see them** — they talk directly to the provider. If
you installed the VS Code extension in Step 5, you're already covered for any terminal
you open inside VS Code. Here's what's happening behind the scenes and how to extend
it to terminals outside VS Code.

### Inside VS Code: automatic

Open any new terminal inside VS Code (`` Ctrl+` ``) and run:

```bash
echo $ANTHROPIC_BASE_URL
# → http://localhost:8000/proxy/anthropic
```

If you see that URL, you're good. Run `claude`, `codex`, or `gemini` normally and check
the dashboard's **Live Overview** — a **CLI Activity** card will appear, and the
**Sessions** page will tag those rows with a small terminal icon.

You can toggle this in the status bar: the `● CLI proxy: active` chip. Click it to
enable / disable injection without uninstalling the extension.

### Outside VS Code: one-time shell setup

For terminals outside VS Code (Warp, iTerm, Windows Terminal, etc.), open the VS Code
Command Palette (`Ctrl+Shift+P`) and run:

```
ObservaAI: Configure Shell for CLI Detection
```

Pick your shell (bash / zsh / fish / PowerShell). The extension appends an idempotent
export block to your shell profile (`.zshrc`, `.bashrc`, `config.fish`, or
`Microsoft.PowerShell_profile.ps1`). **Restart your terminal once** and every CLI
call routes through ObservaAI.

### The bonus log watcher (Claude CLI only)

Even when env injection is off, the VS Code extension also watches
`~/.claude/projects/**/*.jsonl` — Claude CLI's local conversation log — and POSTs
token counts to ObservaAI from there. So a Claude CLI session in *any* terminal,
inside or outside VS Code, still shows up. No setup needed.

If you ever want to verify it's working, run a quick Claude CLI session and look
for it on the dashboard's **Sessions** page filtered by **Source = CLI**.

---

## Everyday commands

Once everything is set up, these are the commands you'll use:

```bash
# Start everything (run this every time you come back to work)
cd ObservaAI
make dev

# Or with Docker:
make up

# Run tests to make sure nothing is broken
make test

# Stop everything
Ctrl+C    # for 'make dev'
make down  # for 'make up'
```

---

## Multi-team / workspace usage

If you're on a team and want separate usage tracking per person or project:

1. Open the dashboard at http://localhost:3000
2. Click **Teams** in the left sidebar
3. Create a team (e.g. "Backend Team" or "Alice's workspace")
4. Click the team to expand it, then click **Add key**
5. Copy the API key shown (`obs-xxxxxxx…`)

Now use that key in your code:
```python
# Pass the team key as a header
client = OpenAI(
    base_url="http://localhost:8000/proxy/openai/v1",
    default_headers={"X-ObservaAI-Team-Key": "obs-your-key-here"}
)
```

In the dashboard, use the **workspace dropdown** (top of left sidebar) to switch between teams and see each team's usage separately.

---

## Set a spending budget

To get notified before you accidentally overspend:

1. Go to **http://localhost:3000/budgets**
2. Click **New Budget**
3. Fill in:
   - **Label**: e.g. "Monthly OpenAI limit"
   - **Provider**: OpenAI (or leave blank for all providers)
   - **Period**: Month
   - **Limit**: $50.00
   - **Alert at**: 80% (get warned at $40)
   - **Webhook URL** (optional): a Slack webhook or any HTTPS URL
4. Click Save

When you hit 80% of your limit, you'll get a VS Code/JetBrains notification and an optional webhook call to Slack/Discord/etc.

---

## Check cost before sending (pre-flight estimate)

Not sure if your prompt is too expensive before you send it? Use the `/estimate` endpoint:

```bash
curl http://localhost:8000/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Summarise this entire book: ..."}]
  }'
```

Response:
```json
{
  "estimated_input_tokens": 4823,
  "estimated_cost_usd": 0.012058,
  "context_pct": 3.8
}
```

- **estimated_input_tokens** — approximate token count of your messages
- **estimated_cost_usd** — what the input alone will cost (output tokens not included)
- **context_pct** — what percentage of the model's context window you're using

This works without making a real API call — no tokens are consumed.

---

## Troubleshooting

**"curl: command not found" on Windows**
→ Use [Git Bash](https://git-scm.com/download/win) or [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) instead of Command Prompt.

**"Port 8000 is already in use"**
→ Something else is using that port. Stop it, or edit `.env` to change `GATEWAY_PORT=8001` then update your SDK base URL.

**"Cannot connect to gateway"**
→ Make sure `make dev` or `make up` is running in another terminal tab.

**API calls return 401 Unauthorized**
→ Your API keys in `.env` are wrong or not set. Double-check them and restart with `make dev`.

**API calls return 404 Not Found**
→ Make sure your base URL ends with the right path. For OpenAI it must be `.../proxy/openai/v1` (include the `/v1`).

**Dashboard shows "Connecting…"**
→ The gateway might not be running. Check the terminal where you ran `make dev` for errors.

**I want to reset and start fresh**
```bash
make reset    # delete the local database
make dev      # restart
```

---

## How it works under the hood (optional reading)

```
Your code
   │
   │  POST http://localhost:8000/proxy/openai/v1/chat/completions
   │
   ▼
ObservaAI Gateway (FastAPI, port 8000)
   │
   ├── Strips your ObservaAI headers
   ├── Injects the real provider API key from .env
   ├── Forwards to: https://api.openai.com/v1/chat/completions
   │
   ├── Gets the response back
   ├── Extracts token counts from the response
   ├── Saves them to the local database
   ├── Broadcasts live metrics via WebSocket to the dashboard
   │
   └── Returns the response to your code (unchanged)
```

**Your AI provider never sees ObservaAI.** The response your code gets is byte-for-byte identical to what the provider sent. ObservaAI just reads the metadata (token counts, model name) while it passes through.

---

## Where to get help

- **GitHub Issues**: https://github.com/prathamesh98rodge-tech/ObservaAI/issues
- **Full README**: [../README.md](../README.md)
- **Development log**: [CHANGELOG.md](CHANGELOG.md)
