import * as vscode from "vscode";
import type { SessionManager, ExtendedMetrics } from "../extension/SessionManager";

type WebviewMessage =
  | { type: "ready" }
  | { type: "openDashboard" }
  | { type: "resetSession" }
  | { type: "copyProxyUrl"; provider: string };

export class MetricsPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly session: SessionManager,
  ) {
    session.on("update", (metrics: ExtendedMetrics) => {
      this.view?.webview.postMessage({ type: "metrics", data: metrics });
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      switch (msg.type) {
        case "ready":
          webviewView.webview.postMessage({ type: "metrics", data: this.session.getMetrics() });
          break;
        case "openDashboard":
          vscode.commands.executeCommand("observaai.openDashboard");
          break;
        case "resetSession":
          vscode.commands.executeCommand("observaai.resetSession");
          break;
        case "copyProxyUrl":
          vscode.commands.executeCommand("observaai.copyProxyUrl", msg.provider);
          break;
      }
    });
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: var(--vscode-foreground);
    padding: 10px 10px 16px;
    line-height: 1.4;
  }

  /* ── connection banner ── */
  .conn-banner {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; border-radius: 5px; margin-bottom: 10px;
    font-size: 11px; font-weight: 500;
  }
  .conn-live   { background: rgba(52,211,153,.12); color: #34d399; border: 1px solid rgba(52,211,153,.25); }
  .conn-poll   { background: rgba(251,191,36,.10);  color: #fbbf24; border: 1px solid rgba(251,191,36,.2); }
  .conn-off    { background: rgba(248,113,113,.10); color: #f87171; border: 1px solid rgba(248,113,113,.2); }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot-live { background: #34d399; box-shadow: 0 0 5px #34d399; animation: pulse 2s infinite; }
  .dot-poll { background: #fbbf24; }
  .dot-off  { background: #f87171; }
  @keyframes pulse { 0%,100%{ opacity:1 } 50%{ opacity:.4 } }

  /* ── section header ── */
  .sec-hdr {
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .06em;
    color: var(--vscode-descriptionForeground);
    margin: 10px 0 6px;
  }

  /* ── summary strip ── */
  .summary {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 4px; margin-bottom: 6px;
  }
  .stat { padding: 6px 8px; border-radius: 5px; background: var(--vscode-editor-inactiveSelectionBackground); }
  .stat-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: var(--vscode-descriptionForeground); margin-bottom: 1px; }
  .stat-val { font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; font-weight: 600; }
  .blue   { color: #60a5fa; }
  .green  { color: #34d399; }
  .yellow { color: #fbbf24; }
  .purple { color: #a78bfa; }

  /* ── provider card ── */
  .provider {
    border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;
    border-left: 3px solid var(--accent, #64748b);
    background: var(--vscode-editor-inactiveSelectionBackground);
  }
  .prov-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .prov-name { font-weight: 600; font-size: 12px; }
  .prov-model { font-size: 10px; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family, monospace); margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 8px; }
  .m-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: var(--vscode-descriptionForeground); }
  .m-val { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; font-weight: 500; }

  /* ── ollama section ── */
  .ollama-card { border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; background: var(--vscode-editor-inactiveSelectionBackground); border-left: 3px solid #a855f7; }
  .ollama-model { font-size: 12px; font-weight: 600; color: #a855f7; margin-bottom: 3px; }
  .vram-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  .vram-bar { flex: 1; height: 4px; border-radius: 2px; background: var(--vscode-panel-border); overflow: hidden; }
  .vram-fill { height: 100%; border-radius: 2px; background: #a855f7; }
  .vram-label { font-size: 10px; font-family: var(--vscode-editor-font-family, monospace); color: var(--vscode-descriptionForeground); white-space: nowrap; }

  /* ── empty state ── */
  .empty { text-align: center; padding: 24px 8px; color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.6; }

  /* ── actions ── */
  .actions { display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap; }
  .btn {
    font-size: 11px; padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer;
    font-family: var(--vscode-font-family); display: inline-flex; align-items: center; gap: 4px;
  }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground, rgba(255,255,255,.07)); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,.12)); }
</style>
</head>
<body>
  <div id="root"><div class="empty">Connecting to gateway…</div></div>

  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });

    const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n??0);
    const fmtCost = c => !c || c < 0.0001 ? '<$0.0001' : c < 0.01 ? '$'+c.toFixed(4) : '$'+c.toFixed(2);
    const fmtMs = ms => !ms ? '—' : ms >= 1000 ? (ms/1000).toFixed(1)+'s' : ms+'ms';
    const fmtGB = b => b ? (b/1e9).toFixed(1)+' GB' : '—';

    const COLORS = {
      anthropic: '#f97316', openai: '#10b981', gemini: '#3b82f6',
      ollama: '#a855f7', openrouter: '#64748b',
    };

    function renderConn(m) {
      if (!m.gatewayOnline) return '<div class="conn-banner conn-off"><span class="dot dot-off"></span>Gateway offline</div>';
      if (m.wsConnected)    return '<div class="conn-banner conn-live"><span class="dot dot-live"></span>Live · WebSocket</div>';
      return '<div class="conn-banner conn-poll"><span class="dot dot-poll"></span>Polling · HTTP</div>';
    }

    function renderSummary(m) {
      return \`
        <div class="sec-hdr">Session</div>
        <div class="summary">
          <div class="stat"><div class="stat-lbl">Tokens</div><div class="stat-val blue">\${fmt(m.sessionTokens)}</div></div>
          <div class="stat"><div class="stat-lbl">Cost</div><div class="stat-val green">\${fmtCost(m.sessionCost)}</div></div>
          <div class="stat"><div class="stat-lbl">Avg Latency</div><div class="stat-val yellow">\${fmtMs(m.avgLatencyMs)}</div></div>
          <div class="stat"><div class="stat-lbl">In Flight</div><div class="stat-val purple">\${m.requestsInFlight??0}</div></div>
        </div>
      \`;
    }

    function renderProviders(usage) {
      if (!usage || !usage.length) return '<div class="empty">No requests yet.<br>Route AI calls through the gateway.</div>';
      return '<div class="sec-hdr">Providers</div>' + usage.map(u => {
        const color = COLORS[u.provider] || '#64748b';
        const total = (u.totalInputTokens||0) + (u.totalOutputTokens||0);
        return \`
          <div class="provider" style="--accent:\${color}">
            <div class="prov-header">
              <span class="prov-name" style="color:\${color}">\${u.provider}</span>
              <span class="m-val green">\${fmtCost(u.totalCost)}</span>
            </div>
            <div class="prov-model">\${u.model||'—'}</div>
            <div class="prov-grid">
              <div><div class="m-lbl">Input</div><div class="m-val blue">\${fmt(u.totalInputTokens)}</div></div>
              <div><div class="m-lbl">Output</div><div class="m-val green">\${fmt(u.totalOutputTokens)}</div></div>
              <div><div class="m-lbl">Total</div><div class="m-val purple">\${fmt(total)}</div></div>
              <div><div class="m-lbl">Latency</div><div class="m-val yellow">\${fmtMs(u.avgLatencyMs)}</div></div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderOllama(models) {
      if (!models || !models.length) return '';
      return '<div class="sec-hdr">Ollama — Running</div>' + models.map(m => {
        const pct = m.size > 0 ? Math.round((m.size_vram / m.size) * 100) : 0;
        return \`
          <div class="ollama-card">
            <div class="ollama-model">\${m.name}</div>
            <div class="vram-row">
              <div class="vram-bar"><div class="vram-fill" style="width:\${pct}%"></div></div>
              <span class="vram-label">\${fmtGB(m.size_vram)} VRAM / \${fmtGB(m.size)}</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderActions() {
      return \`
        <div class="actions">
          <button class="btn btn-primary" onclick="vscode.postMessage({type:'openDashboard'})">Open Dashboard</button>
          <button class="btn btn-secondary" onclick="vscode.postMessage({type:'resetSession'})">Reset Session</button>
        </div>
      \`;
    }

    window.addEventListener('message', ({ data }) => {
      if (data.type !== 'metrics') return;
      const m = data.data;
      const hasData = m.gatewayOnline && (m.usageByProvider?.length > 0 || m.sessionTokens > 0);

      document.getElementById('root').innerHTML =
        renderConn(m) +
        (hasData ? renderSummary(m) : '') +
        renderProviders(m.usageByProvider) +
        renderOllama(m.ollamaRunning) +
        renderActions();
    });
  </script>
</body>
</html>`;
  }
}
