import * as vscode from "vscode";

export const OUTPUT_SCHEME = "opensider-output";

/**
 * A read-only tab showing one command's output, refreshed as it grows.
 *
 * Agents that do not use ACP terminals (Claude Code, Cursor) run commands in their own
 * process, so there is no VS Code terminal to reveal. The card's button opens one of these
 * instead: a virtual document, never written to disk, that updates in place while the
 * command runs.
 */
export class OutputDocuments implements vscode.TextDocumentContentProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  private readonly contents = new Map<string, string>();

  readonly onDidChange = this.changed.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.path) ?? "";
  }

  private static uriFor(id: string, command: string): vscode.Uri {
    const name = (command.trim().split(/\s+/)[0] || "command").replace(/[^\w.-]/g, "_").slice(0, 40);
    return vscode.Uri.parse(`${OUTPUT_SCHEME}:/${id}/${name}.log`);
  }

  /** Replaces the buffer for one command and refreshes the tab if it is open. */
  update(id: string, command: string, output: string): void {
    const uri = OutputDocuments.uriFor(id, command);
    const header = `$ ${command}\n${"-".repeat(Math.min(60, command.length + 2))}\n`;
    this.contents.set(uri.path, header + output);
    this.changed.fire(uri);
  }

  async open(id: string, command: string, output: string): Promise<void> {
    this.update(id, command, output);
    const uri = OutputDocuments.uriFor(id, command);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
  }

  dispose(): void {
    this.changed.dispose();
    this.contents.clear();
  }
}
