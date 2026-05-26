import * as vscode from "vscode";
import type { LiveMetrics } from "@observaai/shared-types";
import type { SessionManager } from "./SessionManager";

export class StatusBarController {
  private item: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext, session: SessionManager) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "observaai.openDashboard";
    this.item.tooltip = "ObservaAI — click to open dashboard";
    this.item.text = "$(pulse) ObservaAI";
    this.item.show();

    session.on("update", (metrics: LiveMetrics) => this.update(metrics));
    context.subscriptions.push(this.item);
  }

  private update(metrics: LiveMetrics) {
    const tokens = metrics.sessionTokens >= 1000
      ? `${(metrics.sessionTokens / 1000).toFixed(1)}K`
      : String(metrics.sessionTokens);
    const cost = metrics.sessionCost < 0.01
      ? "<$0.01"
      : `$${metrics.sessionCost.toFixed(2)}`;
    this.item.text = `$(pulse) ${tokens} tok · ${cost}`;
  }

  dispose() {
    this.item.dispose();
  }
}
