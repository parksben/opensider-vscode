# OpenSider for VS Code

[English](https://github.com/parksben/opensider-vscode/blob/main/README.md) | 中文

OpenSider 把本机已有的 Agent CLI —— Claude Code、Codex、Cursor、OpenCode、GitHub Copilot CLI，以及其它 [ACP](https://agentclientprotocol.com) Agent —— 放进 VS Code 侧栏。它本身不带模型，也没有我们的账号：用的是你装好并登录的那个 CLI，在你打开的文件夹里干活。所有存储都在本机 `~/.opensider-vscode` 下。

它是 [OpenSider](https://github.com/parksben/opensider) 浏览器扩展的 VS Code 版：同一套侧栏界面，同一个 ACP 引擎，工作目录换成你当前打开的文件夹。可以当作 GitHub Copilot Chat 的替代，模型和账号都来自你自己的 CLI。

界面语言跟随 VS Code。下面的截图是中文界面。

## 功能亮点

- **在打开的文件夹里干活。** 读写和命令都作用于你当前打开的文件夹，而不是某个临时目录。
- **自带 Agent 和模型。** Claude Code、Codex、Cursor、OpenCode、GitHub Copilot CLI，以及 ACP Registry 里的其它 CLI。随时切换 Agent 或模型，列表就是本机实际装了什么。
- **划选即上下文。** 选中代码，输入框上方出现附件芯片；右键菜单里的 **Add Selection to OpenSider** 可以再钉几段。
- **命令和变更都在原地。** 命令输出是一张实时卡片，一键跳进 VS Code 终端；这一轮写过的文件收成「N 个文件已变更」，点开就是那次写入的 diff。
- **`/` 唤起 skill，悬浮调整队列。** 输入 `/` 列出本机已装的 skill，按光标位置落芯片；回复进行中，新消息进队列，悬浮就能上移或下移。
- **默认全部在本地。** 会话、偏好、Agent 运行时都在 `~/.opensider-vscode`，不上传。

## 演示

### 在打开的文件夹里干活

读写和命令都作用于当前打开的文件夹。划选一段代码就变成输入框上方的附件芯片，命令变成终端卡片，这一轮写过的文件收成变更列表。模型名旁边的环是 Agent 上报的上下文用量 —— 不上报就不显示。

![工作区对话：附件芯片、终端卡片和文件变更列表](packages/extension/media/readme/zh/workspace-chat.png)

### 自带 Agent

点一个名字就开始连接。列表是这次在本机找到的 CLI，不是写死的目录。随时可以换 Agent 或模型，模型列表来自各家自己上报的内容。

![点击 Agent 以开始连接](packages/extension/media/readme/zh/pick-agent.png)

### Skill 与队列

输入 `/` 会列出本机已装的 skill，并把它放在光标处。回复还在跑时，新消息先排队；悬浮某一行可以上移或下移。

![`/` 菜单列出本机已装的 skill](packages/extension/media/readme/zh/composer.png)

![悬浮队列消息显示上移、下移按钮](packages/extension/media/readme/zh/queue.png)

## 安装

从 [GitHub Releases](https://github.com/parksben/opensider-vscode/releases) 下载和本机平台对应的 `.vsix`。不上架扩展市场。

```sh
code --install-extension opensider-vscode-darwin-arm64.vsix --force
```

文件名里的平台是 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`win32-x64`、`win32-arm64` 之一。Cursor 用同一份包：

```sh
cursor --install-extension opensider-vscode-darwin-arm64.vsix --force
```

装完执行一次 **Developer: Reload Window**。活动栏会出现 OpenSider 图标。首次打开时面板会移到右侧辅助栏，和 Copilot Chat 并列；之后你把它拖到哪里，它就留在哪里。

有更新的 Release 时，侧栏右上角会出现更新按钮；每次打开面板还会直接弹出更新提示。提示词交给你自己的 Agent 去装，插件本身不下载安装包。

从源码打包：

```sh
git clone https://github.com/parksben/opensider-vscode.git
cd opensider-vscode
go build -o packages/extension/bin/opensider-vscode-host ./cmd/opensider-vscode-host
cd packages/extension && npm install && npm run build
npx vsce package --out opensider-vscode.vsix
code --install-extension opensider-vscode.vsix --force
```

## 准备一个 Agent

插件不含模型，需要本机先有一个支持 ACP 的 Agent CLI 并完成登录。找不到任何 Agent 时，侧栏会给出下面这张卡片里的提示词。安装后的 skill 在 `~/.opensider-vscode/skills/opensider-vscode/SKILL.md`。

![没有找到可用的 Agent CLI](packages/extension/media/readme/zh/no-agent.png)

Claude Code 和 Codex 本体不说 ACP，需要官方适配器。插件会在第一次连接时自动装进 `~/.opensider-vscode/runtime`，也可以手动装：

```sh
npm install --omit=dev --prefix ~/.opensider-vscode/runtime/claude-acp @agentclientprotocol/claude-agent-acp
npm install --omit=dev --prefix ~/.opensider-vscode/runtime/codex-acp  @agentclientprotocol/codex-acp
```

## 本地数据

| 路径 | 内容 |
|---|---|
| `~/.opensider-vscode/workspaces/<bucket>/ui-state.json` | 会话列表和工作区偏好 |
| `~/.opensider-vscode/workspaces/<bucket>/sessions/<id>.json` | 该会话的消息 |
| `~/.opensider-vscode/global-state.json` | 所有窗口共用的偏好 |
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

README 里的截图来自真实侧栏：在 `packages/extension` 里启动 Vite 后打开 `src/sidepanel/shots.html?scene=setup`、`agents`、`chat`、`composer` 或 `queue`，并用 `&lang=en` 或 `&lang=zh` 选语言。这个页面不打进扩展包。

更新说明见 [CHANGELOG.zh-CN.md](https://github.com/parksben/opensider-vscode/blob/main/CHANGELOG.zh-CN.md)。

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
