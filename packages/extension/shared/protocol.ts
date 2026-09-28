/**
 * 侧栏 webview 与扩展宿主之间的线协议。
 *
 * 只描述「聊天 + Agent」：Agent 探测、模型、会话模式、权限、会话与附件。
 * 浏览器那套（页面工具、标签接管、截图、划词）在 VS Code 里没有对应物。
 */

export type AttachmentKind = "image" | "file" | "folder";

export type AttachmentItem = {
  path: string;
  name: string;
  kind: AttachmentKind;
  missing?: boolean;
  /** 编辑器选区芯片：`path` 带行号保持唯一，`filePath` 才是真实文件。 */
  editorSelection?: boolean;
  pinned?: boolean;
  filePath?: string;
  relativePath?: string;
  languageId?: string;
  startLine?: number;
  endLine?: number;
  snippet?: string;
};

/** 编辑器里打开的一个文件，`@` 菜单用它替代原先的浏览器标签页。 */
export type EditorTab = {
  path: string;
  relativePath: string;
  name: string;
  languageId?: string;
  active?: boolean;
  dirty?: boolean;
};

/**
 * The file the user is looking at right now.
 *
 * This is ambient context — it answers "what does *this function* mean?" — and it is
 * pushed on every focus change, so it deliberately carries **no file contents**. The
 * agent already has the workspace and a read tool; shipping a window of source on every
 * cursor move would cost bytes continuously and go stale between the push and the
 * prompt. What travels is the pointer: where the user is, not what is there.
 */
export type ActiveFile = {
  path: string;
  relativePath: string;
  languageId: string;
  dirty: boolean;
  /** 1-based caret position. */
  line: number;
  column: number;
  /** Only set when a non-empty selection is highlighted. 1-based and inclusive. */
  selection?: { startLine: number; endLine: number };
  lineCount: number;
};

/**
 * The VS Code window this chat is happening in.
 *
 * Several windows can be open at once, and editor features (Playwright, the integrated
 * browser, opening a tab) follow whichever window they are pointed at. `id` is the
 * numeric `vscodeWindowId` those features use. It is omitted when the window's log
 * path does not carry one (some web hosts). `sessionId` changes when this window
 * reloads, so it identifies this load of the window rather than the process.
 */
export type EditorWindow = {
  /** Numeric VS Code window id. Absent when it cannot be read. */
  id?: number;
  /** `vscode.env.sessionId` for this window. */
  sessionId: string;
  /** `vscode.env.appName`, e.g. "Cursor" or "Visual Studio Code". */
  appName: string;
  /** `vscode.env.uriScheme`, e.g. "cursor" or "vscode". */
  uriScheme: string;
  /** Whether this window currently has focus. */
  focused: boolean;
};

/** 一条正在跑（或跑完）的命令，卡片和终端共用这一份状态。 */
export type TerminalState = {
  terminalId: string;
  command: string;
  cwd?: string;
  output: string;
  truncated: boolean;
  running: boolean;
  exitCode?: number;
  signal?: string;
};

/** Agent 报上来的上下文用量（ACP `usage_update`）。不报就没有这个控件。 */
export type ContextUsage = {
  /** 当前上下文里的 token 数。 */
  used: number;
  /** 上下文窗口总量。 */
  size: number;
  /** 本次会话累计花费，引擎给了才有。 */
  cost?: { amount: number; currency?: string };
};

/** 一轮里被写入的一个工作区文件。 */
export type ChangedFile = {
  path: string;
  relativePath: string;
  change: "created" | "modified" | "deleted";
  /** Line additions for this turn's edit. Omitted when the diff cannot be measured. */
  additions?: number;
  /** Line deletions for this turn's edit. Omitted when the diff cannot be measured. */
  deletions?: number;
  /**
   * Snapshot of the file before this edit (`null` = created / empty left side).
   * Used to open a per-change diff; omitted when the tool call carried no before text.
   */
  oldText?: string | null;
  /**
   * Snapshot of the file after this edit (`null` = deleted / empty right side).
   * Used to open a per-change diff; omitted when the tool call carried no after text.
   */
  newText?: string | null;
};

