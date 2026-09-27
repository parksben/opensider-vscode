# OpenSider for VSCode

[English](https://github.com/parksben/opensider-vscode/blob/main/README.md) | 中文

在 VS Code 侧栏里，用你本机已经装好并登录的 Agent CLI 干活。支持 Claude Code、Codex、Cursor、OpenCode、GitHub Copilot CLI，以及其它 [ACP](https://agentclientprotocol.com) Agent。插件本身不带模型。对话、文件修改和命令都发生在当前工作区，会话数据留在本机 `~/.opensider-vscode`。

它是 [OpenSider](https://github.com/parksben/opensider) 浏览器扩展的 VS Code 版：同一套侧栏界面，同一个 ACP 引擎，工作目录换成你当前打开的文件夹。可以当作 GitHub Copilot Chat 的替代，区别是模型和账号都来自你自己的 Agent CLI。

界面语言跟随 VS Code。下面的截图是中文界面。英文文档是仓库里的默认 [README](https://github.com/parksben/opensider-vscode/blob/main/README.md)。

## 界面

### 安装后还没有可用的 Agent

扫完本机、一个 ACP CLI 都没有时，侧栏不会进入聊天，而是停在引导页。顶栏是「离线」和「新会话」。卡片里是一段可复制的提示词，把它交给手边任意一个本地 AI Agent，对方会按扩展内置的 skill 把 CLI 装好。装好后点「重新扫描」。

![没有找到可用的 Agent CLI](packages/extension/media/readme/zh/no-agent.png)

### 扫到 CLI 之后

点一个名字就开始连接。列表只包含这次在本机找到的 CLI，不是写死的目录。

![点击 Agent 以开始连接](packages/extension/media/readme/zh/pick-agent.png)

### 连上之后，对话在当前工作区里进行

编辑器里划选一段代码，输入框上方会出现带文件名和行号的附件。Agent 跑的命令显示成终端卡片，能跳进 VS Code 终端。这一轮写过的文件收成「N 个文件已变更」，点文件名打开这次写入前后的 diff。模型名旁边的环是 Agent 自己上报的上下文用量，不上报就不显示。

![工作区对话、终端、文件变更和划选附件](packages/extension/media/readme/zh/workspace-chat.png)

## 它能做什么

- **对话在当前工作区里进行。** Agent 的读写、命令都作用于你打开的文件夹，不是某个临时目录。
- **随时换 Agent 和模型。** Cursor、OpenCode、GitHub Copilot CLI、Claude Code、Codex、Gemini、Qwen、Kimi、iFlow、Trae、Qoder，以及 ACP Registry 里的其它 CLI。模型列表来自各家自己广告的内容，不写死。
- **命令跑在真实终端里。** 支持 ACP 终端的 Agent（Codex、Copilot CLI）会把命令交给 VS Code 的终端执行，侧栏用卡片展示实时输出，可以一键跳到终端窗口继续手动输入。不支持的 Agent 同样有卡片，按钮改为在只读编辑器标签里看输出。
- **划选代码即附件。** 在编辑器里选中一段代码，输入框上方就出现带文件名和行号的芯片；右键「Add Selection to OpenSider」可以钉住多段。
- **每轮变更一目了然。** 一轮里写过的文件汇总成「N 个文件已变更」，点击直接打开对应 diff。
- **上下文用量。** Agent 上报时，模型选择器左侧会出现一个环形进度条，悬停显示已用比例与 token 数。
- **会话留在本地。** 全部存在 `~/.opensider-vscode`，不上传任何服务器。

## 安装

在扩展视图里搜索 **OpenSider for VSCode**，或在终端执行：

```sh
code --install-extension opensider.opensider-vscode
```

装完执行一次 **Developer: Reload Window**。活动栏会出现 OpenSider 图标。首次打开时面板会移到右侧辅助栏，和 Copilot Chat 并列；之后你把它拖到哪里，它就留在哪里。

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

插件不含模型，需要本机先有一个支持 ACP 的 Agent CLI 并完成登录。找不到任何 Agent 时，侧栏会给出上面那张卡片里的提示词。安装后的 skill 在 `~/.opensider-vscode/skills/opensider-vscode/SKILL.md`。

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

README 里的截图来自真实侧栏：在 `packages/extension` 里启动 Vite 后打开 `src/sidepanel/shots.html?scene=setup`、`agents` 或 `chat`，并用 `&lang=en` 或 `&lang=zh` 选语言。这个页面不打进扩展包。

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
