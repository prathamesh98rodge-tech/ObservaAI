import * as vscode from "vscode";
import type { LiveMetrics } from "@observaai/shared-types";
import type { SessionManager } from "../extension/SessionManager";

export class MetricsPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly session: SessionManager,
  ) {
    session.on("update", (metrics: LiveMetrics) => {
      if (this.view) {
        this.view.webview.postMessage({ type: "metrics", data: metrics });
      }
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "ready") {
        webviewView.webview.postMessage({
          type: "metrics",
          data: this.session.getMetrics(),
        });
      }
    });
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: 12px; color: var(--vscode-foreground); padding: 8px; }
    .header { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
    .provider { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px; margin-bottom: 8px; }
    .provider-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .model { font-size: 10px; color: var(--vscode-descriptionForeground); font-family: monospace; margin-bottom: 8px; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .metric { display: flex; flex-direction: column; }
    .metric-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vscode-descriptionForeground); }
    .metric-value { font-family: monospace; font-size: 12px; font-weight: 500; }
    .blue { color: #60a5fa; } .green { color: #34d399; } .yellow { color: #fbbf24; } .purple { color: #a78bfa; }
    .summary { border-top: 1px solid var(--vscode-panel-border); padding-top: 8px; margin-top: 8px; display: flex; justify-content: space-between; }
    .empty { text-align: center; padding: 24px 8px; color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="header">Live Metrics</div>
  <div id="root"><div class="empty">Waiting for gateway...<br>Start the ObservaAI gateway to see live metrics.</div></div>
  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });
    const fmt = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n);
    const fmtCost = (c) => c < 0.0001 ? '<$0.0001' : c < 0.01 ? '$'+c.toFixed(4) : '$'+c.toFixed(2);
    const fmtMs = (ms) => ms >= 1000 ? (ms/1000).toFixed(1)+'s' : ms+'ms';
    const COLORS = { anthropic:'#f97316', openai:'#10b981', gemini:'#3b82f6', ollama:'#a855f7', openrouter:'#64748b' };
    window.addEventListener('message', ({ data }) => {
      if (data.type !== 'metrics') return;
      const m = data.data;
      const usage = m.usageByProvider || [];
      if (!usage.length) { document.getElementById('root').innerHTML = '<div class="empty">No requests yet.<br>Route AI calls through the gateway.</div>'; return; }
      document.getElementById('root').innerHTML = usage.map(u => \`
        <div class="provider">
          <div class="provider-name" style="color:\${COLORS[u.provider]||'#94a3b8'}">\${u.provider}</div>
          <div class="model">\${u.model}</div>
          <div class="metrics">
            <div class="metric"><span class="metric-label">Input</span><span class="metric-value blue">\${fmt(u.totalInputTokens)}</span></div>
            <div class="metric"><span class="metric-label">Output</span><span class="metric-value green">\${fmt(u.totalOutputTokens)}</span></div>
            <div class="metric"><span class="metric-label">Cost</span><span class="metric-value green">\${fmtCost(u.totalCost)}</span></div>
            <div class="metric"><span class="metric-label">Latency</span><span class="metric-value yellow">\${fmtMs(u.avgLatencyMs)}</span></div>
          </div>
        </div>
      \`).join('') + \`
        <div class="summary">
          <span class="metric-value purple">\${fmt(m.sessionTokens)} total</span>
          <span class="metric-value green">\${fmtCost(m.sessionCost)}</span>
        </div>
      \`;
    });
  </script>
</body>
</html>`;
  }
}
