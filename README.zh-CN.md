<div align="center">
  <br />
  <img alt="OpenSider" src="docs/banner.svg" />
  <p>
    在 VS Code 中使用多类 Agent
  </p>
  <p>
    <a href="https://github.com/parksben/opensider-vscode/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/parksben/opensider-vscode?label=RELEASE" /></a>
    <a href="https://github.com/parksben/opensider-vscode/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/parksben/opensider-vscode?label=LICENSE" /></a>
  </p>
</div>

<div align="center">
  <a href="https://github.com/parksben/opensider-vscode/blob/main/README.md">English</a> | 中文
</div>

**OpenSider for VS Code**：把本机已有的 Agent CLI（Claude Code、Codex、Cursor、OpenCode、GitHub Copilot CLI，以及其它 [ACP](https://agentclientprotocol.com) Agent）接进 VS Code 侧边栏的 Chat 面板，让你在同一个项目里使用它们中的任意一个。它是 [OpenSider](https://github.com/parksben/opensider) 浏览器扩展的 VS Code 版，沿用同一套界面和 ACP 引擎，可以替代 GitHub Copilot Chat。

## 功能亮点

- **接入任意 ACP Agent。** Claude Code、Codex、Cursor、OpenCode、GitHub Copilot CLI，以及 ACP Registry 里的其它 CLI。模型列表由 Agent 上报。
- **同一会话里换 Agent 和模型。** 先用一个 Agent，中途换成另一个，对话继续。
- **与浏览器 OpenSider 续聊。** 在任意回复上点「在浏览器中续聊」，OpenSider 会把这段对话打包成一条提示词，粘进浏览器扩展就能接着做；会话也能从浏览器交回 VS Code。

## 演示

### 工作区对话

读取、修改和命令都作用于你打开的这个文件夹。划选一段代码，它会变成输入框上方的附件芯片；一条命令变成一张终端卡片；这一轮写入的文件收成一张变更列表。模型名旁边的环显示 Agent 上报的上下文用量。

![工作区对话：附件芯片、终端卡片和文件变更列表](packages/extension/media/readme/zh/workspace-chat.png)

### 接入任意 ACP Agent

本机装了哪些就接哪些，随时可以换 Agent 或模型。

![点击 Agent 以开始连接](packages/extension/media/readme/zh/pick-agent.png)

### Skill 与队列

输入 `/` 会列出本机已装的 skill，并把它插到光标处。回复还在跑时发送的提示会先排队；悬浮某一行可以上移或下移。

![`/` 菜单列出本机已装的 skill](packages/extension/media/readme/zh/composer.png)

![悬浮队列消息显示上移、下移按钮](packages/extension/media/readme/zh/queue.png)

### 与浏览器 OpenSider 续聊

在 VS Code 里聊到一半，点回复上的「在浏览器中续聊」；OpenSider 会把这段对话打包成一条提示词，粘进浏览器扩展就能接着做。会话也能从浏览器交回 VS Code。

![在 VS Code 里点「在浏览器中续聊」后生成的提示词](packages/extension/media/readme/zh/continue-browser.png)

## 安装使用

> 本扩展用于 VS Code。安装前请先在本机装好并登录一个 Agent CLI。

### 1. 安装

把下面这段提示词复制给你正在使用的本机 Agent。它会下载和本机匹配的 `.vsix`、安装扩展，并配好一个 Agent CLI。

```
帮我安装 OpenSider for VSCode。
请先读取 https://raw.githubusercontent.com/parksben/opensider-vscode/main/packages/extension/skills/opensider-vscode/SKILL.md，按其安装流程执行。
```

### 2. 更新

侧栏提示有新版本时，把下面这段提示词复制给你的本机 Agent，按它给的步骤更新。

```
帮我更新 OpenSider for VSCode。
请先读取 https://raw.githubusercontent.com/parksben/opensider-vscode/main/packages/extension/skills/opensider-vscode/SKILL.md，按其更新流程执行。
```

### 3. 卸载

把下面这段提示词复制给你的本机 Agent。卸载时可以选择保留还是删除本地数据。

```
帮我卸载 OpenSider for VSCode。
请先读取 https://raw.githubusercontent.com/parksben/opensider-vscode/main/packages/extension/skills/opensider-vscode/SKILL.md，按其卸载流程执行。
```

装完执行一次 **Developer: Reload Window**。活动栏会出现 OpenSider 图标。首次打开时面板会移到右侧辅助栏，和 Copilot Chat 并列；之后你把它拖到哪里，它就留在哪里。

## License

MIT
