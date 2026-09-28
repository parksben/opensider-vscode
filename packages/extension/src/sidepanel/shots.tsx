/**
 * Renders the real side panel inside a slim editor frame so README screenshots
 * match the product. Not part of the extension build (vite packages index.html only).
 *
 *   cd packages/extension && npx vite --config vite.webview.config.ts --port 5199
 *   # then open /shots.html?scene=setup|agents|chat|composer|queue|continue&lang=en|zh
 */
import "./chrome-shim";
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { AgentInfo, AgentModel, ChangedFile, SkillItem, TerminalState } from "@shared";
import logoUrl from "../../assets/icon.svg?url";
import { PIN_EVENT } from "./bridge";
import { AgentSetup } from "./components/AgentSetup";
import { ChatPane } from "./components/ChatPane";
import { ContinueDialog } from "./components/ContinueDialog";
import { Header } from "./components/Header";
import type { ChatMessage } from "./chat-types";
import type { QueuedMessage } from "./queued-message";
import { buildHandoffPrompt } from "./handoff";
import { applyLocale, t, type Locale } from "./i18n";
import { applyResolvedTheme } from "./theme";
import "./styles.css";

const params = new URLSearchParams(location.search);
const locale: Locale = params.get("lang") === "zh" ? "zh" : "en";
applyLocale(locale);
applyResolvedTheme("dark");

const caps = { models: true, questions: true, plans: true, todos: true };

function agent(id: string, name: string, mark: AgentInfo["mark"]): AgentInfo {
  return { id, name, mark, installed: true, caps };
}

const FOUND: AgentInfo[] = [
  agent("cursor", "Cursor", "cursor"),
  agent("claude", "Claude Code", "claude"),
  agent("codex", "Codex", "codex"),
  agent("opencode", "OpenCode", "opencode"),
  agent("copilot", "GitHub Copilot", "copilot"),
];

const MODELS: AgentModel[] = [
  { id: "auto", name: "Auto" },
  { id: "gpt-5.4", name: "GPT-5.4" },
  { id: "claude-opus", name: "Claude Opus" },
];

const SKILLS: SkillItem[] = [
  {
    name: "canvas",
    alias: "canvas",
    source: "cursor_builtin",
    path: "~/.cursor/skills-cursor/canvas/SKILL.md",
    description: "Design with canvas: layout, colour and typography passes.",
  },
  {
    name: "coding-plan",
    alias: "coding-plan",
    source: "claude",
    path: "~/.claude/skills/coding-plan/SKILL.md",
    description: "Docs first, then code. The workflow to use for every feature.",
  },
  {
    name: "openclawmp",
    alias: "水产市场",
    source: "claude",
    path: "~/.claude/skills/openclawmp/SKILL.md",
    description: "Browse the market and read every entry before installing it.",
  },
  {
    name: "pptx",
    alias: "pptx",
    source: "stepclaw",
    path: "~/.stepclaw/skills/pptx/SKILL.md",
    description: "Build slides from an outline.",
  },
];

const QUEUE: QueuedMessage[] = [
  { id: "q1", text: "then add a test for the empty case", attachments: [] },
  { id: "q2", text: "run the suite and fix what fails", attachments: [] },
];


const FILES: ChangedFile[] = [
  {
    path: "/work/opensider-vscode/src/sidepanel/components/FilesChanged.tsx",
    relativePath: "src/sidepanel/components/FilesChanged.tsx",
    change: "modified",
    additions: 28,
    deletions: 4,
  },
  {
    path: "/work/opensider-vscode/src/sidepanel/changed-files.ts",
    relativePath: "src/sidepanel/changed-files.ts",
    change: "created",
    additions: 16,
    deletions: 0,
  },
];

const TERMINALS: Record<string, TerminalState> = {
  "term-1": {
    terminalId: "term-1",
    command: "npm test",
    output: "files-changed\n  ok  lists the files this turn wrote\n\n# tests 12\n# pass 12\n# fail 0",
    truncated: false,
    running: false,
    exitCode: 0,
  },
};

