import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
const DEDUP_KEY = "observaai.cliIngestedLines";

export class ClaudeLogWatcher {
  private watcher: vscode.FileSystemWatcher | undefined;
  private offsets = new Map<string, number>();
  private ingested: Set<string>;
  private _count = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getGatewayUrl: () => string,
  ) {
    const stored = context.globalState.get<string[]>(DEDUP_KEY, []);
    this.ingested = new Set(stored);
    this._count = this.ingested.size;
  }

  start(): void {
    if (!fs.existsSync(CLAUDE_DIR)) return;

    const pattern = new vscode.RelativePattern(CLAUDE_DIR, "**/*.jsonl");
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange((uri) => this._processFile(uri.fsPath));
    this.watcher.onDidCreate((uri) => this._processFile(uri.fsPath));
    this.context.subscriptions.push(this.watcher);
  }

  dispose(): void {
    this.watcher?.dispose();
  }

  get count(): number {
    return this._count;
  }

  private async _processFile(filePath: string): Promise<void> {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      return;
    }

    const allLines = content.split("\n");
    const offset = this.offsets.get(filePath) ?? 0;
    const lines = allLines.slice(offset);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const lineKey = `${filePath}:${offset + i}`;
      if (this.ingested.has(lineKey)) continue;

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const usage = entry.usage as Record<string, number> | undefined;
      if (!usage || typeof usage.input_tokens !== "number") continue;

      const model =
        (entry.model as string | undefined) ?? "claude-3-5-sonnet-20241022";
      const ts =
        (entry.timestamp as string | undefined) ?? new Date().toISOString();

      await this._post({
        provider: "anthropic",
        model,
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        timestamp: ts,
      });

      this.ingested.add(lineKey);
      this._count++;
    }

    this.offsets.set(filePath, offset + lines.length);

    // Cap persisted dedup set at 5000 entries
    const arr = [...this.ingested].slice(-5000);
    await this.context.globalState.update(DEDUP_KEY, arr);
  }

  private async _post(payload: {
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    timestamp: string;
  }): Promise<void> {
    try {
      await fetch(`${this.getGatewayUrl()}/analytics/ingest-cli`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Gateway offline — skip silently
    }
  }
}
