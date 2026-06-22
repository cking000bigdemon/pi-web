# Pi Agent — 前端 UI 重做设计简报（Windows Phone 10 动态磁贴风格）

> 用途：把本文件**整段复制**给 Claude design / 其它设计工具，作为重做 Pi Agent 前端 UI 的初始提示词。
> 目标：在 **1:1 保留全部功能与后端契约**的前提下，把视觉与交互层重做为 **Windows Phone 10 动态磁贴（Metro / Live Tiles）风格**。
> 品牌名统一为 **Pi Agent**（去掉旧名 "Pi Agent Web" 里的 "Web"）。
> 来源：基于现有 pi-web 前端源码逐组件还原（`components/` + `app/` + `hooks/useAgentSession.ts` + `app/globals.css`）。

---

## 功能点速览（redesign 必须全部保留）

| 区域 | 功能点 |
|---|---|
| **三栏布局** | 左会话栏(260px,可折叠/移动端抽屉) · 中对话区 · 右文件面板(42vw,可折叠/移动端全屏) · 36px 顶栏 · 悬浮文件面板开关 |
| **顶栏** | 侧栏开关 · 主题切换 · Export · Branches 下拉 · System(系统提示)下拉 · 右侧 token/费用/上下文用量统计 |
| **会话栏** | Pi 标题 · New/Refresh · cwd 选择器(最近5个+默认+自定义路径校验) · 会话列表(按 cwd 过滤、分叉树、相对时间、消息数、选中态) · 重命名/删除(行内确认) · Explorer 文件树 · 底部 Models/Skills |
| **对话区** | 空态(π Logo + Typewriter 标语) · 实时流式 · "Waiting/Running tool/Thinking" 阶段提示 · 图片拖拽上传 · 右侧 minimap · 完成提示音 |
| **输入控制条** | 自增长 textarea · Enter 发送/Shift+Enter 换行/IME 兼容 · 图片附件(选择/粘贴/拖拽+缩略图) · Send · 流式时 Steer/Follow-up/Stop · 模型选择 · thinking 级别 · 工具预设(off/default/full) · Compact · 声音开关 · 重试横幅 |
| **消息渲染** | 用户消息(图片网格、Copy/Edit-from-here/New-session) · 助手消息(模型名、流式 token、t/s 速率徽章) · Markdown(GFM/表格/KaTeX) · 代码块(语法高亮+复制) · Mermaid(预览/源码) · Thinking 折叠块 · 工具调用(输入 JSON+结果、错误态、时长) · 用量页脚 |
| **右侧文件面板** | 多标签 Tab · 文本(语法高亮/Source-Diff/wrap/HTML预览/MD预览) · Myers diff · 图片 · 音频 · PDF/DOCX · 实时 watch(SSE) |
| **弹窗** | Models 配置(OAuth/API Key/自定义 provider、模型增删、连通性测试、保存、provider 图标) · Skills(project/global 分组、启停、搜索 skills.sh、安装) |
| **分支/分叉** | BranchNavigator(分支树、U/A 角色、点击切支) · Edit-from-here(navigate_tree) · New-session(fork) |
| **状态** | loading/streaming/idle/empty/error/disabled/success-toast 全套 |
| **主题** | 浅+深双色 · 个性强调色 · 一组动效 |

---

# 设计任务：把 "Pi Agent" 前端 UI 重做成动态磁贴风格

## 背景
Pi Agent 是 **"pi" 编程智能体的网页操作界面**：浏览历史会话、与智能体**实时流式对话**、对会话**分叉(fork)/分支导航(branch)**、切换模型/思考强度/工具集、浏览并预览工作目录(cwd)下的文件。技术栈 **Next.js 16 (App Router) + React 19**，整个应用是**单路由 SPA**。
现有 UI 是「极简等宽开发者工具」气质；**本次要把它整体重做为 Windows Phone 10 / Windows 10 开始屏幕的「动态磁贴（Live Tiles / Metro / Modern UI）」设计语言**。

## 你的任务
在**完整保留下方全部功能与交互**的前提下，用**动态磁贴设计语言**重做视觉与交互层。**功能集、后端 API / SSE 契约、数据模型、键盘行为必须 1:1 保留**。先产出整体磁贴设计语言 + 各屏高保真稿，再逐组件给出可落地的 React/Next 实现（组件边界与 props 尽量兼容现有 hooks，以便直接替换）。

---