const COPY = {
  en: {
    user: "List the files this turn changed above the composer, and open a diff when I click one.",
    answer: "Done. Files written this turn are collected in one list. Click a name to open the before/after diff.",
    title: "Files changed",
  },
  zh: {
    user: "把这一轮改过的文件汇总在输入框上面，点开能看 diff。",
    answer: "已经加上。这一轮写过的文件会收成一张列表，点文件名就打开这次写入前后的 diff。",
    title: "文件变更汇总",
  },
} as const;

function messagesFor(lang: Locale): ChatMessage[] {
  const copy = COPY[lang];
  return [
    {
      id: "u1",
      role: "user",
      createdAt: new Date("2026-09-27T04:00:00Z"),
      content: [{ type: "text", text: copy.user }],
    },
    {
      id: "a1",
      role: "assistant",
      createdAt: new Date("2026-09-27T04:00:08Z"),
      modelName: "GPT-5.4",
      durationMs: 8000,
      content: [
        {
          type: "tool-call",
          toolCallId: "read-1",
          toolName: "read",
          kind: "read",
          status: "completed",
          args: { path: "src/sidepanel/components/FilesChanged.tsx" },
          primaryArg: "src/sidepanel/components/FilesChanged.tsx",
        },
        {
          type: "tool-call",
          toolCallId: "term-1",
          toolName: "shell",
          kind: "execute",
          status: "completed",
          terminalId: "term-1",
          args: { command: "npm test" },
          primaryArg: "npm test",
        },
        { type: "text", text: copy.answer },
      ],
    },
  ];
}

const noop = () => undefined;
const noopAsync = async () => [];

function markReady() {
  document.documentElement.dataset.shotReady = "1";
}

