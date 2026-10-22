# OpenSider for VS Code — development

Developer notes. The user-facing product page is [README.md](../README.md); the Chinese one is [README.zh-CN.md](../README.zh-CN.md).

## Build

```sh
go build ./...                       # Go host
cd packages/extension
npm install
npm run build                        # extension + side panel
npx tsc --noEmit                     # typecheck
```

Press F5 in VS Code to launch an Extension Development Host. Set `OPENSIDER_VSCODE_HOST` to point at a different host binary.

## README screenshots

The screenshots are the real side panel, not mockups. From `packages/extension`, start Vite and open `src/sidepanel/shots.html?scene=setup`, `agents`, `chat`, `composer`, `queue`, or `continue`, with `&lang=en` or `&lang=zh`. Capture at 1120×700 @2x into `packages/extension/media/readme/{en,zh}/`. That page is not packaged into the extension.

## README banner

The GitHub READMEs reference `docs/banner.svg`. The packaged README references `packages/extension/media/readme/banner.png`, because vsce rejects SVG images in a README. The SVG is the source; the PNG is derived from it.

```sh
python3 scripts/generate_banner.py          # writes docs/banner.svg
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --default-background-color=00000000 --window-size=1600,488 \
  --force-device-scale-factor=2 \
  --screenshot=packages/extension/media/readme/banner.png "file://$PWD/docs/banner.svg"
```

Layout, colours and copy live in `scripts/generate_banner.py`; the third-party vector marks it reads are in `scripts/brand/` (see `scripts/brand/README.md` for sources and trademark notes). The side-panel screenshots above are PNG too.

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

The ACP client reads the agent's stdout line by line with no upper bound, and trims any string over 64KB to a short preview before an update is forwarded to the extension. A line cap on that path is a hang: reaching it ends the read loop while the agent is still writing, so the request in flight (`session/load`, `session/prompt`) never comes back and the panel sits on "running" forever. OpenCode replaying a session that read a PNG emits single updates of ~10MB, which is how it was hit.

`internal/detect/` also refuses to list an agent whose ACP adapter is installed but whose own CLI is gone. Claude Code and Codex are the cases: OpenSider installs their adapters, and those adapters even bundle the engine (`codex-acp` ships a copy of `codex` under `node_modules/.bin`), so a plain path lookup keeps finding the agent after the user uninstalls the CLI. Profiles declare `CLINames`, and `resolveLaunch` verifies the real CLI on `paths.HostSearchDirs` — version-manager bins plus `PATH`, never the adapter prefixes — through `detect.ResolveHostCLI`. `install.findHostCLI` follows the same rule, so a leftover adapter no longer counts as "installed".

## Session continuity

Hiding the view does not stop a turn: `retainContextWhenHidden` keeps the webview alive, `onDidDispose` only clears the reference, and the Go host is stopped only when the extension deactivates. What needs care is the panel's view of a live turn:

- `session.use` reports `running: true` when the session is already prompting. The panel adopts it (`runningIds`), so the composer queues instead of sending into a busy session.
- A prompt for a session that is already running is refused with `prompt.busy`; the panel pulls that message out of the transcript, puts it back in `queues`, and keeps running until `turn.end` flushes it. Do not go back to logging and dropping the prompt: the user sees a vanished message and the old turn's late output lands under it.
- When `session/load` fails and the host falls back to `session/new`, the reply carries `created: true`. The panel then writes the local transcript into `pendingForkContext`, exactly like a failed fork, so the next prompt carries the history. Without it the agent restarts from a blank context.

## Reply actions

A finished reply's hover row offers copy, fork and regenerate. Only regenerate is gated by the session's running state (`locked={isRunning}`); copy and fork stay clickable while a turn streams. `forkFromMessage` opens a **new** local session and never touches the prompt that is running, so it must not check `sessionBusy` either — a busy gate there swallowed the click and the button looked dead whenever the source session had a turn in flight. The browser extension's shared panel is the source of this rule; keep the two in step.

## Language

The panel defaults to VS Code's display language: `panelHtml` bakes `vscode.env.language` into the webview as `window.__opensiderLanguage`, and the panel detects its locale from it on first run. The locale is cached only when the user picks one in the panel's settings, so until then the default keeps following VS Code's display language. The cache key is `opensider/locale`.

## Skill and prompts

`packages/extension/skills/opensider-vscode/` ships `SKILL.md`, which routes install / update / remove to `install.md` / `update.md` / `uninstall.md` and otherwise walks through agent setup. `installSkill` copies every `*.md` in that folder to `~/.opensider-vscode/skills/opensider-vscode/`.

The README install/update/uninstall prompts and the settings-tab dialogs (`src/sidepanel/update-prompt.ts`) all point at the raw GitHub URL of `SKILL.md`. Keep it at `.../main/packages/extension/skills/opensider-vscode/SKILL.md` — a `main/skills/...` path is a 404.

The settings tab also mirrors the browser extension's version panel: extension / host / latest rows, a manual "check for updates" that drives a `release.check` (no `announce`) with a watchdog for the offline case, and "Uninstall" opening `UninstallDialog`.

