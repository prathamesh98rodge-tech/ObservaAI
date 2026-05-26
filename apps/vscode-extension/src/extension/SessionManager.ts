import { EventEmitter } from "events";
import * as vscode from "vscode";
import type { LiveMetrics } from "@observaai/shared-types";

export class SessionManager extends EventEmitter {
  private metrics: LiveMetrics = {
    sessionTokens: 0,
    sessionCost: 0,
    avgLatencyMs: 0,
    requestsInFlight: 0,
    usageByProvider: [],
  };

  private ws: WebSocket | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  start() {
    this.connectWebSocket();
    this.pollInterval = setInterval(() => this.fetchMetrics(), 10_000);
    this.fetchMetrics();
  }

  reset() {
    this.metrics = {
      sessionTokens: 0,
      sessionCost: 0,
      avgLatencyMs: 0,
      requestsInFlight: 0,
      usageByProvider: [],
    };
    this.emit("update", this.metrics);
  }

  getMetrics(): LiveMetrics {
    return this.metrics;
  }

  private gatewayUrl(): string {
    return vscode.workspace
      .getConfiguration("observaai")
      .get<string>("gatewayUrl", "http://localhost:8000");
  }

  private async fetchMetrics() {
    try {
      const res = await fetch(`${this.gatewayUrl()}/analytics/live`);
      if (res.ok) {
        this.metrics = await res.json();
        this.emit("update", this.metrics);
      }
    } catch {
      // Gateway offline — silently skip
    }
  }

  private connectWebSocket() {
    try {
      const wsUrl = this.gatewayUrl().replace(/^http/, "ws") + "/ws/metrics";
      this.ws = new (require("ws"))(wsUrl) as WebSocket;
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type !== "ping") {
            this.metrics = data;
            this.emit("update", this.metrics);
          }
        } catch { /* ignore malformed messages */ }
      };
    } catch { /* ws module not available or gateway offline */ }
  }

  dispose() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.ws?.close();
  }
}
