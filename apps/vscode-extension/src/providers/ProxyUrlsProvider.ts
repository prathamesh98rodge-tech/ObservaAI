import * as vscode from "vscode";
import type { SessionManager } from "../extension/SessionManager";

const PROVIDERS = [
  { label: "OpenAI", path: "openai" },
  { label: "Anthropic", path: "anthropic" },
  { label: "Gemini", path: "gemini" },
  { label: "Ollama", path: "ollama" },
  { label: "OpenRouter", path: "openrouter" },
];

export class ProxyUrlsProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly session: SessionManager,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((msg: { type: string; provider?: string }) => {
      if (msg.type === "copyUrl" && msg.provider) {
        vscode.commands.executeCommand("observaai.copyProxyUrl", msg.provider);
      }
    });
  }

  private getHtml(): string {
    const gatewayUrl = vscode.workspace
      .getConfiguration("observaai")
      .get<string>("gatewayUrl", "http://localhost:8000");

    const rows = PROVIDERS.map(({ label, path }) => {
      const url = `${gatewayUrl}/proxy/${path}`;
      return `
        <div class="row">
          <span class="label">${label}</span>
          <code class="url">${url}</code>
          <button class="btn" onclick="copy('${path}')">Copy</button>
        </div>`;
    }).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: 12px; color: var(--vscode-foreground); padding: 10px; }
  .row { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  .row:last-child { border-bottom: none; }
  .label { width: 72px; flex-shrink: 0; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .url { flex: 1; font-family: var(--vscode-editor-font-family, monospace); font-size: 10px; color: var(--vscode-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn { font-size: 10px; padding: 2px 8px; border-radius: 3px; border: none; cursor: pointer; flex-shrink: 0; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-family: var(--vscode-font-family); }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .note { font-size: 10px; color: var(--vscode-descriptionForeground); padding-top: 10px; line-height: 1.5; }
</style>
</head>
<body>
  ${rows}
  <p class="note">Set one of these as your SDK <code>baseURL</code> to route traffic through ObservaAI.</p>
  <script>
    const vscode = acquireVsCodeApi();
    function copy(provider) { vscode.postMessage({ type: 'copyUrl', provider }); }
  </script>
</body>
</html>`;
  }
}
