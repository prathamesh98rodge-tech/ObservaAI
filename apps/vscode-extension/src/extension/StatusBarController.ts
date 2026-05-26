import * as vscode from "vscode";
import type { SessionManager, ExtendedMetrics } from "./SessionManager";

export class StatusBarController {
  private item: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext, session: SessionManager) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "observaai.openDashboard";
    this.item.text = "$(pulse) ObservaAI";
    this.item.tooltip = "ObservaAI — click to open dashboard";
    this.item.show();

    session.on("update", (metrics: ExtendedMetrics) => this.update(metrics));
    context.subscriptions.push(this.item);
  }

  private update(metrics: ExtendedMetrics) {
    if (!metrics.gatewayOnline) {
      this.item.text = "$(warning) ObservaAI offline";
      this.item.tooltip = "ObservaAI gateway is unreachable — check that it is running.";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      return;
    }

    this.item.backgroundColor = undefined;

    const tokens = fmtTokens(metrics.sessionTokens);
    const cost = fmtCost(metrics.sessionCost);
    const icon = metrics.wsConnected ? "$(pulse)" : "$(radio-tower)";
    const cacheLabel = metrics.cacheActive ? " · ⚡cache" : "";
    this.item.text = `${icon} ${tokens} · ${cost}${cacheLabel}`;

    const providerLines = (metrics.usageByProvider ?? [])
      .map((u) => `  ${u.provider}: ${fmtTokens(u.totalInputTokens + u.totalOutputTokens)} · ${fmtCost(u.totalCost)}`)
      .join("\n");

    const connLabel = metrics.wsConnected ? "● Live (WebSocket)" : "○ Polling (HTTP)";
    this.item.tooltip = new vscode.MarkdownString(
      `**ObservaAI** — ${connLabel}\n\n` +
      `Session: **${tokens}** tokens · **${cost}**\n` +
      `Avg latency: **${fmtMs(metrics.avgLatencyMs)}**\n` +
      (providerLines ? `\n**By provider:**\n${providerLines}\n` : "") +
      `\n_Click to open dashboard_`,
      true,
    );
  }

  dispose() {
    this.item.dispose();
  }
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(c: number): string {
  if (c < 0.0001) return "<$0.0001";
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(2)}`;
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
