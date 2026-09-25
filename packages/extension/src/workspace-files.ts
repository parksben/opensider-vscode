import * as vscode from "vscode";

export type FileTarget = {
  uri: vscode.Uri;
  startLine?: number;
  endLine?: number;
};

/** `path:12`, `path:12:5`, `path#L12`, `path#L12-L20` — the shapes agents actually emit. */
function splitLineSuffix(raw: string): { body: string; startLine?: number; endLine?: number } {
  const hash = /^(.*)#L(\d+)(?:-L?(\d+))?$/.exec(raw);
  if (hash) {
    return { body: hash[1], startLine: Number(hash[2]), endLine: hash[3] ? Number(hash[3]) : undefined };
  }
  const colon = /^(.*?):(\d+)(?::\d+)?$/.exec(raw);
  if (colon) return { body: colon[1], startLine: Number(colon[2]) };
  return { body: raw };
}

function insideWorkspace(uri: vscode.Uri): boolean {
  return vscode.workspace.getWorkspaceFolder(uri) != null;
}

/** How a window identifies itself when storing state. Empty `key` means no folder open. */
export type WorkspaceIdentity = { key: string; name: string };

/**
 * The stable identity of this window's workspace.
 *
 * Deliberately not `workspaceCwd()`: that one follows the active editor so an ACP
 * session runs in the right root of a multi-root workspace, which means it changes as
 * the user switches tabs. Chat history keyed on it would switch with them.
 */
export function workspaceIdentity(): WorkspaceIdentity {
  const file = vscode.workspace.workspaceFile;
  if (file) {
    // A saved `.code-workspace` has a real path; an unsaved multi-root workspace has an
    // `untitled:` URI, which is still stable for as long as that workspace exists.
    return { key: file.scheme === "file" ? file.fsPath : file.toString(), name: vscode.workspace.name ?? "" };
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) return { key: folder.uri.fsPath, name: folder.name };
  return { key: "", name: "" };
}

/**
 * Resolves a link or tool argument to a file in the open workspace.
 *
 * Returns undefined for anything that is not a workspace file — an http(s) URL, a path
 * outside every workspace folder, or a bare word. Callers treat that as "not ours".
 */
export function resolveWorkspaceFile(raw: string): FileTarget | undefined {
  const trimmed = raw.trim().replace(/^<|>$/g, "");
  if (!trimmed) return undefined;
  if (/^(https?|mailto|vscode):/i.test(trimmed)) return undefined;

  const { body, startLine, endLine } = splitLineSuffix(trimmed);
  if (!body) return undefined;

  const candidates: vscode.Uri[] = [];
  if (body.startsWith("file://")) {
    try {
      candidates.push(vscode.Uri.parse(body));
    } catch {
      return undefined;
    }
  } else if (body.startsWith("/") || /^[A-Za-z]:[\\/]/.test(body)) {
    candidates.push(vscode.Uri.file(body));
  } else {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(body)) return undefined;
    const relative = body.replace(/^\.\//, "");
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      candidates.push(vscode.Uri.joinPath(folder.uri, relative));
    }
  }

  for (const uri of candidates) {
    if (insideWorkspace(uri)) return { uri, startLine, endLine };
  }
  return undefined;
}

export async function openWorkspaceFile(target: FileTarget): Promise<boolean> {
  try {
    const document = await vscode.workspace.openTextDocument(target.uri);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    if (target.startLine == null) return true;
    const start = new vscode.Position(Math.max(0, target.startLine - 1), 0);
    const lastLine = Math.min(document.lineCount - 1, Math.max(0, (target.endLine ?? target.startLine) - 1));
    const end = new vscode.Position(lastLine, document.lineAt(lastLine).text.length);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
    return true;
  } catch {
    return false;
  }
}

/** Text editors currently open in tabs, most recently active first. */
export function openEditorTabs(): Array<{
  path: string;
  relativePath: string;
  name: string;
  languageId?: string;
  active?: boolean;
  dirty?: boolean;
}> {
  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  const seen = new Set<string>();
  const tabs: Array<{
    path: string;
    relativePath: string;
    name: string;
    languageId?: string;
    active?: boolean;
    dirty?: boolean;
  }> = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input as { uri?: vscode.Uri } | undefined;
      const uri = input?.uri;
      if (!uri || uri.scheme !== "file" || seen.has(uri.fsPath)) continue;
      seen.add(uri.fsPath);
      tabs.push({
        path: uri.fsPath,
        relativePath: vscode.workspace.asRelativePath(uri, false),
        name: uri.path.split("/").pop() ?? uri.fsPath,
        active: uri.fsPath === activePath,
        dirty: tab.isDirty,
      });
    }
  }
  tabs.sort((a, b) => Number(b.active ?? false) - Number(a.active ?? false));
  return tabs;
}
