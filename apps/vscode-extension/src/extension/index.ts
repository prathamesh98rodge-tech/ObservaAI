import * as vscode from "vscode";
import { MetricsPanelProvider } from "../providers/MetricsPanelProvider";
import { ProxyUrlsProvider } from "../providers/ProxyUrlsProvider";
import { StatusBarController } from "./StatusBarController";
import { SessionManager } from "./SessionManager";

let statusBar: StatusBarController | undefined;

export function activate(context: vscode.ExtensionContext) {
  const session = new SessionManager();
  statusBar = new StatusBarController(context, session);

  const metricsProvider = new MetricsPanelProvider(context.extensionUri, session);
  const proxyProvider = new ProxyUrlsProvider(context.extensionUri, session);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("observaai.metrics", metricsProvider),
    vscode.window.registerWebviewViewProvider("observaai.proxy", proxyProvider),

    vscode.commands.registerCommand("observaai.openDashboard", () => {
      const gatewayUrl = vscode.workspace
        .getConfiguration("observaai")
        .get<string>("gatewayUrl", "http://localhost:8000");
      const dashboardUrl = gatewayUrl.replace(/:8000\/?$/, ":3000");
      vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    }),

    vscode.commands.registerCommand("observaai.resetSession", async () => {
      const gatewayUrl = vscode.workspace
        .getConfiguration("observaai")
        .get<string>("gatewayUrl", "http://localhost:8000");
      try {
        await fetch(`${gatewayUrl}/session/reset`, { method: "POST" });
      } catch {
        // Gateway may be offline — reset local state only
      }
      session.reset();
      vscode.window.showInformationMessage("ObservaAI: Session reset.");
    }),

    vscode.commands.registerCommand("observaai.testConnection", async () => {
      const gatewayUrl = vscode.workspace
        .getConfiguration("observaai")
        .get<string>("gatewayUrl", "http://localhost:8000");
      try {
        const res = await fetch(`${gatewayUrl}/health`);
        if (res.ok) {
          vscode.window.showInformationMessage(`ObservaAI: Gateway is online at ${gatewayUrl}`);
        } else {
          vscode.window.showWarningMessage(`ObservaAI: Gateway responded with ${res.status}`);
        }
      } catch {
        vscode.window.showErrorMessage(`ObservaAI: Cannot reach gateway at ${gatewayUrl}`);
      }
    }),

    vscode.commands.registerCommand("observaai.copyProxyUrl", async (provider?: string) => {
      const gatewayUrl = vscode.workspace
        .getConfiguration("observaai")
        .get<string>("gatewayUrl", "http://localhost:8000");

      const providers = ["openai", "anthropic", "gemini", "ollama", "openrouter"];

      let chosen = provider;
      if (!chosen) {
        chosen = await vscode.window.showQuickPick(providers, {
          placeHolder: "Select provider to copy proxy URL",
        });
      }

      if (!chosen) return;

      const url = `${gatewayUrl}/proxy/${chosen}`;
      await vscode.env.clipboard.writeText(url);
      vscode.window.showInformationMessage(`ObservaAI: Copied proxy URL for ${chosen}`);
    }),
  );

  session.start();
}

export function deactivate() {
  statusBar?.dispose();
}
