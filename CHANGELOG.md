# Changelog

[中文](https://github.com/parksben/opensider-vscode/blob/main/CHANGELOG.zh-CN.md)

## 0.1.2

Every step of a running turn stays on screen.

- All tool calls and terminal commands stay expanded for the whole turn instead of collapsing as each one finishes, and the reasoning block being written expands too.
- An expanded result follows its own stream at the bottom; scrolling up releases the follow and coming back near the bottom picks it up again.
- Everything folds back when the turn ends, so no blank gap is left below the last reply.

## 0.1.1

Panel performance and a cleaner transcript.

- Persisting panel state is now debounced and fingerprinted, so streaming a reply no longer serializes the whole state on every chunk.
- Each message bubble memoizes itself, and the browser skips painting the off-screen ones.
- The transcript gives back the height it reserved for live tool calls once a turn ends, so no blank gap is left below the last reply.

## 0.1.0

First release, published from GitHub Releases. Not listed on the Marketplace.

- Side-panel chat with a local ACP agent CLI (Claude Code, Codex, Cursor, OpenCode, GitHub Copilot CLI, and others).
- Setup screen when no agent CLI is installed yet, with a prompt that points at the bundled skill.
- Workspace-scoped edits, selection chips, per-turn file diffs, and terminal cards for agents that speak ACP terminals.
