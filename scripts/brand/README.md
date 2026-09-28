# scripts/brand —— banner 用的第三方矢量素材

这里存放 banner 用到的**官方**矢量原文件：右侧五家 Agent 的标记，以及左侧 VS Code
图标。整份留存、不做裁剪，只给 `scripts/generate_banner.py` 生成 `docs/banner.svg`
与 `packages/extension/media/readme/banner.svg` 时读取。多数标记脚本按 `fill` 认出需要
的那几条 `<path>`，只替换填充色，不改形状、不加特效；VS Code 图标整份内联（自带渐变、
遮罩与滤镜），只给内部 id 加前缀避免撞名。

| 文件 | 品牌 | 来源 | 用到的部分 |
|---|---|---|---|
| `claude-code.svg` | Claude Code（Anthropic） | Claude Code 官方文档站 `docs.claude.com` 的站点 logo（light 变体） | `fill="#D97757"` 的星标；同文件其余 path 是「Claude Code」字标 |
| `codex.svg` | Codex（OpenAI） | LobeHub icons 的 `codex-color.svg`（MIT 汇集的图标库，商标归 OpenAI）；从 npm 镜像取：`https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.0/icons/codex-color.svg` | 渐变填充（`url(#…)`）那条 path（云形 + 终端提示符）+ 它的 `<linearGradient>`；白色圆角底板（app 图标底色）不用 |
| `github-copilot.svg` | GitHub Copilot | GitHub 官方 Octicons 的 `copilot-24`（MIT） | 头部轮廓 + 两只眼，全部 |
| `opencode.svg` | OpenCode | opencode 仓库 `packages/ui/src/assets/favicon/favicon-v3.svg` | 外框 + 内方块；深色底板 `<rect>` 不用 |
| `cursor.svg` | Cursor | cursor.com 的 `marketing-static/favicon.svg` | 立方体那条；圆角底板与半透明描边层不用 |
| `vscode.svg` | Visual Studio Code（Microsoft） | Devicon 的 `vscode-original.svg`（MIT 汇集的图标库；从 npm 镜像取：`https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg`） | 整份内联（蓝色折带 + 遮罩 + 渐变 + 投影滤镜），作为左侧编辑器一端的图标 |

这些素材的版权与商标归各品牌所有。放进仓库只用于说明 OpenSider 是 VS Code 里
连接本机 Agent CLI 的客户端，**不表示这些品牌为本产品背书，也不代表存在合作关系**。
使用或替换前请自行确认各品牌的商标与素材使用条款。

更新素材：替换同名文件，重跑 `scripts/generate_banner.py`，然后肉眼核对生成的 banner
（尺寸表与 bbox 在生成脚本里，上游改了几何要同步改）。
