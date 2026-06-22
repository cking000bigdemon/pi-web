# Pi Agent — Metro 磁贴重做 · 进度锚点

参考: `design-hifi-screens.dc.html` · `design-tile-language.dc.html` · `design-source-calibration.dc.html` · `redesign-brief.md`
原则: **仅视觉层**重做为动态磁贴; 功能集 / API / SSE / 命令 / 数据模型 / 键盘 **1:1 不变**; 品牌名固定 **"Pi Agent"**。
每完成一项: 勾 [x] + 在 dev(`npm run dev` → localhost:30141)验证功能正常。

## 阶段
- [x] 0. 存稿 (3 份 .dc.html → docs/)
- [x] 1. 基础层: globals.css 磁贴 token(沿用变量名,值改 Metro) + `--font-ui`/`--tile-*` + Metro keyframes(tileIn/flipY/pulseGlow/dotPulse); layout.tsx Open Sans + title; "Pi Agent Web"→"Pi Agent"(layout/ChatWindow/SessionSidebar)
- [x] 2. AppShell: 三栏外壳 + 48px 顶栏(主题/Export/Branches/System + 实时统计磁贴条) + 悬浮文件面板开关; 直角化、去边框
- [x] 3. SessionSidebar → 会话磁贴墙(按 cwd 分组; 流式=pulseGlow+dotPulse; 角标消息数; 选中=实心强调) + cwd 选择器 + New/Refresh 操作磁贴 + Explorer + Models/Skills 操作磁贴
- [x] 4. ChatInput: 底部 Metro 命令栏; Send/Steer(amber)/Follow-up(steel)/Stop(red) 方块; 模型/thinking/工具预设/Compact/声音; 占位符词表
- [x] 5. MessageView: 用户=强调色实心块(白字); 助手=面板块+左4px强调竖条; t/s 徽章阈值(≥50 cyan #1BA1E2 / ≥30 green #60A917 / ≥15 amber #F0A30A / <15 red #E51400); 用量页脚 `N in · N out · N cache · $X.XXXX`(toFixed(4)); 思考折叠条; 工具调用=可翻转 teal 磁贴(错误=crimson)
- [x] 6. MarkdownBody/CodeBlock: 代码块直角、JetBrains Mono、复制; Mermaid 预览/源码; KaTeX 保留
- [x] 7. FileViewer/TabBar/FileExplorer: 直角化; watch 绿点; Source/Diff(Myers, +绿/−红); Tab 选中顶部强调条; 树 @ 引用
- [ ] 8. ModelsConfig: Metro 弹窗; provider 彩色磁贴/列表; Save 绿对勾动画; OAuth 登录流
- [ ] 9. SkillsConfig: Metro 弹窗; project/global 分组; 启停开关; 搜 skills.sh/安装
- [ ] 10. BranchNavigator / ChatMinimap: 分支树 U/A 角色; minimap 细条
- [ ] 11. 移动端 ≤640px: 抽屉 / 英雄 / 全屏文件; 磁贴重排
- [ ] 12. 全屏走查 + 深浅双主题 + commit/push

## 契约红线(每屏都要守住)
命令 POST /api/agent/<id>: prompt/steer/follow_up/abort/fork/navigate_tree/set_model/set_tools/set_thinking_level/compact/abort_compaction/get_tools
SSE /api/agent/<id>/events: agent_start/message_*/tool_execution_*/agent_end/auto_retry_*/(auto_)compaction_*
URL ?session=<id> · 尺寸 sidebar 260 / file 42vw min300 / 移动 ≤640 抽屉280 max85vw / 输入 max-width820 textarea max200

## 验证记录
- iter1 ✓: `npm run dev` boot HTTP 200 (~6s, Turbopack) · `<title>Pi Agent` · 无 stale "Pi Agent Web" · stderr clean。
  - **修了 dev 启动坑**: next.config 加 `turbopack: {}` —— Next 16 默认 Turbopack，与 build 用的 `webpack` 钩子冲突，否则 `next dev` 直接 exit 255 起不来。dev→Turbopack，`build --webpack`→webpack 钩子(nft 修复)各行其道。
- iter2 ✓: AppShell — 顶栏 36→48、图标按钮 44×48、去圆角(borderRadius 9/5→0)、悬浮文件开关→accent 实心白、统计条→Metro 实时磁贴条(in/out steel · cost green · ctx 阈值色 #E51400/#F0A30A/#60A917)+ chat-stats-center(移动端隐藏); dev 200, stderr clean。
  - **待办**: iter3 后做一次真实截图走查(冷启动屏可无后端渲染),避免盲改累积视觉 bug。
- iter3a ✓: SessionSidebar chrome — 全去圆角(borderRadius 5/6/7/8→0)、New→橙磁贴(#FA6800,无 cwd 则 bg-panel muted)、Refresh→钢磁贴(#647687,done 绿 #60A917)、白字白图标、hover→opacity; dev 200。
  - **3b 留待**: 会话行(SessionItem 872+)→ 会话磁贴墙(按 cwd 分组、流式 pulseGlow、消息数角标、选中实心强调); Models/Skills(在 AppShell 侧栏 footer)→ emerald/magenta 磁贴; 顺带查左下角 "N" 圆圈元素。
- **截图走查 ✓ (iter3a 后)**: preview MCP 起 pi-web(`.claude/launch.json` 加了 "pi-web" 配置,serverId 复用)+ 切 dark。确认: bg #0A0A0A、48px 顶栏、"Pi Agent" 字标、New 橙磁贴、悬浮文件开关蓝 accent、英雄区/输入区正常、console 零报错。**复用方式**: preview_start name="pi-web" → 默认 light,需 eval 设 localStorage pi-theme=dark 看深色。左下 "N" 圆圈 = **Next.js dev 指示器**(非 app 元素,prod 不出现,排除)。
- iter3b ✓: SessionItem 选中态→实心 accent 磁贴 + 白字(保留树/重命名/删除/折叠/hover 全逻辑); Models/Skills footer(AppShell)→ emerald #008A00 / magenta #D80073 实心磁贴。截图确认双色 footer 磁贴; console 零报错。选中态 accent 为简单条件式(编译验证)。
- iter4 ✓: ChatInput — 全去圆角(5/6/8/9/14→0)、输入卡片→panel 扁平去阴影、Send 实心 accent(输入后转蓝)、Steer→amber #F0A30A(深字)、Follow-up→steel #647687、Stop→red #E51400 实心白字。截图确认: 卡片直角 + preview_fill 打字后 Send 转 accent 蓝 + 功能正常; console 零报错。
- iter5 ✓: MessageView — 全去圆角(12/7/6/5/4→0); 用户消息=实心 accent 块白字; Thinking=扁平 strip; t/s 徽章 #1BA1E2/#60A917/#F0A30A/#E51400; 工具调用头→实心 teal #00ABA9 / crimson #A20025 磁贴白字(展开 input/result 保留 bg-subtle/bg 深底可读); 用量页脚 toFixed(4) 本就对。**截图加载真实会话确认**: 用户蓝块/Thinking strip/选中磁贴/IN-OUT 统计条全对, console 零报错。
  - **延后 refinement**: 助手消息 panel 块 + 左 4px accent 竖条容器(设计要,目前裸 markdown 也干净); 工具磁贴翻转动画(目前静态磁贴头); 速率徽章/工具 tile 真流式态未截到(条件式编译验证)。
- iter6 ✓: MarkdownBody/CodeBlock — 去圆角(inline code 3 / Mermaid 按钮 4 / Mermaid+CodeBlock 容器 6 → 0)。JetBrains Mono/行号/复制/语法高亮/Mermaid 预览-源码/KaTeX 全保留。纯样式, console 零报错。
- iter7 ✓: TabBar 高 36→48 + **活动 Tab 顶部 2px accent 条** + 关闭按钮去圆角; FileViewer 去圆角(Source/Diff/wrap/HTML/MD 切换 5→0); FileExplorer 去圆角(树行/@引用 4→0)。**截图(点开 AGENTS.md)确认**: Tab accent 条 + 状态栏绿 🟢 live 点 + Preview 切换 + markdown 预览全对; 开文件功能正常; console 零报错。
