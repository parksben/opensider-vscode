# OpenSider for VSCode

English | [中文](https://github.com/parksben/opensider-vscode/blob/main/README.zh-CN.md)

OpenSider for VS Code drives an Agent CLI that is already installed and signed in on this machine — Claude Code, Codex, Cursor, OpenCode, GitHub Copilot CLI, and other [ACP](https://agentclientprotocol.com) agents. The extension ships no model of its own. Chat, file edits, and commands stay in the current workspace, and session data stays on disk under `~/.opensider-vscode`.

It is the VS Code edition of the [OpenSider](https://github.com/parksben/opensider) browser extension: the same side panel, the same ACP engine, with the working directory set to the folder you have open. You can use it in place of GitHub Copilot Chat. The difference is that the model and the account come from your own Agent CLI.

The panel follows the VS Code display language. The screenshots below are the English UI.

## The panel

### No agent yet

After install, if a scan finds no ACP CLI, the panel does not open a chat. It stays on a setup card. The header reads “offline” and “New Chat”. The card holds a prompt you can copy and hand to any local AI agent you already have. That agent follows the skill bundled with this extension and installs a CLI. When it is done, click **Rescan**.

![No agent CLI found](packages/extension/media/readme/en/no-agent.png)

### After a CLI is found

Click a name to connect. The list is whatever this machine actually has, not a fixed catalog.

![Click an Agent to connect](packages/extension/media/readme/en/pick-agent.png)

### Chat runs in the current workspace

Select code in the editor and a chip with the file name and line range appears above the composer. Commands show up as terminal cards and can jump into a VS Code terminal. Files written in the turn are collected as “N files changed”; click a name to open the before/after diff. The ring next to the model name is context usage reported by the agent. If the agent does not report it, the ring is absent.

![Workspace chat, terminal, changed files, and a selection chip](packages/extension/media/readme/en/workspace-chat.png)

## What it does

- **Chat runs in the current workspace.** Reads, writes, and commands apply to the folder you have open, not a scratch directory.
- **Switch agents and models at any time.** Cursor, OpenCode, GitHub Copilot CLI, Claude Code, Codex, Gemini, Qwen, Kimi, iFlow, Trae, Qoder, and other CLIs from the ACP Registry. Model lists come from what each agent advertises.
- **Commands run in a real terminal.** Agents that speak ACP terminals (Codex, Copilot CLI) hand the command to a VS Code terminal. The side panel shows a live card, and one click focuses that terminal so you can keep typing. Other agents still get a card; the button opens the output in a read-only editor tab.
- **A selection is an attachment.** Select code in the editor and a chip with the file name and line range appears above the composer. **Add Selection to OpenSider** in the editor context menu pins extra ranges.
- **Each turn’s edits are listed.** Files written in the turn collapse to “N files changed”. Click one to open that edit’s diff.
- **Context usage.** When the agent reports it, a ring appears beside the model picker. Hover for the ratio and the token counts.
- **Sessions stay local.** Everything is stored under `~/.opensider-vscode`. Nothing is uploaded.

## Install

Search for **OpenSider for VSCode** in the Extensions view, or:

```sh
code --install-extension opensider.opensider-vscode
```

Then run **Developer: Reload Window**. An OpenSider icon appears in the activity bar. The first time you open it, the panel moves to the secondary side bar, next to Copilot Chat. After that it stays wherever you drag it.

From source:

```sh
git clone https://github.com/parksben/opensider-vscode.git
cd opensider-vscode
go build -o packages/extension/bin/opensider-vscode-host ./cmd/opensider-vscode-host
cd packages/extension && npm install && npm run build
npx vsce package --out opensider-vscode.vsix
code --install-extension opensider-vscode.vsix --force
```

## Prepare an agent

The extension includes no model. You need an ACP Agent CLI on this machine, already signed in. When none is found, the panel shows the card in the first screenshot. After install, the skill it points at lives at `~/.opensider-vscode/skills/opensider-vscode/SKILL.md`.

Claude Code and Codex do not speak ACP themselves. They need the official adapters. The extension installs those into `~/.opensider-vscode/runtime` on the first connection. You can also install them by hand:

```sh
npm install --omit=dev --prefix ~/.opensider-vscode/runtime/claude-acp @agentclientprotocol/claude-agent-acp
npm install --omit=dev --prefix ~/.opensider-vscode/runtime/codex-acp  @agentclientprotocol/codex-acp
```

## Local data

| Path | Contents |
|---|---|
| `~/.opensider-vscode/workspaces/<bucket>/ui-state.json` | Session list and workspace preferences |
| `~/.opensider-vscode/workspaces/<bucket>/sessions/<id>.json` | That session's messages |
| `~/.opensider-vscode/global-state.json` | Preferences shared by every window |
| `~/.opensider-vscode/runtime/` | ACP adapters for Claude Code and Codex |
| `~/.opensider-vscode/skills/` | The skill used when no agent is installed yet |
| `~/.opensider-vscode/uploads/` | Copies of dropped or pasted attachments |
| `~/.opensider-vscode/host.log` | Host log. Start here when something fails |

This tree is separate from the browser extension’s `~/.opensider`. The two can be installed together.

## Architecture

```
Side panel webview  ──postMessage──  Extension host  ──length-prefixed JSON stdio──  Go host  ──ACP──  Agent CLI
                                         │
                                         └── VS Code terminals / editors / file picker
```

The Go host is the ACP client: it finds CLIs, starts processes, and tracks sessions and models. The extension host owns everything that needs the VS Code API: terminals, editor tabs, the file picker, and the workspace path. The side panel is only the UI.

ACP `terminal/*` is forwarded from the Go host to the extension, because only the extension can create a real VS Code terminal.

| Directory | Contents |
|---|---|
| `cmd/opensider-vscode-host/` | Host entrypoint |
| `internal/acp/` | ACP client: sessions, streaming replies, permissions, terminal forwarding |
| `internal/detect/` | Agent CLI discovery and launch commands |
| `internal/models/`, `modes/`, `sessioncfg/` | Discovery of models, modes, and session options |
| `packages/extension/src/` | VS Code extension host |
| `packages/extension/src/sidepanel/` | React side panel |
| `packages/extension/shared/` | Wire protocol between the panel and the extension |

## Development

```sh
go build ./...                       # host
cd packages/extension
npm run build                        # extension + side panel
npx tsc --noEmit                     # typecheck
```

Press F5 in VS Code to launch an Extension Development Host. Set `OPENSIDER_VSCODE_HOST` to point at a different host binary.

README screenshots are the real side panel. From `packages/extension`, start Vite and open `src/sidepanel/shots.html?scene=setup`, `agents`, or `chat`, with `&lang=en` or `&lang=zh`. That page is not packaged into the extension.

## Known limits

Agents implement ACP to different degrees. Some capabilities only appear for some of them:

| Capability | Agents |
|---|---|
| Run in a VS Code terminal | Codex, GitHub Copilot CLI |
| Context-usage ring | Codex, GitHub Copilot CLI |
| Session modes (plan / build / …) | Whatever the agent advertises. Cursor and Claude Code do |

Claude Code and Cursor Agent run commands themselves and do not report usage. The command card then falls back to the tool-call output, and the usage ring stays hidden. That is a protocol difference, not a bug in this extension.

## License

MIT
