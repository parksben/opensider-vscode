# Install OpenSider for VSCode

The extension is a GitHub Release, not a Marketplace listing. Install the `.vsix` that
matches this machine, then make sure at least one ACP agent CLI is ready.

## 1. Resolve the latest release

```sh
curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: opensider-vscode" \
  https://api.github.com/repos/parksben/opensider-vscode/releases/latest
```

Read `tag_name` (for example `v0.1.0`). If the API answers 403 or 429, fall back once to
the website redirect and read the tag from the `Location` header:

```sh
curl -fsSL -o /dev/null -w "%{redirect_url}" \
  https://github.com/parksben/opensider-vscode/releases/latest
```

If that also fails, stop and tell the user the download could not be resolved.

## 2. Download the package for this machine

Assets are named `opensider-vscode-<target>.vsix`:

| Machine | Asset |
|---|---|
| macOS Apple silicon | `opensider-vscode-darwin-arm64.vsix` |
| macOS Intel | `opensider-vscode-darwin-x64.vsix` |
| Linux x64 | `opensider-vscode-linux-x64.vsix` |
| Linux arm64 | `opensider-vscode-linux-arm64.vsix` |
| Windows x64 | `opensider-vscode-win32-x64.vsix` |
| Windows arm64 | `opensider-vscode-win32-arm64.vsix` |

Download that one asset from the release.

## 3. Install it

Run the install:

```sh
code --install-extension <file>.vsix --force
```

## 4. Set up an agent

Then read [SKILL.md](./SKILL.md) and get at least one ACP agent CLI working: install one
if needed, have the user sign in, and add the Claude Code / Codex adapter when those CLIs
are present.

## 5. Hand back

Tell the user to run **Developer: Reload Window** in VS Code. The new
extension host does not load until then.
