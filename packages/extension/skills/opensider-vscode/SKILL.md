---
name: opensider-vscode-setup
description: Set up a local ACP agent CLI so the OpenSider for VSCode sidebar can drive it.
---

# Set up an ACP agent for OpenSider for VSCode

The OpenSider sidebar in VS Code is an ACP client. It does not ship any model or
account: it starts an agent CLI that is already installed and signed in on this
machine, and talks to it over the Agent Client Protocol on stdio.

The sidebar found no usable agent. Your job is to get at least one working, then
tell the user to reopen the sidebar.

## 1. See what is already installed

Check the PATH for these commands. Report which ones exist and which do not.

| Agent | Command | ACP entry |
|---|---|---|
| Cursor | `agent` or `cursor-agent` | `agent acp` |
| OpenCode | `opencode` | `opencode acp` |
| GitHub Copilot CLI | `copilot` | `copilot --acp --stdio` |
| Gemini | `gemini` | `gemini --acp` |
| Claude Code | `claude` | needs an adapter, see below |
| Codex | `codex` | needs an adapter, see below |
| Qwen Code | `qwen` | `qwen --acp` |
| Kimi | `kimi` | `kimi acp` |
| iFlow | `iflow` | `iflow --experimental-acp` |
| Trae | `traecli` | `traecli acp serve` |
| Qoder | `qodercli` | `qodercli --acp` |

Also look in the usual places that are missing from a GUI app's PATH:
`~/.local/bin`, `~/.npm-global/bin`, `~/.bun/bin`, `/opt/homebrew/bin`, and the
active nvm / fnm / volta node bin directory.

## 2. Install one if there is none

If the user has no agent CLI at all, ask which one they want, install it the way
that vendor documents, and have them sign in. Do not guess an install command for
a product you are not sure about — point at its official docs instead.

Signing in matters as much as installing: an installed but signed-out CLI will
appear in the sidebar and then fail on the first message.

## 3. Add the ACP adapter for Claude Code / Codex

Those two CLIs do not speak ACP themselves. Install the official adapter into
OpenSider's own runtime directory, so it never collides with anything else:

```sh
# Claude Code
npm install --omit=dev --no-fund --no-audit \
  --prefix ~/.opensider-vscode/runtime/claude-acp \
  @agentclientprotocol/claude-agent-acp

# Codex
npm install --omit=dev --no-fund --no-audit \
  --prefix ~/.opensider-vscode/runtime/codex-acp \
  @agentclientprotocol/codex-acp
```

`pnpm add --dir <prefix> <pkg>` and `bun add --cwd <prefix> <pkg>` work too. Only
install the adapter for a CLI that is actually present.

Do not install into `~/.opensider/runtime`. That directory belongs to the
OpenSider browser extension, which is a separate product.

## 4. Verify

The adapter binaries should now exist:

- `~/.opensider-vscode/runtime/claude-acp/node_modules/.bin/claude-agent-acp`
- `~/.opensider-vscode/runtime/codex-acp/node_modules/.bin/codex-acp`

A working ACP entry responds to an `initialize` request on stdio and does not
exit immediately. If a CLI starts but the sidebar still cannot use it, read
`~/.opensider-vscode/host.log` — the host records every probe and launch there.

## 5. Hand back

Tell the user which agents are ready, then have them reopen the OpenSider view in
VS Code (or run "Developer: Reload Window"). The sidebar rescans on every start.
