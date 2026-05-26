import * as vscode from "vscode";
import { MetricsPanelProvider } from "../providers/MetricsPanelProvider";
import { StatusBarController } from "./StatusBarController";
import { SessionManager } from "./SessionManager";

let statusBar: StatusBarController | undefined;

export function activate(context: vscode.ExtensionContext) {
  const session = new SessionManager();
  statusBar = new StatusBarController(context, session);
  const panelProvider = new MetricsPanelProvider(context.extensionUri, session);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("observaai.metrics", panelProvider),

    vscode.commands.registerCommand("observaai.openDashboard", () => {
      const gatewayUrl = vscode.workspace
        .getConfiguration("observaai")
        .get<string>("gatewayUrl", "http://localhost:8000");
      vscode.env.openExternal(vscode.Uri.parse(gatewayUrl.replace(":8000", ":3000")));
    }),

    vscode.commands.registerCommand("observaai.resetSession", () => {
      session.reset();
      vscode.window.showInformationMessage("ObservaAI: Session reset.");
    }),
  );

  session.start();
  vscode.window.showInformationMessage("ObservaAI activated — monitoring AI usage.");
}

export function deactivate() {
  statusBar?.dispose();
}
