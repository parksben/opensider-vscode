# Uninstall OpenSider for VSCode

## 1. Remove the extension

```sh
code --uninstall-extension opensider.opensider-vscode
```

Run it for VS Code. Check with `code --list-extensions` first; if
`opensider.opensider-vscode` is not listed, say so and continue.

## 2. Ask about local data

`~/.opensider-vscode` holds the session list, preferences, uploaded attachments, and the
ACP adapters installed for Claude Code / Codex. Ask the user whether to keep it, and only
remove it on an explicit yes:

```sh
rm -rf ~/.opensider-vscode
```

## 3. Hand back

Tell the user to run **Developer: Reload Window** in VS Code.