export type AgentModel = {
  id: string;
  name: string;
};

export type AgentPolicy = "ask" | "workspace" | "auto" | "unattended";

/**
 * Where a session's mode comes from: a config option (the spec-preferred shape) or the
 * legacy `modes` list. The panel renders both the same way; only the set path differs.
 */
export type AgentModeSource = "config" | "modes";

/**
 * Semantic class of a mode. Used **only** to pick an icon — never to decide behavior, so
 * a misclassification costs nothing but a wrong glyph.
 */
export type AgentModeKind =
  | "plan"
  | "build"
  | "ask"
  | "agent"
  | "edits"
  | "auto"
  | "full_access"
  | "unknown";

export type AgentModeOption = {
  id: string;
  name: string;
  desc?: string;
  kind: AgentModeKind;
};

export type AgentOptionValue = {
  id: string;
  name: string;
  desc?: string;
};

/**
 * A session config option the agent advertises beyond `mode` / `model` — spec categories
 * `thought_level` (the engine's own reasoning effort) and `model_config` (per-model
 * switches such as Claude's `Fast mode` or Cursor's `Fast`). The host pushes the whole
 * list verbatim; the panel renders only the categories it knows.
 */
export type AgentOption = {
  id: string;
  category?: string;
  name: string;
  type?: string;
  current?: string;
  values?: AgentOptionValue[];
};

export type AgentMark =
  | "cursor"
  | "opencode"
  | "claude"
  | "copilot"
  | "codebuddy"
  | "gemini"
  | "qwen"
  | "kimi"
  | "iflow"
  | "trae"
  | "qoder"
  | "generic"
  | "agents"
  | "codex"
  | "stepclaw"
  | "cursor_builtin";

export type AgentCaps = {
  models: boolean;
  questions: boolean;
  plans: boolean;
  todos: boolean;
};

export type AgentInfo = {
  id: string;
  name: string;
  mark: AgentMark;
  command?: string;
  installed: boolean;
  hint?: string;
  caps: AgentCaps;
};

export type AgentProgress = {
  phase: string;
  index: number;
  total: number;
  label: string;
};

/**
 * A skill installed globally on this machine. `name` is the identifier the CLI knows;
 * `alias` is the skill's own display name, which is what the probe menu lists.
 */
export type SkillItem = {
  name: string;
  alias: string;
  source: SkillSource;
  /** Absolute path of the skill's SKILL.md. */
  path: string;
  description: string;
};

/** Which global directory a skill came from: the small tag next to its name in the menu. */
export type SkillSource =
  | "claude"
  | "cursor"
  | "agents"
  | "codex"
  | "stepclaw"
  | "cursor_builtin";

/** 一段编辑器选区，随 prompt 一起发给宿主。 */
export type CodeAttachment = {
  path: string;
  relativePath: string;
  languageId: string;
  startLine: number;
  endLine: number;
  text: string;
};