## ★ 设计语言：Windows Phone 10 动态磁贴（Metro / Live Tiles）

这是本次重做的**核心视觉方向，凌驾于下文功能点里提到的任何旧造型之上**。

### 核心理念
- **内容即界面**：去掉一切 1px 描边、卡片阴影、圆角气泡。**磁贴是直角矩形、纯色块、无边框无阴影**；层级靠颜色、留白、字号，而非线框。
- **磁贴网格 (Tiles)**：界面主结构由矩形磁贴拼成的网格。磁贴尺寸沿用 WP 规范——**小 (1×1)**、**中 (2×2)**、**宽 (4×2)**、**大 (4×4)**。磁贴 = 纯强调色背景 + 白色图标/文字 + 左下角标题，右上角可放角标(计数/状态点)。
- **动态 / Live**：磁贴随实时数据更新并带**翻转(flip)/滑入**动画——这是"动态磁贴"的灵魂，要充分利用本产品天然的实时数据：
  - **会话磁贴**：显示标题、消息数、相对时间；**流式运行中的会话 = 磁贴脉冲/翻面显示 "running…" + 实时 token**。
  - **统计磁贴**：input/output/cache token、费用、上下文用量百分比**实时跳动**（>90% 红、>70% 黄）。
  - **工具/子代理磁贴**：显示当前运行中的工具数 / 子代理数。
- **导航模式**：可采用 **Panorama**（横向大背景平移、标题与磁贴溢出屏幕暗示更多）与 **Pivot**（顶部大字号 tab、左右滑动切换）在「会话 / 文件 / Models / Skills」等大区间切换。

### 配色（Windows Phone 个性色调色板）
- **磁贴是画面唯一的颜色来源**，高饱和纯色：cobalt `#0050EF`、cyan `#1BA1E2`、teal `#00ABA9`、lime `#A4C400`、green `#60A917`、emerald `#008A00`、magenta `#D80073`、crimson `#A20025`、red `#E51400`、orange `#FA6800`、amber `#F0A30A`、violet `#6A00FF`、mauve `#76608A`、steel `#647687`。
- **背景**：深色主题用近黑 `#000000`/`#0A0A0A`（WP 经典）；浅色主题用近白 `#FFFFFF`/`#F2F2F2`。背景**不放颜色**，颜色全在磁贴上。
- **强调色（个性色）可让用户选**（沿用 WP "Accent color" 体验）；语义保留：成功绿、错误红、警告黄、上下文红/黄阈值。
- 文字：深色主题白/浅灰，浅色主题近黑；磁贴内文字恒为白色。

### 排版
- 主字体 **Segoe UI**，无 Segoe 时用开源替身 **Selawik**，回退 `'Segoe UI', Selawik, system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`。
- **大号细体标题**（Segoe UI Light，section header 32–48px，字重 300）；正文 14–15px 常规；节标题可用大字号或 ALL-CAPS（如全大写小标题）。
- **代码块、文件路径、终端输出仍用等宽**（`'Cascadia Code','JetBrains Mono','Consolas',ui-monospace`）——磁贴风不影响代码可读性。
- 标题允许**裁切/溢出**到屏幕边缘（Metro 标志性手法）。

### 动效
- **磁贴翻转 (flip)**：动态磁贴正反面交替（如会话磁贴 正面=标题，背面=最近消息预览/运行状态）。
- **Tilt 按压**：点击磁贴时整块做 3D 透视下压（perspective + rotateX/Y 朝按压点倾斜），松开回弹——WP 标志性触感。
- **交错入场 (staggered)**：磁贴网格逐块快速滑入/淡入（每块延迟 ~30–50ms）。
- 过渡干脆利落：`ease-out` ~250–350ms；尊重 `prefers-reduced-motion`。

### 图标
- UI 图标改用 **Segoe MDL2 / Fluent System Icons** 风格的线性图标（白色/`currentColor`），替换原手写 Lucide svg；需覆盖：发送/停止/复制/分叉/分支/树/编辑/刷新/设置/工具/思考/眼睛/主题/面板/箭头/附件/搜索/加号/对勾/音量 等全部语义。
- Provider 图标可保留 **@lobehub/icons**；文件类型图标可保留或换 Fluent 文件图标。

