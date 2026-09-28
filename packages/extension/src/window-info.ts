import type { EditorWindow } from "@shared";
import * as vscode from "vscode";
import { windowIdFromLogPath } from "./window-id";

/**
 * Snapshot of the window this extension host belongs to.
 *
 * Read at send time (and when focus changes) rather than cached at activation: focus
 * moves between windows, and the id has to be the one Playwright will target.
 */
export function readEditorWindow(logUri: vscode.Uri | undefined): EditorWindow {
  const id = windowIdFromLogPath(logUri?.fsPath ?? "");
  const window: EditorWindow = {
    sessionId: vscode.env.sessionId,
    appName: vscode.env.appName,
    uriScheme: vscode.env.uriScheme,
    focused: vscode.window.state.focused,
  };
  if (id !== undefined) window.id = id;
  return window;
}
