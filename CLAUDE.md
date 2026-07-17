# CLAUDE.md — `@cking000/pi-web`（fork）

本仓库是 `agegr/pi-web` 的 **owned fork**，以 npm 包 `@cking000/pi-web` 发布，由兄弟仓库
`pi-web-desktop`（Electron 外壳）通过 npm 消费。

fork 存在的价值（任何改动/合并都必须保留）：

1. **Metro / Windows-Phone「Live Tiles」视觉改造** —— 整套 UI 的外观与交互（见下「Fork UI 资产」）。
2. **包名** `@cking000/pi-web`（不是 `@agegr/pi-web`）。
3. **Windows 构建补丁** —— `next.config.ts` 里过滤 `TraceEntryPointsPlugin` 的 webpack hook（修 `next build` 的 EPERM scandir 崩溃）。

---

## ⭐ 上游合并策略（最高优先级）

同步上游 `agegr/pi-web` 时，**若上游改动了 UI / 交互，优先把上游的「功能」合并进现有（fork）的交互之下，保持交互与外观不变。**

- 即：**fork 的 Metro 交互是基底**，把上游的功能性改动（新逻辑、新 props、新特性、协议/数据层变更、依赖升级）嫁接到 fork 的界面上。
- **不要**反过来「拿上游的 UI 当基底、再往上重贴皮肤」。0.7.0 那次就是这么做的（取上游组件 + 轻量补 Metro 皮肤），结果把 fork 的定制 UI 冲掉了，用户明确否决、又花了 0.7.1~0.7.3 逐组件还原。
- 判断准则：**交互 / 视觉 = fork 优先；功能 / 逻辑 / 数据层 = 上游优先**。两者在同一文件冲突时，在 fork 的交互外壳内实现上游的功能。
- 对「双方都改过」的 UI 组件：以 fork 版为基础，逐处把上游的功能 delta（事件、状态、新分支、新 props）补进去；纯样式冲突保留 fork 的样式。

---

## Remotes & 同步流程

- `origin` = `agegr/pi-web`（上游）；`fork` = `cking000bigdemon/pi-web`（本仓库）。`main` 跟踪 `fork/main`。
- 同步：`git fetch origin` → 看 `git log --oneline main..origin/main` → 按上面的策略合并 → 解决冲突 → 构建 → 发布。
- **必保留**：`package.json` 的 `name`（`@cking000/pi-web`）与 `version`；`next.config.ts` 的 EPERM webpack hook。
- 先用 `comm -12` 求两个合并区间的 changed-file 交集，判断上游**到底**改了哪些文件——上游没动的组件（合并会原样保留 fork 版）无需处理。

---

## Fork UI 资产（合并时必须保留的交互 / 视觉）

设计语言集中在 `app/globals.css`：变量「值」即 Metro 配色（变量名不变）、`--tile-*` 调色板、`--font-ui`（Segoe UI）、方角、`tileIn/flipY/pulseGlow/dotPulse` keyframes。逐组件标志性元素：

- **MessageView** 工具调用卡 = 3D 悬停翻转活动磁贴（成功 teal `#00ABA9` / 错误 crimson `#A20025`，白字，运行中 `dotPulse` 脉冲点，背面露结果摘要 `✓ N 行`）。
- **ChatWindow** 新会话空状态（`isEmptyNew`）= 大号 π masthead（`clamp()` 钴蓝 π + 「Pi Agent」+ 打字机 + 居中输入 + 底部版本/快捷键页脚）。
- **AppShell**：空状态 = 两个 ghost-π 屏（选了 cwd ② / 冷启动无 cwd ①，`clamp()` π 用 `var(--bg-selected)`）；顶栏统计条 = `statTile` 磁贴；Models/Skills 导航键 = `#008A00` / `#D80073` 实心磁贴。
- **ChatInput**：steer/followup/Stop = 实心磁贴（`#F0A30A` / `#647687` / `#E51400`）；流式可 steer 时输入框边框 `#F0A30A`；slash 命令面板按可用空间上下翻转（避免新会话居中布局下顶部被顶栏遮）。
- **SessionSidebar** = 会话磁贴墙（橙 `#FA6800` 选中 cwd、绿/钢蓝刷新键、`var(--accent)` 标题）。
- **全局**：内联数值 `borderRadius` 一律 `0`（方角），但小圆状态点保留 `borderRadius: "50%"`。清扫圆角时 grep 全量 `borderRadius`（字符串型如 `"0 9px 9px 0"` 会漏过纯数字模式），仅豁免 `"50%"`；SkillsConfig/PluginsConfig 的两个 pill 拨动开关（`borderRadius: 11`）是待定项，暂保留圆角。上游新 UI 的语义色改用 `--tile-*` 调色板（如 `#f59e0b`→`--tile-amber`、`#22c55e`→`--tile-green`），破坏性/次要按钮用实心磁贴（`--tile-red`/`--tile-steel` 白字）。

---

## 操作要点

- **构建 / 发布**：`npm version patch --no-git-tag-version` → `npm run build`（`NEXT_PUBLIC_APP_VERSION` 取自 package.json，**改外观也要 rebuild** 才能刷新应用内版本号）→ commit → `git push fork main` → `npm publish --access public`（需 `~/.npmrc` 里的 2FA-bypass / Automation token）。桌面端经应用内「检查更新」拉 `@cking000/pi-web@latest`。纯 pi-web 改动**只需 publish**，无需 `npm run dist` 重打包桌面端。
- **CRLF 陷阱（重要）**：比对内容用 `git diff <rev> -- <file>`（会规范化换行）。**不要**用 `diff <(git show rev:file) file`——git 输出 LF、工作树是 CRLF（autocrlf），会把整文件误报成「全变」。