### 各界面 → 磁贴映射（关键）
- **会话侧栏 → 会话磁贴墙**：每个会话一块中/宽磁贴（标题 + 消息数角标 + 相对时间 + 流式状态），按 cwd 分组；**分叉**用磁贴分组/角标或连线表达；New / cwd / Models / Skills / Refresh = 顶部一排**操作磁贴**（各自个性色）。
- **顶栏统计 → 一排小动态磁贴**：input / output / cache / cost / context 各一块小磁贴，数字实时跳动；主题切换、Export、Branches、System 作为操作磁贴/按钮。
- **对话区**：保留对话流，但用 Metro 扁平块——**用户消息 = 强调色实心直角块(白字)**，**助手消息 = 面板色直角块 + 左侧强调竖条**；**工具调用 = 可翻转磁贴**（正面工具名+状态点，翻面看输入/输出）；思考块=可折叠扁平条。
- **输入控制条**：底部一条 Metro 命令栏；Send/Steer/Follow-up/Stop 为彩色方块按钮；模型/thinking/工具预设为 Metro 下拉或 pivot。
- **右侧文件面板**：Tab = pivot；文件查看器为扁平全幅；Explorer 为 Metro 列表（无树形描边，用缩进 + 图标）。
- **Models / Skills 弹窗**：全屏或大面板的磁贴/列表式 Metro 布局，provider 用彩色磁贴。

---

## 硬约束（不可改）
1. **单路由 SPA**；用 URL `?session=<id>` 同步选中会话。
2. **实时对话走 SSE**(`GET /api/agent/<id>/events`)；命令走 `POST /api/agent/<id>`，必须保留全部命令类型：`prompt / steer / follow_up / abort / fork / navigate_tree / set_model / set_tools / set_thinking_level / compact / abort_compaction / get_tools`。SSE 事件：`agent_start / message_start|update|end / tool_execution_start|end / agent_end / auto_retry_start|end / (auto_)compaction_start|end`。
3. **浅色 + 深色双主题**，通过 CSS 变量切换（保持可换肤）。
4. **品牌名统一为 "Pi Agent"**：字标、英雄区、Typewriter、版本徽章、文档标题一律用 "Pi Agent"（不再出现 "Pi Agent Web"）。
5. **响应式**：≤640px 时——左侧栏→滑入抽屉(带遮罩)、右侧文件面板→全屏或隐藏、顶栏统计→隐藏；磁贴墙在窄屏自动重排列数。
6. 这个前端会被一个 **Electron 桌面壳**包裹，**屏幕最底部会被注入一条状态条**：不要把关键控件死贴最底边，底部留安全余量。
7. 视觉一律遵循上方「★ 设计语言：动态磁贴」——下文功能点里若提到旧造型（圆角/气泡/1px 描边等），以磁贴规范为准覆盖。

## 必须逐一覆盖的功能点
> 以下 A–J 是**功能需求**（每条都要存在）；**凡涉及具体造型一律按上方磁贴设计语言重做**。

### A. 整体布局（填满 100dvh）
- 左**会话侧栏**（桌面 260px 起，可折叠到 0；移动端为滑入抽屉）。可整体改造为磁贴墙。
- 中**对话区**（顶栏 + 消息流 + minimap + 底部输入命令栏）。
- 右**文件面板**（桌面 ~42vw、最小 300px，可折叠；移动端全屏/隐藏）。
- 右上角**悬浮的文件面板开关**（始终可点）。

### B. 顶栏
侧栏开关 · 主题切换（带过渡动画，尊重 `prefers-reduced-motion`）· **Export**（导出会话 HTML，未保存时禁用）· **Branches**（下拉/面板分支树）· **System**（系统提示，存在时高亮）· 右侧**会话统计**（输入/输出/缓存 token、费用 `$X.XX`、上下文用量 `NN% / 200k`，阈值变色；移动端隐藏）。→ 全部以动态小磁贴/Metro 按钮表达。

### C. 会话侧栏
- **Pi Agent 字标**（点击可保留一个轻量动画，显示版本号 web vX / pi vX）。
- **New**（无 cwd 时禁用）、**Refresh**（成功反馈）。
- **cwd 选择器**：显示缩短路径；下拉含最近 5 个 cwd（选中标记）+「使用默认目录」+「自定义路径…」（行内输入，Enter 经 `/api/cwd/validate` 校验，Esc 取消，含 Checking/错误态）。
- **会话列表 → 磁贴墙**：按当前 cwd 过滤，体现**分叉树**关系；每块显示标题(name / 首条消息 / id) + 相对时间 + 消息数 + 选中态；hover/长按出现**重命名**(行内输入)与**删除**(行内二次确认)。空/加载/错误态。
- **Explorer**：可折叠区，内嵌懒加载**文件树**（dir 展开拉取 `/api/files/<path>?type=list`，hover 出现 `@` 引用按钮，把相对路径以反引号插入输入框）。
- **Models**、**Skills**（无 cwd 禁用）操作磁贴。

