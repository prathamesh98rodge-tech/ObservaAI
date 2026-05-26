#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ObservaAI — one-shot installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/prathamesh98rodge-tech/ObservaAI/main/install.sh | bash
#
# Or from a local clone:
#   ./install.sh
#
# What it does:
#   1. Verifies prerequisites (git, then Docker OR pnpm+python)
#   2. Clones the repo (if running via curl-pipe)
#   3. Copies .env.example → .env (preserves existing .env)
#   4. Builds & starts gateway + dashboard via Docker Compose
#   5. Prints next-steps for the VS Code extension
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── colors ───────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; RESET=""
fi

log()   { printf "%s→%s %s\n" "$CYAN" "$RESET" "$*"; }
ok()    { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn()  { printf "%s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
err()   { printf "%s✗%s %s\n" "$RED" "$RESET" "$*" >&2; }
section() { printf "\n%s%s━━ %s ━━%s\n" "$BOLD" "$BLUE" "$*" "$RESET"; }

# ── banner ───────────────────────────────────────────────────────────────────
cat <<EOF
${BOLD}${CYAN}
  ╔═══════════════════════════════════════════════════════╗
  ║   ObservaAI — Unified AI Usage Monitor & Gateway      ║
  ║   ${DIM}Datadog + Grafana + Raycast for LLM workflows${RESET}${BOLD}${CYAN}     ║
  ╚═══════════════════════════════════════════════════════╝
${RESET}
EOF

REPO_URL="${OBSERVAAI_REPO:-https://github.com/prathamesh98rodge-tech/ObservaAI.git}"
INSTALL_DIR="${OBSERVAAI_DIR:-$PWD/ObservaAI}"

# ── prerequisites ────────────────────────────────────────────────────────────
section "Checking prerequisites"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "$1 is required but not installed. ${2:-}"
    return 1
  fi
  ok "$1 found"
}

need git "Install from https://git-scm.com/" || exit 1

HAS_DOCKER=0
HAS_NATIVE=0

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "docker + docker compose found"
  HAS_DOCKER=1
fi

if command -v pnpm >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
  ok "pnpm + python3 found (native fallback available)"
  HAS_NATIVE=1
fi

if [ "$HAS_DOCKER" -eq 0 ] && [ "$HAS_NATIVE" -eq 0 ]; then
  err "Need either: (a) Docker + docker compose, or (b) pnpm + python3"
  echo "    Docker:  https://docs.docker.com/get-docker/"
  echo "    pnpm:    https://pnpm.io/installation"
  echo "    Python:  https://www.python.org/downloads/"
  exit 1
fi

# ── clone (if not already inside a checkout) ─────────────────────────────────
section "Fetching source"

if [ -f "$PWD/docker-compose.yml" ] && [ -d "$PWD/apps/gateway" ]; then
  ok "Running inside an existing ObservaAI checkout"
  INSTALL_DIR="$PWD"
else
  if [ -d "$INSTALL_DIR" ]; then
    warn "Directory $INSTALL_DIR already exists — pulling latest"
    git -C "$INSTALL_DIR" pull --ff-only
  else
    log "Cloning $REPO_URL → $INSTALL_DIR"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
fi

# ── .env setup ───────────────────────────────────────────────────────────────
section "Configuring environment"

ROOT_ENV="$INSTALL_DIR/.env"
GATEWAY_ENV="$INSTALL_DIR/apps/gateway/.env"

if [ -f "$ROOT_ENV" ]; then
  ok "Preserved existing .env"
else
  cp "$INSTALL_DIR/.env.example" "$ROOT_ENV"
  ok "Created .env from template"
fi

# Mirror to gateway directory for native (non-Docker) runs
if [ ! -f "$GATEWAY_ENV" ]; then
  cp "$ROOT_ENV" "$GATEWAY_ENV"
  ok "Mirrored .env → apps/gateway/.env"
fi

# ── boot ─────────────────────────────────────────────────────────────────────
section "Starting services"

if [ "$HAS_DOCKER" -eq 1 ]; then
  log "Building containers (this may take a few minutes on first run)…"
  docker compose --env-file "$ROOT_ENV" up -d --build
  ok "Gateway:   http://localhost:8000"
  ok "Dashboard: http://localhost:3000"
else
  warn "Docker not available — installing native deps. You'll need to start services manually:"
  echo
  log "Installing JS deps (pnpm)…"
  pnpm install
  log "Building dashboard…"
  pnpm --filter @observaai/dashboard build
  log "Installing Python deps…"
  python3 -m venv "$INSTALL_DIR/apps/gateway/.venv"
  "$INSTALL_DIR/apps/gateway/.venv/bin/pip" install --quiet -r "$INSTALL_DIR/apps/gateway/requirements.txt"
  ok "Native install complete"
  echo
  echo "Start services in two terminals:"
  echo "  ${CYAN}cd apps/gateway && .venv/bin/uvicorn app.main:app --port 8000 --reload${RESET}"
  echo "  ${CYAN}pnpm --filter @observaai/dashboard dev${RESET}"
fi

# ── done ─────────────────────────────────────────────────────────────────────
section "Next steps"
cat <<EOF

  ${BOLD}1.${RESET} Edit ${CYAN}$ROOT_ENV${RESET} and add your provider API keys.
  ${BOLD}2.${RESET} Open the dashboard: ${CYAN}http://localhost:3000${RESET}
  ${BOLD}3.${RESET} Point your LLM SDK at one of these proxy URLs:

        ${DIM}OpenAI${RESET}     →  http://localhost:8000/proxy/openai
        ${DIM}Anthropic${RESET}  →  http://localhost:8000/proxy/anthropic
        ${DIM}Gemini${RESET}     →  http://localhost:8000/proxy/gemini
        ${DIM}Ollama${RESET}     →  http://localhost:8000/proxy/ollama
        ${DIM}OpenRouter${RESET} →  http://localhost:8000/proxy/openrouter

  ${BOLD}4.${RESET} Optional — install the VS Code extension:
        ${CYAN}cd apps/vscode-extension && pnpm package${RESET}
        ${DIM}(or install from the Marketplace once published)${RESET}

  Docs:    ${BLUE}https://github.com/prathamesh98rodge-tech/ObservaAI${RESET}
  Issues:  ${BLUE}https://github.com/prathamesh98rodge-tech/ObservaAI/issues${RESET}

  ${GREEN}Happy monitoring!${RESET}

EOF
