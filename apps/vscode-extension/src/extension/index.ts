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

    vscode.commands.registerCommand("observaai.updateSubscriptionUsage", async () => {
      const gatewayUrl = vscode.workspace
        .getConfiguration("observaai")
        .get<string>("gatewayUrl", "http://localhost:8000");

      const provider = await vscode.window.showQuickPick(["claude", "openai", "gemini"], {
        placeHolder: "Which provider?",
      });
      if (!provider) return;

      const plan = await vscode.window.showInputBox({ prompt: "Plan name (e.g. Pro, Plus)", value: "" });
      const hourlyUsedStr = await vscode.window.showInputBox({ prompt: "Hourly prompts used", value: "0" });
      const hourlyLimitStr = await vscode.window.showInputBox({ prompt: "Hourly prompt limit", value: "0" });
      const weeklyUsedStr = await vscode.window.showInputBox({ prompt: "Weekly prompts used", value: "0" });
      const weeklyLimitStr = await vscode.window.showInputBox({ prompt: "Weekly prompt limit", value: "0" });

      const body = {
        provider,
        plan: plan ?? "",
        hourly_used: parseInt(hourlyUsedStr ?? "0", 10) || 0,
        hourly_limit: parseInt(hourlyLimitStr ?? "0", 10) || 0,
        weekly_used: parseInt(weeklyUsedStr ?? "0", 10) || 0,
        weekly_limit: parseInt(weeklyLimitStr ?? "0", 10) || 0,
      };

      try {
        await fetch(`${gatewayUrl}/subscriptions/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        vscode.window.showInformationMessage(`ObservaAI: ${provider} usage snapshot saved.`);
      } catch {
        vscode.window.showErrorMessage("ObservaAI: Could not reach gateway.");
      }
    }),

    vscode.commands.registerCommand("observaai.prepareHandover", async () => {
      const gatewayUrl = vscode.workspace
        .getConfiguration("observaai")
        .get<string>("gatewayUrl", "http://localhost:8000");

      let nextProvider = "openai";
      try {
        const recRes = await fetch(`${gatewayUrl}/subscriptions/recommend`);
        if (recRes.ok) {
          const rec = await recRes.json() as { recommended: string | null };
          if (rec.recommended) nextProvider = rec.recommended;
        }
      } catch { /* use default */ }

      const currentProvider = await vscode.window.showQuickPick(["claude", "openai", "gemini"], {
        placeHolder: "Current provider (hit limit)",
      });
      if (!currentProvider) return;

      const toProvider = await vscode.window.showQuickPick(["claude", "openai", "gemini"], {
        placeHolder: `Switch to (recommended: ${nextProvider})`,
      });
      if (!toProvider) return;

      const goal = await vscode.window.showInputBox({ prompt: "What were you working on?" });
      if (!goal) return;

      const contextSummary = await vscode.window.showInputBox({
        prompt: "Paste key context / decisions made so far",
        value: "",
      });

      const body = {
        current_provider: currentProvider,
        next_provider: toProvider,
        goal,
        context_summary: contextSummary ?? "",
      };

      try {
        const res = await fetch(`${gatewayUrl}/handover/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const data = await res.json() as { handover_md: string };
        await vscode.env.clipboard.writeText(data.handover_md);
        const action = await vscode.window.showInformationMessage(
          `ObservaAI: Handover doc copied. Paste it into ${toProvider.charAt(0).toUpperCase() + toProvider.slice(1)}.`,
          "Open Dashboard"
        );
        if (action) vscode.commands.executeCommand("observaai.openDashboard");
      } catch {
        vscode.window.showErrorMessage("ObservaAI: Could not generate handover document.");
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
