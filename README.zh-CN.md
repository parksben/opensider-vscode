# OpenSider for VS Code

[English](https://github.com/parksben/opensider-vscode/blob/main/README.md) | 中文

OpenSider 把本机已有的 Agent CLI —— Claude Code、Codex、Cursor、OpenCode、GitHub Copilot CLI，以及其它 [ACP](https://agentclientprotocol.com) Agent —— 放进 VS Code 侧栏。它不带模型，也没有我们的账号：用的是你装好并登录的 CLI，在你打开的工作区里干活。状态都留在本机 `~/.opensider-vscode` 下。

它是 [OpenSider](https://github.com/parksben/opensider) 浏览器扩展的 VS Code 版：同一套面板和 ACP 引擎，作用域换成你的工作区。可以当作 GitHub Copilot Chat 的替代，模型和账号都来自你自己的 CLI。

面板语言跟随 VS Code 的显示语言；下面是中文界面。

## 功能亮点

- **在工作区里运行。** Agent 的读取、修改和 shell 命令都作用于当前打开的文件夹，没有临时目录，也不用重新上传。
- **接入任意 ACP Agent。** Claude Code、Codex、Cursor、OpenCode、GitHub Copilot CLI，以及 ACP Registry 里的其它 CLI；会话中随时切换 Agent 或模型，模型列表由 Agent 自己上报。
- **编辑器上下文。** 当前选区会成为带文件名和行号的附件；右键 **Add Selection to OpenSider** 可以再钉其它范围。
- **每一轮可审查。** shell 命令以终端卡片呈现，背后是真实的 VS Code 终端；这一轮写入的文件会列出，点开就是改动前后的 diff。
- **Skill 与队列。** 输入 `/` 列出本机已装的 skill 并插到光标处；回复进行中发送的提示会排队，并可调整顺序。
- **本地状态。** 会话、偏好和 Agent 运行时都在 `~/.opensider-vscode` 下，不出本机。

## 演示

### 在工作区里运行

读取、修改和命令都作用于当前打开的文件夹。划选一段代码就变成输入框上方的附件芯片，命令变成终端卡片，这一轮写入的文件收成变更列表。模型名旁边的环是 Agent 上报的上下文用量 —— 不上报就不显示。

![工作区对话：附件芯片、终端卡片和文件变更列表](packages/extension/media/readme/zh/workspace-chat.png)

### 接入任意 ACP Agent

连接的是本机实际装了什么，而不是写死的目录；随时可以换 Agent 或模型。

![点击 Agent 以开始连接](packages/extension/media/readme/zh/pick-agent.png)

### Skill 与队列

输入 `/` 会列出本机已装的 skill，并把它插到光标处。回复还在跑时发送的提示会先排队；悬浮某一行可以上移或下移。

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
