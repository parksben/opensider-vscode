# OpenSider for VSCode

English | [中文](https://github.com/parksben/opensider-vscode/blob/main/README.zh-CN.md)

OpenSider puts the Agent CLI you already have — Claude Code, Codex, Cursor, OpenCode, GitHub Copilot CLI, and other [ACP](https://agentclientprotocol.com) agents — into the VS Code side bar. There is no bundled model and no account of ours: it drives the CLI you installed and signed in to, inside the folder you have open. Everything it stores stays on this machine under `~/.opensider-vscode`.

It is the VS Code edition of the [OpenSider](https://github.com/parksben/opensider) browser extension: the same side panel and the same ACP engine, with the working directory set to your open folder. Use it in place of GitHub Copilot Chat — the model and the account come from your own CLI.

The panel follows the VS Code display language. The screenshots below are the English UI.

## Highlights

- **Chat where you work.** Reads, writes, and commands apply to the folder you have open, not a scratch directory.
- **Bring your own agent and model.** Claude Code, Codex, Cursor, OpenCode, GitHub Copilot CLI, and other CLIs from the ACP Registry. Switch agent or model at any time; each list is what this machine actually has.
- **A selection is context.** Select code and it appears as an attachment chip above the composer. Right-click and pick **Add Selection to OpenSider** to pin more ranges.
- **Commands and changes, in place.** Command output shows as a live card — one click focuses the VS Code terminal. Files written during the turn collapse into “N files changed”; click one to open that edit’s diff.
- **Skills on `/`, order on hover.** Type `/` to list the skills installed on this machine and drop one wherever the caret is. While a reply runs, messages queue up and can be moved up or down on hover.
- **Local by default.** Sessions, preferences, and the agent runtime live under `~/.opensider-vscode`. Nothing is uploaded.

## Demo

### Chat where you work

Reads, writes, and commands apply to the folder you have open. A selection becomes an attachment chip above the composer, commands become terminal cards, and the files written this turn collapse into a change list. The ring beside the model name is the context usage the agent reports — no report, no ring.

![Workspace chat with a selection chip, a terminal card, and the changed-file list](media/readme/en/workspace-chat.png)

### Bring your own agent

Click a name to connect. The list is whatever this machine actually has, not a fixed catalog. You can switch agent or model at any time, and each model list comes from the agent itself.

![Click an Agent to connect](media/readme/en/pick-agent.png)

### Skills and the queue

Type `/` to see the skills installed on this machine and put one at the caret. While a reply is still running, new messages wait in the queue; hover a queued row to move it up or down.

![The `/` menu listing installed skills](media/readme/en/composer.png)

![Queued messages with move-up and move-down buttons on hover](media/readme/en/queue.png)

## Install

Download the `.vsix` for your platform from the [GitHub releases](https://github.com/parksben/opensider-vscode/releases). There is no Marketplace listing.

```sh
code --install-extension opensider-vscode-darwin-arm64.vsix --force
```

Use the asset that matches this machine (`darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64`, `win32-arm64`). Cursor takes the same file:

```sh
cursor --install-extension opensider-vscode-darwin-arm64.vsix --force
```

Then run **Developer: Reload Window**. An OpenSider icon appears in the activity bar. The first time you open it, the panel moves to the secondary side bar, next to Copilot Chat. After that it stays wherever you drag it.

When a newer release exists, the panel shows an update button and, on each load, the update dialog. That dialog is a prompt for your own agent; it does not download the package by itself.

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

The extension includes no model. You need an ACP Agent CLI on this machine, already signed in. When none is found, the panel shows the card in the screenshot below. The skill it points at lives at `~/.opensider-vscode/skills/opensider-vscode/SKILL.md`.

![No agent CLI found](media/readme/en/no-agent.png)

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

README screenshots are the real side panel. From `packages/extension`, start Vite and open `src/sidepanel/shots.html?scene=setup`, `agents`, `chat`, `composer`, or `queue`, with `&lang=en` or `&lang=zh`. That page is not packaged into the extension.

## Known limits

Agents implement ACP to different degrees, so some capabilities only appear for some of them:

| Capability | Agents |
|---|---|
| Run in a VS Code terminal | Codex, GitHub Copilot CLI |
| Context-usage ring | Codex, GitHub Copilot CLI |
| Session modes (plan / build / …) | Whatever the agent advertises. Cursor and Claude Code do |

Claude Code and Cursor Agent run commands themselves and do not report usage. Their command card falls back to the tool-call output, and the usage ring stays hidden. That is a protocol difference, not a bug in this extension.

## License

MIT