### D. 对话区
- **空态/新会话**：大号 **π** 字形 + "Pi Agent" + **Typewriter** 循环标语(带闪烁光标) + 版本徽章 + 居中输入框。
- **流式中**：助手块实时增长；**阶段提示**（"Waiting for model…/Running <tool>…/Thinking…"）；完成时双音提示音(可关)。
- **图片拖拽**：整屏拖放叠层（可用磁贴风的色块/涟漪）。
- **Minimap**（右侧细条，仅在可滚动时）：可拖拽视口、用户/助手消息点、hover 预览，点击/拖拽滚动。

### E. 输入控制条（核心控件）
- 自增长 `textarea`(max ~200px)；**steer/follow-up 模式有视觉区分**。占位符随状态变化（`Message…` / `Agent is running…` / `Steer 立即注入 / Follow-up 排队…`）。
- **Enter 发送 / Shift+Enter 换行**，IME 合成兼容；流式中 Enter 作为 Steer。
- **图片附件**：文件选择 + 粘贴 + 拖拽；缩略图带移除。
- **Send**；流式中显示 **Steer**(打断并立即注入)、**Follow-up**(排队)、**Stop**。
- 控件行：附件 · **模型选择**(按 provider 分组) · **thinking 级别**(auto/off/minimal/low/medium/high/xhigh,各带中文说明) · **工具预设**(off=纯聊天 / default=4 内置 / full=全部内置) · **Compact**(压缩上下文,可停止,含错误提示) · **声音开关**。可现**重试横幅**("Retrying (n/m)… — error")。

### F. 消息渲染
- **用户消息**：强调色实心块，正文 Markdown，图片网格；hover 出现 **Copy**、**Edit from here**(navigate_tree 分支)、**New session**(fork)、时间戳。
- **助手消息**：模型名标签；流式时显示估算 token + **t/s 速率徽章**(速率分级变色)。内容按块渲染：
  - **文本块** → Markdown(react-markdown + GFM + KaTeX)。
  - **代码块** → 语言标签 + 复制 + 语法高亮(浅/深) + 行号（代码区保留等宽）。
  - **Mermaid** → 懒加载，"Preview/Source" 切换。
  - **Thinking 块** → 可折叠,显示推理时长。
  - **工具调用 → 可翻转磁贴/扁平块** → 工具名+参数预览+时长+状态；展开/翻面显示输入 JSON 与配对结果(可滚动,错误态,空显示 `(no output)`)。
  - 页脚：用量行(`N in · N out · N cache · $X`) + Copy + 时间戳。

### G. 右侧文件面板
- **多标签**(图标+文件名,活动态,可关闭,横向滚动)。
- **FileViewer**(按扩展名分派,顶部状态栏含路径/语言/大小/**实时 watch 状态点**)：
  - 文本(语法高亮 + **Source/Diff** 切换 + wrap + HTML Code/Preview 沙箱 iframe + Markdown Preview/Raw)。
  - **Diff**(Myers 行级差异,3 行上下文,折叠未变更段,+/− 标记)。
  - 图片、音频(`<audio>`)、PDF(iframe)、DOCX(沙箱预览,>10MB 提示,带下载)。
  - 空态 "No file open"。

### H. 弹窗
- **Models 配置**：OAuth 订阅 + API Key provider(图标) + 自定义 provider(模型行、`+ model`、推理模型标记) +「+ Add provider」；详情面板(Provider/Model/OAuth/ApiKey)；Cancel + **Save**(成功反馈)。含 **OAuth 登录流**(connecting→粘贴回调 URL / device code / 选项选择 / 进度 / 成功)。读写 `~/.pi/agent/models.json`，支持**连通性测试**。→ Metro 磁贴/列表式。
- **Skills 配置**：按 project/global/path 分组(启停态) +「Add skill」；SkillDetail(来源/路径/**启停开关**/描述) 或 AddSkillPanel(搜 skills.sh、global/project 段控、安装→"✓ Installed")。

