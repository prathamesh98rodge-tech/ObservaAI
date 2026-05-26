import { EventEmitter } from "events";
import * as vscode from "vscode";
import WebSocket from "ws";
import type { LiveMetrics } from "@observaai/shared-types";

export interface OllamaRunningModel {
  name: string;
  model: string;
  size: number;
  size_vram: number;
  expires_at: string;
  details?: Record<string, unknown>;
}

export interface BudgetAlert {
  budget_id: string;
  label: string;
  level: "warning" | "exceeded";
  spend_usd: number;
  limit_usd: number;
  spend_pct: number;
  provider: string | null;
  workspace: string | null;
  period: string;
}

export interface ExtendedMetrics extends LiveMetrics {
  gatewayOnline: boolean;
  wsConnected: boolean;
  ollamaRunning: OllamaRunningModel[];
  budgetAlerts: BudgetAlert[];
  cacheActive: boolean;
}

const POLL_INTERVAL_MS = 8_000;
const OLLAMA_POLL_INTERVAL_MS = 15_000;
const BUDGET_POLL_INTERVAL_MS = 30_000;
const WS_RECONNECT_BASE_MS = 2_000;
const WS_RECONNECT_MAX_MS = 30_000;

export class SessionManager extends EventEmitter {
  private state: ExtendedMetrics = this.defaultState();

  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private ollamaTimer: ReturnType<typeof setInterval> | null = null;
  private budgetTimer: ReturnType<typeof setInterval> | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsReconnectDelay = WS_RECONNECT_BASE_MS;
  private wsIntentionalClose = false;

  // Track previously-seen alert IDs to fire notifications only on new ones
  private seenAlertIds = new Set<string>();

  start() {
    this.tryConnectWs();
    this.fetchMetrics();
    this.pollTimer = setInterval(() => this.fetchMetrics(), POLL_INTERVAL_MS);

    const cfg = vscode.workspace.getConfiguration("observaai");
    if (cfg.get<boolean>("showOllamaMetrics", true)) {
      this.fetchOllamaMetrics();
      this.ollamaTimer = setInterval(() => this.fetchOllamaMetrics(), OLLAMA_POLL_INTERVAL_MS);
    }

    this.fetchBudgetAlerts();
    this.budgetTimer = setInterval(() => this.fetchBudgetAlerts(), BUDGET_POLL_INTERVAL_MS);

    // Check cache status alongside regular poll
    this.fetchCacheStatus();
  }

  reset() {
    this.state = this.defaultState();
    this.seenAlertIds.clear();
    this.emit("update", this.state);
  }

  getMetrics(): ExtendedMetrics {
    return this.state;
  }

