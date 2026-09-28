# Update OpenSider for VSCode

The extension is distributed as a GitHub Release, not through the Marketplace.
Install the `.vsix` that matches this machine, then ask the user to reload the window.

## 1. See what is installed

```sh
code --list-extensions --show-versions
cursor --list-extensions --show-versions
```

The id is `opensider.opensider-vscode`. Remember which of `code` and `cursor` actually exist.

## 2. Resolve the latest release

```sh
curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: opensider-vscode" \
  https://api.github.com/repos/parksben/opensider-vscode/releases/latest
```

Read `tag_name` (for example `v0.1.0`). The extension version is that tag without the leading `v`.

If the API answers 403 or 429, do not invent a version and do not keep retrying. Fall back once to the website redirect and read the tag from the `Location` header:

```sh
curl -fsSL -o /dev/null -w "%{redirect_url}" \
  https://github.com/parksben/opensider-vscode/releases/latest
```

If that also fails, stop and tell the user the check did not succeed.

If the installed version is already the same as the tag, stop. There is nothing to install.

## 3. Download the package for this machine

Assets are named `opensider-vscode-<target>.vsix`:

| Machine | Asset |
|---|---|
| macOS Apple silicon | `opensider-vscode-darwin-arm64.vsix` |
| macOS Intel | `opensider-vscode-darwin-x64.vsix` |
| Linux x64 | `opensider-vscode-linux-x64.vsix` |
| Linux arm64 | `opensider-vscode-linux-arm64.vsix` |
| Windows x64 | `opensider-vscode-win32-x64.vsix` |
| Windows arm64 | `opensider-vscode-win32-arm64.vsix` |

Download that one asset from the release. Do not clone the repo and do not build from source unless the asset is missing.

## 4. Install it

Run the install for every editor CLI that exists on this machine:

```sh
code --install-extension <file>.vsix --force
cursor --install-extension <file>.vsix --force
```

## 5. Hand back

Tell the user to run **Developer: Reload Window** in each editor they use. The new extension host does not load until then.
