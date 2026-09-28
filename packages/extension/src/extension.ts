import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import { sameActiveFile, Throttle, type ActiveFile } from "@shared";
import { readActiveFile } from "./active-file";
import { HostProcess, hostBinary, type HostMessage } from "./host";
import { readSelection, selectionKey, workspaceCwd, type CodeAttachment } from "./selection";
import { openEditorTabs, openWorkspaceFile, resolveWorkspaceFile, workspaceIdentity } from "./workspace-files";
import { DiffDocuments, DIFF_SCHEME } from "./diff-doc";
import { OutputDocuments, OUTPUT_SCHEME } from "./output-doc";
import { ensureExplorerDragHitTesting } from "./explorer-drag-style";
import { TerminalRegistry } from "./terminal";
import { browserExtensionInstalled } from "./browser-install";
import { readEditorWindow } from "./window-info";

type WebviewMessage =
  | { type: "ready" }
  | { type: "host"; message: HostMessage }
  | { type: "open"; path: string; startLine?: number; endLine?: number }
  | {
      type: "openDiff";
      path: string;
      change: "created" | "modified" | "deleted";
      oldText?: string | null;
      newText?: string | null;
    }
  | { type: "openExternal"; url: string }
  | { type: "peer.probe"; requestId: string; target?: "browser" }
  | { type: "terminal.show"; terminalId: string }
  | { type: "output.open"; id: string; command: string; output: string }
  | { type: "selection.dismiss"; key: string };

const VIEW_ID = "opensider-vscode.chat";

function homeDir(): string {
  return path.join(homedir(), ".opensider-vscode");
}

