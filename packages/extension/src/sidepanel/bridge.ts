import type { ActiveFile, EditorTab, ExtToHost, HostToExt, TerminalState } from "@shared";

type Listener = (msg: HostToExt) => void;

type VsCodeApi = {
  postMessage(message: unknown): void;
};

const vscodeApi: VsCodeApi = acquireVsCodeApi();
const listeners = new Set<Listener>();

export function postExtension(message: unknown): void {
  vscodeApi.postMessage(message);
}

(globalThis as { __opensiderPost?: (message: unknown) => void }).__opensiderPost = postExtension;

export type EditorSelection = {
  id: string;
  path: string;
  relativePath: string;
  languageId: string;
  startLine: number;
  endLine: number;
  text: string;
  pinned?: boolean;
};

/** Editor-side pushes the sidebar listens to as DOM events, so no prop drilling is needed. */
export const SELECTION_EVENT = "opensider-selection";
export const PIN_EVENT = "opensider-pin";
export const TABS_EVENT = "opensider-tabs";
export const WORKSPACE_EVENT = "opensider-workspace";
export const TERMINAL_EVENT = "opensider-terminal";
export const ACTIVE_FILE_EVENT = "opensider-active-file";

let latestTabs: EditorTab[] = [];
export function currentEditorTabs(): EditorTab[] {
  return latestTabs;
}

function emit(msg: HostToExt): void {
  for (const listener of listeners) listener(msg);
}

window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as
    | {
        type?: string;
        message?: HostToExt;
        attachment?: EditorSelection | null;
        tabs?: EditorTab[];
        file?: ActiveFile | null;
        state?: TerminalState;
        cwd?: string;
        name?: string;
        statePath?: string;
      }
    | undefined;
  if (!data) return;
  if (data.type === "host" && data.message) {
    emit(data.message);
    return;
  }
  if (data.type === "selection") {
    window.dispatchEvent(new CustomEvent(SELECTION_EVENT, { detail: data.attachment ?? null }));
    return;
  }
  if (data.type === "pin" && data.attachment) {
    window.dispatchEvent(new CustomEvent(PIN_EVENT, { detail: data.attachment }));
    return;
  }
  if (data.type === "tabs") {
    latestTabs = data.tabs ?? [];
    window.dispatchEvent(new CustomEvent(TABS_EVENT, { detail: latestTabs }));
    return;
  }
  if (data.type === "editor.active") {
    window.dispatchEvent(new CustomEvent(ACTIVE_FILE_EVENT, { detail: data.file ?? null }));
    return;
  }
  if (data.type === "terminal.state" && data.state) {
    window.dispatchEvent(new CustomEvent(TERMINAL_EVENT, { detail: data.state }));
    return;
  }
  if (data.type === "workspace") {
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_EVENT, {
        detail: { cwd: data.cwd ?? "", name: data.name ?? "", statePath: data.statePath ?? "" },
      }),
    );
  }
});

/** Opens a path in the editor. Line numbers are optional and 1-based. */
export function openInEditor(path: string, startLine?: number, endLine?: number): void {
  postExtension({ type: "open", path, startLine, endLine });
}

/**
 * Opens a per-turn file change in the VS Code diff editor (before → after for
 * that tool call). Ordinary `openInEditor` / http links are unchanged.
 */
export function openChangeDiff(file: {
  path: string;
  change: "created" | "modified" | "deleted";
  oldText?: string | null;
  newText?: string | null;
}): void {
  postExtension({
    type: "openDiff",
    path: file.path,
    change: file.change,
    oldText: file.oldText,
    newText: file.newText,
  });
}

export function connectSidebar(onMessage: Listener): {
  send: (msg: ExtToHost) => void;
  reconnect: () => void;
  disconnect: () => void;
} {
  listeners.add(onMessage);
  postExtension({ type: "ready" });
  return {
    send: (msg) => postExtension({ type: "host", message: msg }),
    reconnect: () => postExtension({ type: "ready" }),
    disconnect: () => listeners.delete(onMessage),
  };
}
