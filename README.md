# OpenSider for VSCode

在 VS Code 侧栏里，用你本机已经装好并登录的 Agent CLI 干活。

它是 [OpenSider](https://github.com/parksben/opensider) 浏览器扩展的 VS Code 版：同一套侧栏界面，同一个 ACP 引擎，工作目录换成你当前打开的工作区。可以当作 GitHub Copilot Chat 的替代，区别是模型和账号都来自你自己的 Agent CLI，插件本身不带任何模型。

## 它能做什么

- **对话在当前工作区里进行。** Agent 的读写、命令都作用于你打开的文件夹，不是某个临时目录。
- **随时换 Agent 和模型。** Cursor、OpenCode、GitHub Copilot CLI、Claude Code、Codex、Gemini、Qwen、Kimi、iFlow、Trae、Qoder，以及 ACP Registry 里的其它 CLI。模型列表来自各家自己广告的内容，不写死。
- **命令跑在真实终端里。** 支持 ACP 终端的 Agent（Codex、Copilot CLI）会把命令交给 VS Code 的终端执行，侧栏用卡片展示实时输出，可以一键跳到终端窗口继续手动输入。不支持的 Agent 同样有卡片，按钮改为在只读编辑器标签里看输出。
- **划选代码即附件。** 在编辑器里选中一段代码，输入框上方就出现带文件名和行号的芯片；右键「Add Selection to OpenSider」可以钉住多段。
- **每轮变更一目了然。** 一轮里写过的文件汇总成 "N files changed"，点击直接打开。
- **上下文用量。** Agent 上报时，模型选择器左侧会出现一个环形进度条，悬停显示已用比例与 token 数。
- **会话留在本地。** 全部存在 `~/.opensider-vscode`，不上传任何服务器。

## 安装

### 从 VSIX 安装

```sh
git clone <this-repo> && cd opencoder
go build -o packages/extension/bin/opensider-vscode-host ./cmd/opensider-vscode-host
cd packages/extension && npm install && npm run build
npx vsce package --allow-missing-repository --skip-license --out opensider-vscode.vsix
code --install-extension opensider-vscode.vsix --force
```

装完执行一次 **Developer: Reload Window**，活动栏会出现 OpenSider 图标。首次打开时面板会移到右侧辅助栏，和 Copilot Chat 并列；之后你把它拖到哪里，它就留在哪里。

### 准备一个 Agent

插件不含模型，需要本机先有一个支持 ACP 的 Agent CLI 并完成登录。侧栏在找不到任何 Agent 时会给出一段提示词，把它发给你手边任意一个 AI Agent，它会按插件内置的 skill（安装后位于 `~/.opensider-vscode/skills/opensider-vscode/SKILL.md`）完成探测与配置。

Claude Code 和 Codex 本体不说 ACP，需要官方适配器。插件会在第一次连接时自动装进 `~/.opensider-vscode/runtime`，也可以手动装：

```sh
npm install --omit=dev --prefix ~/.opensider-vscode/runtime/claude-acp @agentclientprotocol/claude-agent-acp
npm install --omit=dev --prefix ~/.opensider-vscode/runtime/codex-acp  @agentclientprotocol/codex-acp
```

## 本地数据

| 路径 | 内容 |
|---|---|
| `~/.opensider-vscode/ui-state.json` | 会话列表、聊天记录与偏好设置 |
| `~/.opensider-vscode/runtime/` | Claude Code / Codex 的 ACP 适配器 |
| `~/.opensider-vscode/skills/` | 无 Agent 时用于引导配置的 skill |
| `~/.opensider-vscode/uploads/` | 拖入或粘贴的附件副本 |
| `~/.opensider-vscode/host.log` | 宿主日志，排查问题先看它 |

和浏览器版的 `~/.opensider` 完全分开，两边互不影响，可以同时装。

## 架构

```
侧栏 Webview  ──postMessage──  扩展宿主  ──长度前缀 JSON stdio──  Go 宿主  ──ACP──  Agent CLI
                                  │
                                  └── VS Code 终端 / 编辑器 / 文件选择
```

Go 宿主是 ACP 客户端，负责探测 CLI、拉起进程、管理会话和模型。扩展宿主持有一切需要 VS Code API 的东西：终端、编辑器标签、文件选择、工作区路径。侧栏只管界面。

ACP 的 `terminal/*` 由 Go 宿主转发给扩展，因为只有扩展能创建真正的 VS Code 终端。

| 目录 | 内容 |
|---|---|
| `cmd/opensider-vscode-host/` | 宿主入口 |
| `internal/acp/` | ACP 客户端：会话、流式回复、权限、终端转发 |
| `internal/detect/` | Agent CLI 探测与启动命令 |
| `internal/models/`、`modes/`、`sessioncfg/` | 模型、模式与会话配置项的发现 |
| `packages/extension/src/` | VS Code 扩展宿主 |
| `packages/extension/src/sidepanel/` | React 侧栏 |
| `packages/extension/shared/` | 侧栏与扩展之间的线协议 |

## 开发

```sh
go build ./...                       # 宿主
cd packages/extension
npm run build                        # 扩展 + 侧栏
npx tsc --noEmit                     # 类型检查
```

在 VS Code 里按 F5 启动 Extension Development Host 调试。想指向另一个宿主二进制时，设 `OPENSIDER_VSCODE_HOST` 环境变量。

## 已知边界

不同 Agent 对 ACP 的支持程度不同，有些能力只在部分 Agent 上出现：

| 能力 | 支持的 Agent |
|---|---|
| VS Code 终端执行 | Codex、GitHub Copilot CLI |
| 上下文用量环 | Codex、GitHub Copilot CLI |
| 会话模式（plan / build…） | 各家自行广告，Cursor、Claude Code 等有 |

Claude Code 和 Cursor Agent 自己跑命令、也不上报用量，此时命令卡片退回读取工具调用的输出，用量环不显示。这是协议层面的差异，不是缺陷。

## License

MIT