### I. 分支 / 分叉
- **BranchNavigator**(下拉/面板)：折叠线性链显示 `+N`，分支树 + **U/A 角色标记** + 当前/在路径/旁支区分 + 截断标签；点击切换分支(navigate_tree)。空态文案。
- 会话**分叉**关系在侧栏磁贴墙体现。

### J. 全套 UI 状态
loading · streaming(动态磁贴脉冲/速率徽章) · idle · empty(多种空态文案 + Typewriter 英雄区) · error(错误态 + 重试横幅 + "Connection lost") · disabled · success/toast(保存反馈、"Copied"、"✓ Installed"、watch 状态、提示音)。

---

## 视觉系统

### 旧 token（功能参考，保留变量名以便换肤，但**取值改为磁贴风**）
变量名沿用：`--bg / --bg-panel / --bg-hover / --bg-selected / --bg-subtle / --border / --text / --text-muted / --text-dim / --accent / --accent-hover / --user-bg / --assistant-bg / --tool-bg / --font-mono`。
> 新主题下：`--bg` = 近黑/近白；`--accent` = 用户选的 WP 个性色；磁贴自身用上面的纯色调色板，不依赖 `--border`（磁贴无边框）。新增建议变量：`--font-ui`(Segoe UI/Selawik)、`--tile-*` 一组磁贴色。

### 旧取值（仅作功能对照，**新设计请用磁贴调色板替换**）
- 浅：`--bg #fff` `--bg-panel #f5f5f5` `--border #e0e0e0` `--text #1a1a1a` `--accent #2563eb`…
- 深：`--bg #1a1a1a` `--bg-panel #242424` `--border #3a3a3a` `--text #e8e8e8` `--accent #60a5fa`…

### 造型（新）
直角磁贴、无圆角(或极小 2px)、无描边、无阴影或仅极淡；层级靠纯色块 + 留白 + 字号；统计数字 `tabular-nums`；磁贴网格间距统一(如 8px gutter)。

---

## 交付物
1. **磁贴设计语言规范**：磁贴尺寸体系(小/中/宽/大)、个性色调色板(浅+深)、字阶(Segoe UI Light 标题 + 正文 + 等宽代码)、间距网格、翻转/tilt/交错动效原则、Fluent 图标集。
2. **各屏高保真稿**：①冷启动空态 ②选了 cwd 无会话(磁贴墙) ③新会话英雄区 ④活动会话(流式中,含工具磁贴/思考块/代码块) ⑤右侧文件面板(文本/Diff/预览) ⑥Models 弹窗 ⑦Skills 弹窗 ⑧移动端(抽屉/全屏文件/磁贴重排)。各动态磁贴给出**正反两面**与运行态。
3. **可落地实现**：按现有组件边界(`AppShell / SessionSidebar / ChatWindow / ChatInput / MessageView / MarkdownBody / FileExplorer / FileViewer / ModelsConfig / SkillsConfig / BranchNavigator / ChatMinimap / TabBar`)给出 React/Next 代码，props 与现有 `hooks/useAgentSession` 及上述 API/SSE 契约兼容，便于直接替换。

## 设计边界
**可以变**：视觉语言（→动态磁贴）、布局比例、组件造型、动效、信息层级呈现、图标库、字体（→Segoe UI/Selawik，代码保留等宽）。
**不能变**：功能集(A–J 每条都要在)、后端 API/SSE/命令契约、数据模型、URL 状态、键盘与 IME 行为、浅/深双主题与可换肤架构、品牌名固定为 "Pi Agent"。

---

## 关键源码文件（设计稿可逐一对照）
- `components/AppShell.tsx` — 三栏外壳、顶栏、共享下拉
- `components/SessionSidebar.tsx` — 会话浏览 + cwd 选择 + Explorer
- `components/ChatWindow.tsx` — 对话编排、Typewriter、阶段提示、拖拽、minimap
- `components/ChatInput.tsx` — 输入与全部控件
- `components/MessageView.tsx` + `MarkdownBody.tsx` — 消息与富文本渲染
- `components/FileExplorer.tsx` / `FileViewer.tsx` / `TabBar.tsx` — 文件树与查看器
- `components/ModelsConfig.tsx` / `SkillsConfig.tsx` — 两个配置弹窗
- `components/BranchNavigator.tsx` / `ChatMinimap.tsx` / `FileIcons.tsx`
- `hooks/useAgentSession.ts` — SSE 流 + 命令契约（前端状态层）
- `app/globals.css` — 主题 token / keyframes / 响应式断点
