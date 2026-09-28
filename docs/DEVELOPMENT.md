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

`docs/banner.svg` (used by the GitHub READMEs) and `packages/extension/media/readme/banner.svg` (used by the packaged README) are generated together. Run:

```sh
python3 scripts/generate_banner.py
```

Layout, colours and copy live in `scripts/generate_banner.py`; the third-party vector marks it reads are in `scripts/brand/` (see `scripts/brand/README.md` for sources and trademark notes). The banner is the only image checked in as SVG — the side-panel screenshots above are PNG.

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

## Language

The panel defaults to VS Code's display language: `panelHtml` bakes `vscode.env.language` into the webview as `window.__opensiderLanguage`, and the panel detects its locale from it on first run. The locale is cached only when the user picks one in the panel's settings, so until then the default keeps following VS Code's display language. The cache key is `opensider/locale`.

## Skill and prompts

`packages/extension/skills/opensider-vscode/` ships `SKILL.md`, which routes install / update / remove to `install.md` / `update.md` / `uninstall.md` and otherwise walks through agent setup. `installSkill` copies every `*.md` in that folder to `~/.opensider-vscode/skills/opensider-vscode/`.

The README install/update/uninstall prompts and the settings-tab dialogs (`src/sidepanel/update-prompt.ts`) all point at the raw GitHub URL of `SKILL.md`. Keep it at `.../main/packages/extension/skills/opensider-vscode/SKILL.md` — a `main/skills/...` path is a 404.

The settings tab also mirrors the browser extension's version panel: extension / host / latest rows, a manual "check for updates" that drives a `release.check` (no `announce`) with a watchdog for the offline case, and "Uninstall" opening `UninstallDialog`.