function Editor({ selected }: { selected: boolean }) {
  const lines = [
    "export function FilesChanged({ locale, files, onOpen }) {",
    "  const [open, setOpen] = useState(true);",
    "  if (files.length === 0) return null;",
    "",
    "  const title = t(locale, \"filesChanged\")",
    "    .replace(\"{count}\", String(files.length));",
    "",
    "  return (",
    "    <section className=\"cs-files\">",
    "      <button onClick={() => setOpen((v) => !v)}>",
    "        {title}",
    "      </button>",
    "      {open ? (",
    "        <ul>",
    "          {files.map((file) => (",
    "            <li key={file.relativePath}>",
    "              <button onClick={() => onOpen(file)}>",
    "                {file.relativePath}",
    "              </button>",
    "            </li>",
    "          ))}",
    "        </ul>",
    "      ) : null}",
    "    </section>",
    "  );",
    "}",
  ];
  return (
    <div className="shot-editor">
      <div className="shot-tabs">
        <span className="shot-tab is-active">FilesChanged.tsx</span>
        <span className="shot-tab">changed-files.ts</span>
      </div>
      <div className="shot-code">
        {lines.map((line, index) => {
          const n = index + 32;
          const on = selected && n >= 38 && n <= 46;
          return (
            <div key={n} className={on ? "shot-line is-selected" : "shot-line"}>
              <span className="shot-gutter">{n}</span>
              <span>{line || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Frame({ selected, children }: { selected: boolean; children: ReactNode }) {
  return (
    <div className="shot-window">
      <aside className="shot-activity" aria-hidden="true">
        <img className="shot-mark" src={logoUrl} alt="" />
      </aside>
      <Editor selected={selected} />
      <div className="shot-panel">{children}</div>
      <style>{SHOT_CSS}</style>
    </div>
  );
}

function PanelHeader(props: {
  status: "idle" | "ready";
  agents: AgentInfo[];
  selectedProviderId: string;
  showAgentSelect: boolean;
  sessionTitle: string;
}) {
  return (
    <Header
      locale={locale}
      status={props.status}
      agents={props.agents}
      selectedProviderId={props.selectedProviderId}
      showAgentSelect={props.showAgentSelect}
      sessionTitle={props.sessionTitle}
      sessionsOpen={false}
      onToggleSessions={noop}
      onSelectAgent={noop}
    />
  );
}

function SetupScene({ agents }: { agents: AgentInfo[] }) {
  useEffect(() => {
    markReady();
  }, []);
  return (
    <Frame selected={false}>
      <div className="shot-column">
        <PanelHeader
          status="idle"
          agents={agents}
          selectedProviderId=""
          showAgentSelect={false}
          sessionTitle=""
        />
        <div className="shot-body">
          <AgentSetup
            locale={locale}
            agents={agents}
            selectedId=""
            connecting={false}
            scanning={false}
            onSelect={noop}
            onRetry={noop}
          />
        </div>
      </div>
    </Frame>
  );
}

function ChatScene() {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(PIN_EVENT, {
        detail: {
          path: "/work/opensider-vscode/src/sidepanel/components/FilesChanged.tsx",
          relativePath: "src/sidepanel/components/FilesChanged.tsx",
          languageId: "typescriptreact",
          startLine: 38,
          endLine: 46,
          text: "return (",
        },
      }),
    );
    const timer = window.setTimeout(() => {
      const fold = document.querySelector(".cs-thread button");
      if (fold instanceof HTMLButtonElement) fold.click();
      window.setTimeout(markReady, 60);
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Frame selected>
      <div className="shot-column">
        <PanelHeader
          status="ready"
          agents={FOUND}
          selectedProviderId="codex"
          showAgentSelect
          sessionTitle={COPY[locale].title}
        />
        <div className="shot-body">
          <ChatPane
            locale={locale}
            hostReady
            sessionId="s1"
            messages={messagesFor(locale)}
            isRunning={false}
            models={MODELS}
            modelId="gpt-5.4"
            showModelPicker
            onSend={noop}
            onEnqueue={noop}
            onUpdateQueued={noop}
            onDeleteQueued={noop}
            onSendQueuedNow={noop}
            onEditingQueued={noop}
            onMoveQueued={noop}
            shareActiveFile={false}
            onShareActiveFile={noop}
            onRevise={noop}
            onCancel={noop}
            onFork={noop}
            onRegenerate={noop}
            onPickAttachments={noopAsync}
            onPasteImages={noopAsync}
            onUploadFiles={noopAsync}
            onAttachPaths={noopAsync}
            onPreviewImage={async () => ""}
            onModel={noop}
            agentMode="ask"
            onAgentMode={noop}
            agentModes={[
              { id: "agent", name: "Agent", kind: "agent" },
              { id: "plan", name: "Plan", kind: "plan" },
            ]}
            agentModeId="agent"
            onAgentModeId={noop}
            iconOnly={false}
            narrowModel={false}
            flatActions={false}
            queue={[]}
            changedFiles={FILES}
            contextUsage={{ used: 82400, size: 200000 }}
            terminals={TERMINALS}
          />
        </div>
      </div>
    </Frame>
  );
}

function ChatBody({
  skills,
  queue,
  sessionTitle,
}: {
  skills?: SkillItem[];
  queue?: QueuedMessage[];
  sessionTitle: string;
}) {
  return (
    <div className="shot-column">
      <PanelHeader
        status="ready"
        agents={FOUND}
        selectedProviderId="codex"
        showAgentSelect
        sessionTitle={sessionTitle}
      />
      <div className="shot-body">
        <ChatPane
          locale={locale}
          hostReady
          sessionId="s1"
          messages={messagesFor(locale)}
          isRunning={false}
          models={MODELS}
          modelId="gpt-5.4"
          showModelPicker
          onSend={noop}
          onEnqueue={noop}
          onUpdateQueued={noop}
          onDeleteQueued={noop}
          onSendQueuedNow={noop}
          onEditingQueued={noop}
          onMoveQueued={noop}
          shareActiveFile={false}
          onShareActiveFile={noop}
          onRevise={noop}
          onCancel={noop}
          onFork={noop}
          onRegenerate={noop}
          onPickAttachments={noopAsync}
          onPasteImages={noopAsync}
          onUploadFiles={noopAsync}
          onAttachPaths={noopAsync}
          onPreviewImage={async () => ""}
          onModel={noop}
          agentMode="ask"
          onAgentMode={noop}
          agentModes={[
            { id: "agent", name: "Agent", kind: "agent" },
            { id: "plan", name: "Plan", kind: "plan" },
          ]}
          agentModeId="agent"
          onAgentModeId={noop}
          iconOnly={false}
          narrowModel={false}
          flatActions={false}
          skills={skills}
          onRefreshSkills={noop}
          queue={queue ?? []}
        />
      </div>
    </div>
  );
}

function PanelChat({
  skills,
  queue,
  sessionTitle,
}: {
  skills?: SkillItem[];
  queue?: QueuedMessage[];
  sessionTitle: string;
}) {
  return (
    <Frame selected={false}>
      <ChatBody skills={skills} queue={queue} sessionTitle={sessionTitle} />
    </Frame>
  );
}

function ComposerScene() {
  useEffect(() => {
    markReady();
  }, []);
  return <PanelChat skills={SKILLS} sessionTitle={COPY[locale].title} />;
}

function QueueScene() {
  useEffect(() => {
    markReady();
  }, []);
  return <PanelChat skills={SKILLS} queue={QUEUE} sessionTitle={COPY[locale].title} />;
}

function ContinueScene() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".shot-panel"));
    markReady();
  }, []);
  const prompt = buildHandoffPrompt({
    locale,
    target: "browser",
    statePath: "/Users/you/.opensider-vscode/workspaces/opensider-vscode/ui-state.json",
    sessionId: "session-01",
    beforeRound: 3,
    throughMessageId: "a2",
    workspace: "/work/opensider-vscode",
  });
  return (
    <Frame selected={false}>
      <ChatBody skills={SKILLS} sessionTitle={COPY[locale].title} />
      {container ? (
        <ContinueDialog
          locale={locale}
          title={t(locale, "continueInBrowser")}
          hint={t(locale, "continueReadyBrowser")}
          prompt={prompt}
          onOpenInstall={noop}
          onClose={noop}
          container={container}
        />
      ) : null}
    </Frame>
  );
}

const SHOT_CSS = `
.shot-window {
  display: flex;
  width: 1120px;
  height: 700px;
  overflow: hidden;
  background: #1e1e1e;
  color: #cccccc;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.shot-activity {
  width: 48px;
  flex: none;
  background: #181818;
  border-right: 1px solid #2b2b2b;
  display: flex;
  justify-content: center;
  padding-top: 8px;
}
.shot-mark {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
.shot-editor {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  border-right: 1px solid #2b2b2b;
}
.shot-tabs {
  display: flex;
  height: 35px;
  background: #181818;
  border-bottom: 1px solid #2b2b2b;
}
.shot-tab {
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 13px;
  color: #8b8b8b;
}
.shot-tab.is-active {
  background: #1e1e1e;
  color: #ffffff;
}
.shot-code {
  padding: 8px 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 20px;
}
.shot-line {
  display: flex;
  white-space: pre;
  padding-right: 16px;
}
.shot-line.is-selected {
  background: rgba(212, 160, 84, 0.18);
}
.shot-gutter {
  width: 46px;
  flex: none;
  text-align: right;
  padding-right: 16px;
  color: #6e6e6e;
}
.shot-panel {
  position: relative;
  width: 560px;
  flex: none;
  background: var(--ink);
  --vscode-gitDecoration-addedResourceForeground: #8fbf6a;
  --vscode-gitDecoration-deletedResourceForeground: #e07a5c;
}
.shot-column {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.shot-body {
  min-height: 0;
  flex: 1;
}
`;

const scene = new URLSearchParams(location.search).get("scene");

createRoot(document.getElementById("root")!).render(
  scene === "agents" ? (
    <SetupScene agents={FOUND} />
  ) : scene === "chat" ? (
    <ChatScene />
  ) : scene === "composer" ? (
    <ComposerScene />
  ) : scene === "queue" ? (
    <QueueScene />
  ) : scene === "continue" ? (
    <ContinueScene />
  ) : (
    <SetupScene agents={[]} />
  ),
);