function panelHtml(webview: vscode.Webview, extensionPath: string): string {
  const dist = path.join(extensionPath, "dist", "panel");
  let html = readFileSync(path.join(dist, "index.html"), "utf8");
  const nonce = Math.random().toString(36).slice(2);
  // The panel's localStorage cache is shared by every window of this extension, so it
  // has to be scoped to the workspace before the first read. Posting the identity would
  // arrive a frame or two late and the panel would briefly read another project's
  // chats, so it is baked into the document instead.
  const boot = JSON.stringify(workspaceIdentity()).replace(/</g, "\\u003c");
  html = html.replace(/(src|href)="([^"]+)"/g, (full, attr: string, url: string) => {
    if (/^(https?:|data:)/.test(url)) return full;
    const file = path.join(dist, url.replace(/^\.\//, ""));
    return `${attr}="${webview.asWebviewUri(vscode.Uri.file(file))}"`;
  });
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob: https:`,
    `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src ${webview.cspSource} https://fonts.gstatic.com`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  html = html.replace(/<script\b/g, `<script nonce="${nonce}"`);
  return html.replace(
    "</head>",
    `<meta http-equiv="Content-Security-Policy" content="${csp}">\n` +
      `<script nonce="${nonce}">window.__opensiderWorkspace=${boot};</script>\n</head>`,
  );
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private host = new HostProcess({
    onMessage: (message) => this.post({ type: "host", message }),
    onExit: (error) => this.post({ type: "host", message: { type: "status", state: "error", error } }),
  });
  private dismissedKey = "";
  /**
   * Last active-file report actually sent. Cursor movement fires constantly, and most
   * of those events resolve to a report the panel already has.
   */
  private lastActiveFile: ActiveFile | null = null;
  /**
   * 250ms is short enough that the indicator tracks a tab switch without feeling laggy,
   * and long enough that holding an arrow key costs four pushes a second rather than
   * one per repeat.
   */
  private readonly activeFilePush = new Throttle(250, () => this.pushActiveFile());
  private pendingPin: CodeAttachment | undefined;
  private started = false;
  private webReady = false;
  private readonly outputs = new OutputDocuments();
  private readonly diffs = new DiffDocuments();
  private readonly terminals = new TerminalRegistry((state) =>
    this.post({ type: "terminal.state", state }),
  );
  private queue: unknown[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.webReady = false;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")],
    };
    view.webview.html = panelHtml(view.webview, this.context.extensionPath);
    view.webview.onDidReceiveMessage((message: WebviewMessage) => this.onWebview(message));
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
    this.ensureHost();
  }

  focus(): void {
    // 视图挂在辅助侧栏（右侧）。它默认是收起的，所以先展开再聚焦，
    // 否则命令打在一个隐藏容器上，用户点了看不到任何反应。
    void vscode.commands.executeCommand("workbench.action.focusAuxiliaryBar").then(
      () => vscode.commands.executeCommand(`${VIEW_ID}.focus`),
      () => vscode.commands.executeCommand(`${VIEW_ID}.focus`),
    );
  }

  pinSelection(): void {
    const attachment = readSelection();
    if (!attachment) return;
    attachment.pinned = true;
    attachment.id = `${selectionKey(attachment)}:${Date.now()}`;
    if (!this.view) {
      this.pendingPin = attachment;
      this.focus();
      return;
    }
    this.post({ type: "pin", attachment });
    this.focus();
  }

  private ensureHost(): void {
    if (this.started) {
      this.pushWorkspace();
      this.pushWindow();
      this.pushSelection();
      return;
    }
    this.started = true;
    this.host.start(hostBinary(this.context.extensionPath));
    this.pushWorkspace();
    this.pushWindow();
    this.host.send({ type: "hello" });
    this.host.send({ type: "agents.detect" });
  }

  private onWebview(message: WebviewMessage): void {
    if (message.type === "ready") {
      this.webReady = true;
      const queued = this.queue;
      this.queue = [];
      for (const item of queued) void this.view?.webview.postMessage(item);
      this.pushWorkspace();
      this.pushWindow();
      this.pushSelection();
      this.pushTabs();
      this.pushActiveFile();
      if (this.pendingPin) {
        this.post({ type: "pin", attachment: this.pendingPin });
        this.pendingPin = undefined;
      }
      return;
    }
    if (message.type === "host") {
      if (this.handleTerminal(message.message)) return;
      if (this.handleLocal(message.message)) return;
      // The panel cannot see the window id. Stamp it here, at send time, so the
      // prompt names the window that is actually hosting this chat.
      if (message.message.type === "prompt") {
        message.message = { ...message.message, currentWindow: readEditorWindow(this.context.logUri) };
      }
      this.host.send(message.message);
      return;
    }
    if (message.type === "terminal.show") {
      // No VS Code terminal for this command (the agent ran it itself): the card falls
      // back to the read-only document, so say so rather than silently doing nothing.
      if (!this.terminals.show(message.terminalId)) {
        this.post({ type: "terminal.missing", terminalId: message.terminalId });
      }
      return;
    }
    if (message.type === "output.open") {
      void this.outputs.open(message.id, message.command, message.output);
      return;
    }
    if (message.type === "peer.probe") {
      const requestId = message.requestId;
      void Promise.resolve()
        .then(() => browserExtensionInstalled())
        .then(
          (installed) => this.post({ type: "peer.probed", requestId, installed }),
          () => this.post({ type: "peer.probed", requestId, installed: false }),
        );
      return;
    }
    if (message.type === "openExternal") {
      // A link that looks like a workspace file opens in the editor; anything else is external.
      const target = resolveWorkspaceFile(message.url);
      if (target) {
        void openWorkspaceFile(target);
        return;
      }
      void vscode.env.openExternal(vscode.Uri.parse(message.url));
      return;
    }
    if (message.type === "selection.dismiss") {
      this.dismissedKey = message.key;
      return;
    }
    if (message.type === "openDiff") {
      void this.diffs.open({
        path: message.path,
        change: message.change,
        oldText: message.oldText,
        newText: message.newText,
      });
      return;
    }
    if (message.type === "open") {
      const target = resolveWorkspaceFile(message.path);
      void openWorkspaceFile(
        target ?? {
          uri: vscode.Uri.file(message.path),
          startLine: message.startLine,
          endLine: message.endLine,
        },
      );
    }
  }

  /**
   * `terminal/*` forwarded by the Go host. The reply carries the same id back so the host
   * can answer the agent.
   */
  private handleTerminal(message: HostMessage): boolean {
    if (String(message.type ?? "") !== "terminal") return false;
    const id = message.id;
    const method = String(message.method ?? "");
    const params = (message.params as Record<string, unknown>) ?? {};
    void this.terminals
      .handle(method, params)
      .then((result) => this.host.send({ type: "terminal.reply", id, result }))
      .catch((error: unknown) =>
        this.host.send({
          type: "terminal.reply",
          id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  private handleLocal(message: HostMessage): boolean {
    const type = String(message.type ?? "");
    const requestId = typeof message.requestId === "string" ? message.requestId : "";
    if (type === "fs.pick") {
      void this.pickFiles(requestId, typeof message.mode === "string" ? message.mode : "mixed");
      return true;
    }
    if (type === "fs.attachPaths") {
      const paths = Array.isArray(message.paths)
        ? message.paths.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        : [];
      void this.attachPaths(requestId, paths);
      return true;
    }
    if (type === "fs.preview") {
      void this.previewFile(requestId, typeof message.path === "string" ? message.path : "");
      return true;
    }
    if (type === "fs.save" || type === "fs.upload") {
      void this.saveUpload(type, message);
      return true;
    }
    return false;
  }

  private async pickFiles(requestId: string, mode: string): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: mode !== "folders",
      canSelectFolders: mode !== "files",
      canSelectMany: true,
      openLabel: "Attach",
    });
    if (!uris) {
      this.post({ type: "host", message: { type: "fs.picked", requestId, items: [], cancelled: true } });
      return;
    }
    const items = await Promise.all(uris.map(async (uri) => this.attachmentForPath(uri.fsPath)));
    this.post({
      type: "host",
      message: { type: "fs.picked", requestId, items: items.filter((item) => item !== null) },
    });
  }

  /**
   * Explorer / editor URI drops: the webview already has real paths, so just classify them
   * (file / folder / image) and hand chips back. No copy, no focus change.
   */
  private async attachPaths(requestId: string, paths: string[]): Promise<void> {
    const items = await Promise.all(paths.map((file) => this.attachmentForPath(file)));
    this.post({
      type: "host",
      message: { type: "fs.picked", requestId, items: items.filter((item) => item !== null) },
    });
  }

  private async attachmentForPath(
    file: string,
  ): Promise<{ path: string; name: string; kind: "image" | "file" | "folder"; relativePath: string } | null> {
    try {
      const info = await stat(file);
      const name = path.basename(file);
      // Same as editor tabs / active file: absolute when the path is outside the workspace.
      const relativePath = vscode.workspace.asRelativePath(file, false);
      if (info.isDirectory()) return { path: file, name, kind: "folder", relativePath };
      const kind = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name) ? "image" : "file";
      return { path: file, name, kind, relativePath };
    } catch {
      return null;
    }
  }

  private async previewFile(requestId: string, file: string): Promise<void> {
    try {
      const bytes = await readFile(file);
      const lower = file.toLowerCase();
      const mime = lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".gif")
          ? "image/gif"
          : lower.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
      this.post({
        type: "host",
        message: {
          type: "fs.previewed",
          requestId,
          mime,
          size: bytes.length,
          index: 0,
          total: 1,
          data: bytes.toString("base64"),
        },
      });
    } catch (error) {
      this.post({
        type: "host",
        message: { type: "fs.previewed", requestId, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private async saveUpload(type: "fs.save" | "fs.upload", message: HostMessage): Promise<void> {
    const requestId = typeof message.requestId === "string" ? message.requestId : "";
    const reply = type === "fs.save" ? "fs.saved" : "fs.uploaded";
    try {
      const dir = path.join(homeDir(), "uploads");
      await mkdir(dir, { recursive: true });
      const raw = typeof message.name === "string" && message.name ? message.name : `paste-${Date.now()}.png`;
      const file = path.join(dir, `${Date.now()}-${path.basename(raw)}`);
      const payload = typeof message.imageBase64 === "string" ? message.imageBase64 : String(message.base64 ?? "");
      await writeFile(file, Buffer.from(payload, "base64"));
      const name = path.basename(file);
      const kind = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name) ? "image" : "file";
      this.post({ type: "host", message: { type: reply, requestId, items: [{ path: file, name, kind }] } });
    } catch (error) {
      this.post({
        type: "host",
        message: { type: reply, requestId, items: [], error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private pushWindow(): void {
    this.host.send({ type: "window.set", window: readEditorWindow(this.context.logUri) });
  }

  private pushWorkspace(): void {
    const cwd = workspaceCwd();
    const identity = workspaceIdentity();
    // `cwd` is where the agent runs; `key` is what state is filed under. They differ in
    // a multi-root workspace, where cwd follows the active editor.
    if (cwd) this.host.send({ type: "workspace.set", cwd, key: identity.key, name: identity.name });
    const name = identity.name || (cwd ? (cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd) : "");
    this.post({ type: "workspace", cwd: cwd ?? "", name, key: identity.key });
  }

  private pushSelection(): void {
    const attachment = readSelection();
    if (!attachment) {
      this.post({ type: "selection", attachment: null });
      return;
    }
    if (selectionKey(attachment) === this.dismissedKey) return;
    this.dismissedKey = "";
    this.post({ type: "selection", attachment });
  }

  private pushTabs(): void {
    this.post({ type: "tabs", tabs: openEditorTabs() });
  }

  private pushActiveFile(): void {
    const file = readActiveFile() ?? null;
    if (sameActiveFile(file, this.lastActiveFile)) return;
    this.lastActiveFile = file;
    this.post({ type: "editor.active", file });
  }

  noteActiveFile(): void {
    if (!this.view) return;
    this.activeFilePush.schedule();
  }

  noteSelection(): void {
    if (!this.view) return;
    this.pushSelection();
  }

  noteWorkspace(): void {
    if (!this.view) return;
    this.pushWorkspace();
  }

  noteWindow(): void {
    this.pushWindow();
  }

  noteTabs(): void {
    if (!this.view) return;
    this.pushTabs();
  }

  private post(message: unknown): void {
    if (!this.webReady || !this.view) {
      this.queue.push(message);
      return;
    }
    void this.view.webview.postMessage(message);
  }

  dispose(): void {
    this.activeFilePush.dispose();
    this.host.stop();
    this.terminals.dispose();
    this.outputs.dispose();
  }

  outputProvider(): OutputDocuments {
    return this.outputs;
  }

  diffProvider(): DiffDocuments {
    return this.diffs;
  }
}

/**
 * Copies the bundled setup skill to a stable path under the user's home, so the
 * "no agent found" prompt can point a local agent at a real file instead of a URL.
 */
async function installSkill(context: vscode.ExtensionContext): Promise<void> {
  try {
    const target = path.join(homeDir(), "skills", "opensider-vscode");
    await mkdir(target, { recursive: true });
    await copyFile(
      path.join(context.extensionPath, "skills", "opensider-vscode", "SKILL.md"),
      path.join(target, "SKILL.md"),
    );
  } catch {
    // The sidebar still shows the prompt; a missing copy only costs the agent one read.
  }
}

export function activate(context: vscode.ExtensionContext): void {
  ensureExplorerDragHitTesting();
  const provider = new ChatViewProvider(context);
  void installSkill(context);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(OUTPUT_SCHEME, provider.outputProvider()),
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, provider.diffProvider()),
    provider.diffProvider(),
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("opensider-vscode.focus", () => provider.focus()),
    vscode.commands.registerCommand("opensider-vscode.addSelection", () => provider.pinSelection()),
    vscode.window.onDidChangeTextEditorSelection(() => {
      provider.noteSelection();
      provider.noteActiveFile();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      provider.noteSelection();
      provider.noteWorkspace();
      provider.noteTabs();
      provider.noteActiveFile();
    }),
    vscode.window.tabGroups.onDidChangeTabs(() => {
      provider.noteTabs();
      provider.noteActiveFile();
    }),
    // Saving or editing flips the dirty flag, which the indicator shows.
    vscode.workspace.onDidSaveTextDocument(() => provider.noteActiveFile()),
    vscode.workspace.onDidChangeTextDocument(() => provider.noteActiveFile()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.noteWorkspace()),
    vscode.window.onDidChangeWindowState(() => provider.noteWindow()),
    { dispose: () => provider.dispose() },
  );
}

export function deactivate(): void {}
