import type { ActiveFile } from "@shared";
import * as vscode from "vscode";

/**
 * Snapshots the editor the user is focused on, or undefined when that is not a file
 * they could talk about — the output panel, a diff of a git blob, the settings UI.
 *
 * Only metadata is read. See the note on `ActiveFile` for why no source text goes out.
 */
export function readActiveFile(editor = vscode.window.activeTextEditor): ActiveFile | undefined {
  if (!editor || editor.document.uri.scheme !== "file") return undefined;
  const document = editor.document;
  const caret = editor.selection.active;

  const file: ActiveFile = {
    path: document.uri.fsPath,
    relativePath: vscode.workspace.asRelativePath(document.uri, false),
    languageId: document.languageId,
    dirty: document.isDirty,
    line: caret.line + 1,
    column: caret.character + 1,
    lineCount: document.lineCount,
  };

  if (!editor.selection.isEmpty) {
    const startLine = editor.selection.start.line + 1;
    let endLine = editor.selection.end.line + 1;
    // A selection dragged to the start of the next line visually covers the line above.
    if (editor.selection.end.character === 0 && endLine > startLine) endLine -= 1;
    file.selection = { startLine, endLine };
  }
  return file;
}