  dispose() {
    this.wsIntentionalClose = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.ollamaTimer) clearInterval(this.ollamaTimer);
    if (this.budgetTimer) clearInterval(this.budgetTimer);
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    this.ws?.close();
  }

  // ── private ────────────────────────────────────────────────────────────────

  private gatewayUrl(): string {
    return vscode.workspace
      .getConfiguration("observaai")
      .get<string>("gatewayUrl", "http://localhost:8000");
  }

  private teamHeaders(): Record<string, string> {
    const key = vscode.workspace
      .getConfiguration("observaai")
      .get<string>("teamApiKey", "");
    return key ? { "X-ObservaAI-Team-Key": key } : {};
  }

  private async fetchMetrics() {
    try {
      const res = await fetch(`${this.gatewayUrl()}/analytics/live`, { headers: this.teamHeaders() });
      if (res.ok) {
        const data = await res.json() as LiveMetrics;
        this.state = { ...this.state, ...data, gatewayOnline: true };
        this.emit("update", this.state);
        // Refresh cache status on every metrics poll
        this.fetchCacheStatus();
      } else {
        this.setOffline();
      }
    } catch {
      this.setOffline();
    }
  }

  private async fetchCacheStatus() {
    try {
      const res = await fetch(`${this.gatewayUrl()}/analytics/requests?limit=1`, { headers: this.teamHeaders() });
      if (!res.ok) return;
      const data = await res.json() as Array<{ cache_active?: boolean }>;
      const cacheActive = data.length > 0 && data[0].cache_active === true;
      this.state = { ...this.state, cacheActive };
      this.emit("update", this.state);
    } catch { /* leave existing state */ }
  }

  private async fetchOllamaMetrics() {
    try {
      const res = await fetch(`${this.gatewayUrl()}/ollama/ps`, { headers: this.teamHeaders() });
      if (res.ok) {
        const data = await res.json() as { models: OllamaRunningModel[] };
        this.state = { ...this.state, ollamaRunning: data.models ?? [] };
        this.emit("update", this.state);
      }
    } catch {
      // Ollama offline — leave existing metrics
    }
  }

  private async fetchBudgetAlerts() {
    try {
      const res = await fetch(`${this.gatewayUrl()}/budgets/alerts`, { headers: this.teamHeaders() });
      if (!res.ok) return;
      const data = await res.json() as { alerts: BudgetAlert[] };
      const alerts = data.alerts ?? [];

      // Fire VS Code notifications for newly triggered alerts
      for (const alert of alerts) {
        const key = `${alert.budget_id}:${alert.level}`;
        if (!this.seenAlertIds.has(key)) {
          this.seenAlertIds.add(key);
          const pct = (alert.spend_pct * 100).toFixed(0);
          const label = alert.label || `${alert.provider ?? "all"} · ${alert.period}`;
          const msg = alert.level === "exceeded"
            ? `ObservaAI: Budget EXCEEDED — ${label} ($${alert.spend_usd.toFixed(2)} / $${alert.limit_usd})`
            : `ObservaAI: Budget alert — ${label} at ${pct}% ($${alert.spend_usd.toFixed(2)} / $${alert.limit_usd})`;

          if (alert.level === "exceeded") {
            vscode.window.showErrorMessage(msg, "Open Dashboard").then((action) => {
              if (action) vscode.commands.executeCommand("observaai.openDashboard");
            });
          } else {
            vscode.window.showWarningMessage(msg, "Open Dashboard").then((action) => {
              if (action) vscode.commands.executeCommand("observaai.openDashboard");
            });
          }
        }
      }

      // Remove cleared alerts from seen set so they re-notify if they cross again
      const activeKeys = new Set(alerts.map((a) => `${a.budget_id}:${a.level}`));
      for (const key of this.seenAlertIds) {
        if (!activeKeys.has(key)) this.seenAlertIds.delete(key);
      }

      this.state = { ...this.state, budgetAlerts: alerts };
      this.emit("update", this.state);
    } catch {
      // Gateway offline — leave existing alert state
    }
  }

  private setOffline() {
    if (this.state.gatewayOnline) {
      this.state = { ...this.state, gatewayOnline: false };
      this.emit("update", this.state);
    }
  }

  private tryConnectWs() {
    if (this.wsIntentionalClose) return;
    const wsUrl = this.gatewayUrl().replace(/^http/, "ws") + "/ws/metrics";
    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.on("open", () => {
        this.wsReconnectDelay = WS_RECONNECT_BASE_MS;
        this.state = { ...this.state, wsConnected: true };
        this.emit("update", this.state);
      });

      ws.on("message", (raw: WebSocket.RawData) => {
        try {
          const data = JSON.parse(raw.toString()) as LiveMetrics & { type?: string };
          if (data.type === "ping") return;
          this.state = { ...this.state, ...data, gatewayOnline: true, wsConnected: true };
          this.emit("update", this.state);
        } catch { /* ignore malformed */ }
      });

      ws.on("close", () => {
        this.state = { ...this.state, wsConnected: false };
        this.emit("update", this.state);
        this.scheduleWsReconnect();
      });

      ws.on("error", () => {
        // close event follows
      });
    } catch {
      this.scheduleWsReconnect();
    }
  }

  private scheduleWsReconnect() {
    if (this.wsIntentionalClose) return;
    if (this.wsReconnectTimer) return;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, WS_RECONNECT_MAX_MS);
      this.tryConnectWs();
    }, this.wsReconnectDelay);
  }

  private defaultState(): ExtendedMetrics {
    return {
      sessionTokens: 0,
      sessionCost: 0,
      avgLatencyMs: 0,
      requestsInFlight: 0,
      usageByProvider: [],
      gatewayOnline: false,
      wsConnected: false,
      ollamaRunning: [],
      budgetAlerts: [],
      cacheActive: false,
    };
  }
}
