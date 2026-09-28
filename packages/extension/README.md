# OpenSider for VSCode

English | [中文](https://github.com/parksben/opensider-vscode/blob/main/README.zh-CN.md)

OpenSider runs the Agent CLI you already have — Claude Code, Codex, Cursor, OpenCode, GitHub Copilot CLI, and other [ACP](https://agentclientprotocol.com) agents — inside the VS Code side bar. There is no bundled model and no account of ours: it drives the CLI you installed and signed in to, in the workspace you have open. State stays on this machine under `~/.opensider-vscode`.

It is the VS Code counterpart of the [OpenSider](https://github.com/parksben/opensider) browser extension: the same panel and the same ACP engine, scoped to your workspace. Use it in place of GitHub Copilot Chat, with the model and account coming from your own CLI.

The panel follows VS Code's display language; the screenshots below are the English UI.

## Highlights

- **Runs in your workspace.** The agent's reads, edits, and shell commands resolve against the open folder — no scratch directory, no re-upload.
- **Any ACP agent.** Claude Code, Codex, Cursor, OpenCode, GitHub Copilot CLI, and other CLIs from the ACP Registry. Switch agent or model mid-session; the model list comes from the agent.
- **Editor context.** The active selection becomes an attachment with its file and line range; pin more ranges with **Add Selection to OpenSider** in the context menu.
- **Reviewable turns.** Shell commands surface as terminal cards backed by a real VS Code terminal, and every file a turn writes is listed — each opens as a before/after diff.
- **Skills and a queue.** `/` lists the skills installed on this machine and inserts one at the caret. Prompts sent while a turn is running queue up and can be reordered.
- **Local state.** Sessions, preferences, and the agent runtime stay under `~/.opensider-vscode`. Nothing leaves the machine.

## Demo

### Runs in your workspace

Reads, writes, and commands resolve against the open folder. A selection becomes an attachment chip above the composer, commands become terminal cards, and the files a turn writes collapse into a change list. The ring beside the model name is the context usage the agent reports — no report, no ring.

![Workspace chat with a selection chip, a terminal card, and the changed-file list](media/readme/en/workspace-chat.png)

### Any ACP agent

Connect to whatever this machine has installed, not a fixed catalog, and switch agent or model at any time.

![Click an Agent to connect](media/readme/en/pick-agent.png)

### Skills and a queue

Type `/` to list the skills installed on this machine and put one at the caret. A prompt sent while a turn is running waits in the queue; hover a queued row to move it up or down.

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

This tree is separate from the browser extension's `~/.opensider`. The two can be installed together.

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
