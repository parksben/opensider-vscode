import * as vscode from "vscode";

export type CodeAttachment = {
  id: string;
  path: string;
  relativePath: string;
  languageId: string;
  startLine: number;
  endLine: number;
  text: string;
  pinned?: boolean;
};

export function selectionKey(attachment: Pick<CodeAttachment, "path" | "startLine" | "endLine">): string {
  return `${attachment.path}:${attachment.startLine}-${attachment.endLine}`;
}

export function readSelection(editor = vscode.window.activeTextEditor): CodeAttachment | undefined {
  if (!editor || editor.selection.isEmpty || editor.document.uri.scheme !== "file") return undefined;
  const selection = editor.selection;
  const text = editor.document.getText(selection);
  if (!text.trim()) return undefined;
  const startLine = selection.start.line + 1;
  let endLine = selection.end.line + 1;
  if (selection.end.character === 0 && endLine > startLine) endLine -= 1;
  const attachment: CodeAttachment = {
    id: "",
    path: editor.document.uri.fsPath,
    relativePath: vscode.workspace.asRelativePath(editor.document.uri, false),
    languageId: editor.document.languageId,
    startLine,
    endLine,
    text,
  };
  attachment.id = selectionKey(attachment);
  return attachment;
}

export function workspaceCwd(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.uri.scheme === "file") {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder) return folder.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