export type ExtToHost =
  | { type: "hello" }
  /**
   * `cwd` is where an ACP session runs and follows the active editor in a multi-root
   * workspace. `key` is the window's stable identity and is what persisted state is
   * filed under, so history does not move when the user switches roots.
   */
  | { type: "workspace.set"; cwd: string; key?: string; name?: string }
  /**
   * Which VS Code window this sidebar belongs to. Sent at startup and again when the
   * window gains or loses focus, so a newly spawned agent process inherits the id.
   */
  | { type: "window.set"; window: EditorWindow }
  | { type: "agents.detect" }
  | { type: "skills.refresh" }
  | {
      type: "agent.connect";
      providerId: string;
      policy?: AgentPolicy;
      modeId?: string;
      /** The panel's remembered config-option values for this agent (configId → value). */
      optionValues?: Record<string, string>;
    }
  | { type: "agent.cancelConnect" }
  | { type: "agent.setPolicy"; policy: AgentPolicy }
  | { type: "agent.setMode"; modeId: string; sessionId?: string }
  | { type: "agent.setOption"; configId: string; value: string; sessionId?: string }
  | {
      type: "prompt";
      text: string;
      sessionId?: string;
      requestId?: string;
      /**
       * Leading `/skill-name` list the panel asks for. The host prepends it in front of
       * everything else: a slash invocation only counts when it is the very first thing
       * the CLI reads.
       */
      skillPrefix?: string;
      /** Editor selections shown as chips on the user's message. */
      attachments?: CodeAttachment[];
      /**
       * The file the user was looking at when they hit send. The host turns it into a
       * one-line `[Current file]` block, and drops it when `attachments` already pin
       * that exact range.
       */
      currentFile?: ActiveFile;
      /**
       * The VS Code window this chat is in, read at send time. The host turns it into a
       * `[Current window]` block so editor features are aimed at this window.
       */
      currentWindow?: EditorWindow;
      /** 「立即发送」：该会话正在跑就先取消它，等它收尾再开始这一轮。 */
      interrupt?: boolean;
    }
  | { type: "cancel"; sessionId?: string }
  | { type: "session.new"; requestId?: string }
  | { type: "session.use"; sessionId: string; requestId?: string }
  | { type: "session.fork"; sessionId: string; requestId?: string }
  | { type: "fs.pick"; requestId: string; mode?: FsPickMode }
  /** Attach existing workspace paths (explorer / editor URI drops) without copying bytes. */
  | { type: "fs.attachPaths"; requestId: string; paths: string[] }
  | { type: "fs.upload"; requestId: string; name: string; dir?: string; base64: string }
  | { type: "fs.save"; requestId: string; name?: string; imageBase64: string; mime: "image/jpeg" }
  | { type: "fs.preview"; requestId: string; path: string }
  | { type: "model.set"; modelId: string; sessionId?: string }
  | {
      type: "permission.reply";
      id: number;
      outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" };
    }
  | { type: "cursor.reply"; id: number; result: unknown }
  | { type: "ui.state.set"; state: Record<string, unknown> }
  | { type: "ui.state.set"; index: number; total: number; data: string };

export type HostStatusState = "starting" | "idle" | "connecting" | "ready" | "error" | "missing";

export type FsPickMode = "mixed" | "files" | "folders";

export type HostToExt =
  | { type: "hello"; workspace: string; agentPath: string; providerId?: string; version?: string }
  | { type: "ui.state"; state: Record<string, unknown> | null }
  | { type: "ui.state"; index: number; total: number; data: string }
  | { type: "status"; state: HostStatusState; error?: string }
  | { type: "agents"; agents: AgentInfo[]; selectedId?: string }
  | { type: "agent.progress"; progress: AgentProgress }
  | { type: "session"; sessionId: string; replay?: boolean; created?: boolean; forked?: boolean; requestId?: string }
  | { type: "update"; update: Record<string, unknown>; sessionId?: string }
  | { type: "permission"; id: number; params: Record<string, unknown>; sessionId?: string }
  | { type: "cursor"; id?: number; method: string; params: Record<string, unknown>; sessionId?: string }
  | { type: "turn.end"; stopReason: string; sessionId?: string; error?: string; interrupted?: boolean }
  | { type: "models"; models: AgentModel[]; currentId: string }
  | {
      type: "agentModes";
      source: AgentModeSource;
      configId?: string;
      currentId: string;
      options: AgentModeOption[];
      pinned?: string;
      /** False when there is nothing to switch (fewer than two modes advertised). */
      available: boolean;
    }
  | { type: "agentOptions"; options: AgentOption[] }
  | { type: "skills"; items: SkillItem[] }
  | { type: "fs.picked"; requestId: string; items: AttachmentItem[]; cancelled?: boolean; error?: string }
  | { type: "fs.saved"; requestId: string; items: AttachmentItem[]; error?: string }
  | { type: "fs.uploaded"; requestId: string; items: AttachmentItem[]; error?: string }
  | {
      type: "fs.previewed";
      requestId: string;
      mime?: string;
      size?: number;
      index?: number;
      total?: number;
      data?: string;
      error?: string;
    }
  // An older host replying to a command it does not implement.
  | { type: "host.unsupported"; requestId: string; command?: string; error?: string };
