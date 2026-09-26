import * as path from "node:path";
import * as vscode from "vscode";

export const DIFF_SCHEME = "opensider-diff";

export type ChangeDiffTarget = {
  path: string;
  change: "created" | "modified" | "deleted";
  oldText?: string | null;
  newText?: string | null;
};

/**
 * Read-only virtual documents used as the left / right sides of a per-change
 * `vscode.diff`. Snapshots come from the ACP tool call (or edit args), not git.
 */
export class DiffDocuments implements vscode.TextDocumentContentProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  private readonly contents = new Map<string, string>();
  private seq = 0;

  readonly onDidChange = this.changed.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  private put(side: "before" | "after", filePath: string, text: string): vscode.Uri {
    this.seq += 1;
    const name = path.basename(filePath) || "file";
    const uri = vscode.Uri.from({
      scheme: DIFF_SCHEME,
      path: `/${side}/${this.seq}/${name}`,
      query: filePath,
    });
    this.contents.set(uri.toString(), text);
    this.changed.fire(uri);
    return uri;
  }

  /**
   * Opens a diff for one files-changed row.
   *
   * Left = before this edit, right = after. Created files get an empty left;
   * deleted files get an empty right. When a side has no snapshot, the live
   * workspace file is used for "after" (or an empty doc when the file is gone).
   */
  async open(target: ChangeDiffTarget): Promise<void> {
    const name = path.basename(target.path) || target.path;
    const title = `${name} (OpenSider)`;

    const beforeText =
      target.oldText !== undefined && target.oldText !== null
        ? target.oldText
        : target.change === "created"
          ? ""
          : undefined;
    const afterText =
      target.newText !== undefined && target.newText !== null
        ? target.newText
        : target.change === "deleted"
          ? ""
          : undefined;

    const leftUri =
      beforeText !== undefined
        ? this.put("before", target.path, beforeText)
        : this.put("before", target.path, "");

    let rightUri: vscode.Uri;
    if (afterText !== undefined) {
      rightUri = this.put("after", target.path, afterText);
    } else {
      const fileUri = vscode.Uri.file(target.path);
      try {
        await vscode.workspace.fs.stat(fileUri);
        rightUri = fileUri;
      } catch {
        rightUri = this.put("after", target.path, "");
      }
    }

    await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title);
  }

  dispose(): void {
    this.changed.dispose();
    this.contents.clear();
  }
}
