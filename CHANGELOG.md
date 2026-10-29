# Changelog

[中文](https://github.com/parksben/opensider-vscode/blob/main/CHANGELOG.zh-CN.md)

## 0.1.7

The session list stops moving while several sessions run.

- Sessions are ordered by when they were created, not by the last update, so a running turn no longer reshuffles the drawer on every streamed chunk.
- The today / last seven days / older groups follow the creation time too: replying to an old chat no longer moves it into "today".

## 0.1.6

A running turn survives hiding the OpenSider view.

- Reopening the view mid-turn adopts the live turn, so the composer queues a new message instead of sending it into a session that is already working.
- A message sent into a busy session is put back into the queue rather than dropped; the agent's late output no longer appears under the wrong message.
- When the agent cannot reload an old session (`session/load` fails), the local transcript is carried into the next prompt instead of starting from a blank context.

## 0.1.5

Sessions no longer stop responding.

- The host reads the agent's output line by line with no upper bound. A single oversized line used to end the read while the agent kept writing, so the request in flight never returned and the panel stayed on "running" — OpenCode replaying a session that had read a PNG was a reliable way to hit it.
- Anything over 64KB is trimmed to a short preview before an update reaches the panel, so one image-heavy update can no longer exceed the size the host is allowed to send.
- Agents whose own CLI is uninstalled are no longer listed. Claude Code and Codex stayed because their ACP adapters remain installed and even bundle the engine; the picker now verifies the real `claude` / `codex` on your own directories.

## 0.1.3

macOS stops asking whether it should trust the files a session unpacks.

- The host signs an extracted native library before clearing its quarantine flag. Signing rewrites the binary, and when the launching app itself is quarantined macOS stamps the flag onto the file again, so clearing first left it in place and every session popped a handful of Gatekeeper warnings.
- The agent's native directory is cleaned before the sweep loop starts, which also covers executables the old extension-and-size filter never visited.
- The OpenCode profile opts out of the native fff module, so its dylib is not unpacked at all.

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
