import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { MetricsPanelProvider } from "../providers/MetricsPanelProvider";
import { ProxyUrlsProvider } from "../providers/ProxyUrlsProvider";
import { StatusBarController } from "./StatusBarController";
import { SessionManager } from "./SessionManager";
import { ClaudeLogWatcher } from "./ClaudeLogWatcher";

let statusBar: StatusBarController | undefined;
let cliStatusBar: vscode.StatusBarItem | undefined;

function getGatewayUrl(): string {
  return vscode.workspace
    .getConfiguration("observaai")
    .get<string>("gatewayUrl", "http://localhost:8000");
}

function getCLIEnvVars(): Record<string, string> {
  const base = getGatewayUrl();
  return {
    ANTHROPIC_BASE_URL: `${base}/proxy/anthropic`,
    OPENAI_BASE_URL: `${base}/proxy/openai/v1`,
    GEMINI_API_BASE: `${base}/proxy/gemini/v1beta`,
  };
}

function updateCliStatusBar(enabled: boolean): void {
  if (!cliStatusBar) return;
  if (enabled) {
    cliStatusBar.text = "$(circle-filled) CLI proxy: active";
    cliStatusBar.tooltip = "ObservaAI is injecting env vars into new terminals. Click to toggle.";
    cliStatusBar.backgroundColor = undefined;
  } else {
    cliStatusBar.text = "$(circle-outline) CLI proxy: off";
    cliStatusBar.tooltip = "ObservaAI CLI proxy is disabled. Click to enable.";
    cliStatusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }
}

export function activate(context: vscode.ExtensionContext) {
  const session = new SessionManager();
  statusBar = new StatusBarController(context, session);

  const metricsProvider = new MetricsPanelProvider(context.extensionUri, session);
  const proxyProvider = new ProxyUrlsProvider(context.extensionUri, session);

  // CLI proxy status bar
  cliStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  cliStatusBar.command = "observaai.toggleCliProxy";
  context.subscriptions.push(cliStatusBar);
  const cliProxyEnabled = context.globalState.get<boolean>("observaai.cliProxyEnabled", true);
  updateCliStatusBar(cliProxyEnabled);
  cliStatusBar.show();

  // Claude CLI log watcher
  const logWatcher = new ClaudeLogWatcher(context, getGatewayUrl);
  logWatcher.start();

  // Inject env vars into every new terminal when CLI proxy is enabled
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal((terminal) => {
      const enabled = context.globalState.get<boolean>("observaai.cliProxyEnabled", true);
      if (!enabled) return;
      const vars = getCLIEnvVars();
      // Use a small delay so the shell is ready before we send text
      setTimeout(() => {
        for (const [key, val] of Object.entries(vars)) {
          if (process.platform === "win32") {
            terminal.sendText(`$env:${key} = "${val}"`, true);
          } else {
            terminal.sendText(`export ${key}="${val}"`, true);
          }
        }
      }, 500);
    }),
  );

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

    vscode.commands.registerCommand("observaai.toggleCliProxy", async () => {
      const current = context.globalState.get<boolean>("observaai.cliProxyEnabled", true);
      const next = !current;
      await context.globalState.update("observaai.cliProxyEnabled", next);
      updateCliStatusBar(next);
      vscode.window.showInformationMessage(
        next
          ? "ObservaAI: CLI proxy enabled — new terminals will have env vars injected."
          : "ObservaAI: CLI proxy disabled — new terminals will not be modified.",
      );
    }),

    vscode.commands.registerCommand("observaai.configureShellForCli", async () => {
      const gatewayUrl = getGatewayUrl();
      let exports: Record<string, string>;
      try {
        const res = await fetch(`${gatewayUrl}/setup/shell-exports`);
        if (!res.ok) throw new Error();
        const data = await res.json() as { exports: Record<string, string> };
        exports = data.exports;
      } catch {
        vscode.window.showErrorMessage("ObservaAI: Cannot reach gateway to fetch shell exports.");
        return;
      }

      const shellPick = await vscode.window.showQuickPick(
        ["bash / zsh", "fish", "PowerShell"],
        { placeHolder: "Select your default shell" },
      );
      if (!shellPick) return;

      let profileFile: string;
      let block: string;
      const home = os.homedir();
      if (shellPick === "bash / zsh") {
        block = exports["bash_zsh"];
        const shell = process.env.SHELL ?? "";
        profileFile = shell.includes("zsh")
          ? path.join(home, ".zshrc")
          : path.join(home, ".bashrc");
      } else if (shellPick === "fish") {
        block = exports["fish"];
        profileFile = path.join(home, ".config", "fish", "config.fish");
      } else {
        block = exports["powershell"];
        const psProfile = process.env.POSH_THEME
          ? path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
          : path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
        profileFile = psProfile;
      }

      const marker = "# ObservaAI CLI detection";
      let existing = "";
      try { existing = fs.readFileSync(profileFile, "utf8"); } catch { /* new file */ }

      if (existing.includes(marker)) {
        vscode.window.showInformationMessage(
          `ObservaAI: CLI detection block already present in ${profileFile} — no changes made.`,
        );
        return;
      }

      fs.mkdirSync(path.dirname(profileFile), { recursive: true });
      fs.appendFileSync(profileFile, `\n${block}\n`);
      vscode.window.showInformationMessage(
        `ObservaAI: Export block appended to ${profileFile}. Restart your terminal to activate.`,
      );
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
