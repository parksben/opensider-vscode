# 更新说明

[English](https://github.com/parksben/opensider-vscode/blob/main/CHANGELOG.md)

## 0.2.3

macOS 不再为临时 Agent 环境里的文本解码模块弹「无法验证开发者」。

- Host 现在会把 TMPDIR、OpenSider 工作区和 `VIRTUAL_ENV` 下 venv 里的 `charset_normalizer` 原生 `cd` / `md` 模块移出导入路径，不再只处理 Hermes 托管运行时。
- Agent 会话运行期间会轻量复查这些 venv，任务中新建的环境也能覆盖到。

## 0.2.2

macOS 不再为 Hermes 的文本解码模块弹「无法验证开发者」。

- Host 在启动 Hermes 前把 `charset_normalizer` 的原生 `cd` / `md` 模块移出导入路径，让 Python 使用包自带的纯 Python 回退。仅补 ad-hoc 签名不够：这些 uv 安装的模块带受保护的 provenance 属性，macOS 26 仍会拒绝。
- uv 解包缓存也一并处理，从缓存新建的环境不会再把弹窗带回来。

## 0.2.1

macOS 不再为 Hermes 的 Python 模块弹「无法验证开发者」。

- Host 在启动 ACP server 前对 Hermes 托管运行时（`~/.hermes/tools` / `~/.hermes/installs`）里的 `.so` / `.dylib` / `.node` 补 ad-hoc 签名。这能修复只是缺签名的文件；macOS 26 仍会拒绝带 provenance 的 `charset_normalizer` 原生模块，0.2.2 已改为避开它们。

## 0.2.0

侧栏可以连 Hermes Agent 了，直播中的一轮也不会再让用户消息上下抖。

- 自动探测 Hermes 的 ACP server（`hermes-acp` / `hermes acp`），读取它的模型、推理档位与编辑审批模式，并把「每次问 / 自动过编辑 / 不再问」映射到权限档。
- 一轮运行中给直播舞台一个最小高度，用户消息保持不动；下一轮用户消息发出后释放上一轮的舞台。

## 0.1.8

归档的会话不再拖慢侧栏，点开就能取回。

- 每 30 分钟检查一次：超过 30 天没动过的会话，或为了让镜像状态回到 16MB 以内需要让位的最老会话，自动归档。正文仍在本机磁盘上，侧栏只留元数据。
- 抽屉底部的「已归档」分组可以按需恢复正文，老会话不再占用侧栏内存。
- 消息发送失败时侧栏不再被拖垮：Webview 发送失败（例如视图正在销毁）只记录日志，不再把异常抛回 React 事件处理链，后续消息照常发送。

## 0.1.7

多个会话同时跑时，会话列表不再一直换位。

- 排序改成按会话创建时间，不再按最近更新时间——在跑的一轮流式输出不会再让抽屉里的卡片互相跳位。
- 「今天 / 近七天 / 更早」的分组也看创建时间：回复一条老会话不会把它挪进「今天」。

## 0.1.6

收起 OpenSider 视图后，正在跑的一轮不会再“看起来断了”。

- 回合进行中重新打开视图会接上在跑状态，输入框进入排队模式，不会把消息发进一个已经在跑的会话。
- 发进在跑会话的消息会回到队列而不是被静默丢弃，Agent 迟到的输出也不会再落到这条新消息下面。
- Agent 无法恢复旧会话（`session/load` 失败）时，下一条消息会自动带上本地历史，不再从空白上下文开始。

## 0.1.5

Sessions no longer stop responding.

- The host reads the agent's output line by line with no upper bound. A single oversized line used to end the read while the agent kept writing, so the request in flight never returned and the panel stayed on "running" — OpenCode replaying a session that had read a PNG was a reliable way to hit it.
- Anything over 64KB is trimmed to a short preview before an update reaches the panel, so one image-heavy update can no longer exceed the size the host is allowed to send.
- Agents whose own CLI is uninstalled are no longer listed. Claude Code and Codex stayed because their ACP adapters remain installed and even bundle the engine; the picker now verifies the real `claude` / `codex` on your own directories.

## 0.1.3

macOS 不再追问每次会话解出来的文件能不能信。

- Host 改为先给解出的原生库签名、再清隔离属性。签名会重写二进制，而拉起方本身带隔离时 macOS 会把隔离属性重新盖回文件上，所以原先「先清后签」等于没清，每开一次会话就要弹好几次 Gatekeeper 告警。
- 扫循环开始前先把 Agent 原生目录里已有的文件清一遍，顺带覆盖旧实现按扩展名和体积挑不到的可执行文件。
- OpenCode 这一路关掉原生 fff 模块，它的 dylib 根本不再解压。

## 0.1.2

一轮对话跑起来的时候，每一步都留在屏幕上。

- 所有工具调用和终端命令在整个回合期间保持展开，不再一出结果就塌掉；正在写的那段思考也会展开。
- 展开的结果区自己跟着流式输出贴底；往上滚就松开跟随，滚回底部附近又恢复。
- 回合结束后全部收起，最后一条正文下方不会留空白。

## 0.1.1

侧栏性能优化，消息列表底部不再留空白。

- 状态持久化改为节流加指纹比对，流式回复不再每收到一个片段就把整份状态序列化一遍。
- 每条消息气泡各自记忆渲染结果，屏幕外的气泡交给浏览器跳过绘制。
- 一轮对话结束后，消息列表会交出为实时工具调用预留的高度，最后一条正文下方不再出现大片空白。

## 0.1.0

第一个版本，通过 GitHub Releases 发布，不上架扩展市场。

- 在侧栏里用本机 ACP Agent CLI 对话（Claude Code、Codex、Cursor、OpenCode、GitHub Copilot CLI 等）。
- 还没有可用 Agent CLI 时显示引导页，提示词指向扩展内置的 skill。
- 在当前工作区里改文件、把划选变成附件、按轮列出 diff，并为支持 ACP 终端的 Agent 显示终端卡片。
