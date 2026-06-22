// Host-level slash command dispatch for pi-web (issue #68).
//
// pi's built-in slash commands (BUILTIN_SLASH_COMMANDS in the SDK) are dispatched
// by the interactive/TUI host, NOT by AgentSession.prompt(). pi-web runs the SDK
// in-process with no host layer, so a typed "/compact" / "/reload" was sent to the
// model as a plain chat message instead of being executed.
//
// This module is pi-web's host layer: it recognizes built-in commands and routes
// them to a GUI / programmatic equivalent, instead of the model. Anything NOT listed
// here is intentionally left untouched and still flows through prompt(), which already
// handles extension commands (pi.registerCommand, e.g. /mcp), /skill:name expansion,
// and file-based prompt templates.

import type { AgentMessage } from "./types";

export interface SlashParse {
  /** Command name without the leading slash (text up to the first whitespace). */
  name: string;
  /** Everything after the command name, trimmed. */
  args: string;
}

/**
 * Parse a raw input as a slash command. Returns null when the text is not a
 * `/<name> [args]` shape (e.g. plain prose, a lone "/", or "/ foo").
 */
export function parseSlashCommand(raw: string): SlashParse | null {
  const text = raw.trimStart();
  if (!text.startsWith("/")) return null;
  const body = text.slice(1);
  const m = body.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  return { name: m[1], args: (m[2] ?? "").trim() };
}

export type SlashCategory = "action" | "gui" | "unsupported";

export interface SlashSpec {
  description: string;
  category: SlashCategory;
  /** Markdown hint shown when a gui/unsupported command is dispatched. */
  hint?: string;
}

/**
 * The built-in commands pi-web's host layer recognizes. Mirrors the SDK's
 * BUILTIN_SLASH_COMMANDS, classified by how pi-web fulfils each one, plus a
 * pi-web-only `/help`.
 */
export const PI_WEB_SLASH_COMMANDS: Record<string, SlashSpec> = {
  // ── Executable in pi-web (mapped to a programmatic equivalent) ──
  compact: { description: "压缩当前会话上下文", category: "action" },
  reload: { description: "重新加载扩展、技能、提示词与键位", category: "action" },
  session: { description: "查看会话信息与统计", category: "action" },
  copy: { description: "复制最近一条助手回复", category: "action" },
  name: { description: "设置会话显示名称（用法：/name <名称>）", category: "action" },
  export: { description: "导出会话为 HTML", category: "action" },
  help: { description: "列出 pi-web 支持的斜杠命令", category: "action" },

  // ── Available via existing GUI controls ──
  model: { description: "切换模型", category: "gui", hint: "请使用输入框左下角的「模型选择器」切换模型。" },
  new: { description: "新建会话", category: "gui", hint: "请使用左侧边栏顶部的「新建会话」入口。" },
  fork: { description: "从某条用户消息派生新会话", category: "gui", hint: "请将鼠标悬停在目标用户消息上，点击「New session」按钮派生。" },
  clone: { description: "复制当前会话", category: "gui", hint: "请使用用户消息上的「New session」（fork）按钮创建独立副本。" },
  tree: { description: "切换会话分支", category: "gui", hint: "请使用消息上的「Edit from here」或分支切换器来导航分支。" },
  resume: { description: "切换到其他会话", category: "gui", hint: "请在左侧边栏的会话列表中点击切换。" },
  settings: { description: "打开设置", category: "gui", hint: "请使用左侧边栏底部的模型 / 技能配置入口。" },
  "scoped-models": { description: "配置可循环切换的模型", category: "gui", hint: "请在「模型选择器」中选择需要的模型。" },

  // ── Not available in pi-web yet (degrade with an explanation) ──
  changelog: { description: "查看更新日志", category: "unsupported" },
  hotkeys: { description: "查看快捷键", category: "unsupported" },
  login: { description: "配置服务商鉴权", category: "unsupported", hint: "请使用 pi-web 的登录界面，或在 pi CLI 中执行 `/login`。" },
  logout: { description: "移除服务商鉴权", category: "unsupported" },
  share: { description: "分享会话为 GitHub gist", category: "unsupported", hint: "可改用 `/export` 导出 HTML。" },
  import: { description: "从 JSONL 导入会话", category: "unsupported" },
  trust: { description: "保存项目信任决定", category: "unsupported" },
  quit: { description: "退出", category: "unsupported", hint: "pi-web 在浏览器中运行，直接关闭标签页即可。" },
};

/** Whether a raw input is one of the built-in commands handled by pi-web's host layer. */
export function isBuiltinSlashCommand(raw: string): boolean {
  const parsed = parseSlashCommand(raw);
  return !!parsed && parsed.name in PI_WEB_SLASH_COMMANDS;
}

/**
 * Build a local, ephemeral "system note" rendered as an assistant message.
 * provider/model are empty so MessageView hides the model label. These notes
 * live only in client state and are never sent to the model or persisted.
 */
export function localNote(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    model: "",
    provider: "",
    timestamp: Date.now(),
  };
}

/** Copy text to the clipboard with a textarea fallback for non-secure contexts. */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}

export interface SessionStatsLike {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  totalMessages: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
  contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null };
}

/** Render `/session` stats as a markdown note. */
export function formatSessionStats(s: SessionStatsLike): string {
  const lines = [
    "⌘ **/session**",
    "",
    `- 消息总数：${s.totalMessages}（用户 ${s.userMessages} · 助手 ${s.assistantMessages}）`,
    `- 工具调用：${s.toolCalls}`,
    `- Token：${s.tokens.total.toLocaleString()}（输入 ${s.tokens.input.toLocaleString()} · 输出 ${s.tokens.output.toLocaleString()} · 缓存读 ${s.tokens.cacheRead.toLocaleString()}）`,
    `- 费用：$${s.cost.toFixed(4)}`,
  ];
  if (s.contextUsage && s.contextUsage.percent != null) {
    const used = s.contextUsage.tokens?.toLocaleString() ?? "?";
    lines.push(`- 上下文占用：${s.contextUsage.percent}%（${used} / ${s.contextUsage.contextWindow.toLocaleString()}）`);
  }
  return lines.join("\n");
}

/** Render the `/help` listing of pi-web's supported slash commands. */
export function formatHelp(): string {
  const names = (cat: SlashCategory) =>
    Object.keys(PI_WEB_SLASH_COMMANDS).filter((n) => PI_WEB_SLASH_COMMANDS[n].category === cat);
  const section = (title: string, cat: SlashCategory) =>
    [`**${title}**`, ...names(cat).map((n) => `- \`/${n}\` — ${PI_WEB_SLASH_COMMANDS[n].description}`)].join("\n");
  return [
    "⌘ **pi-web 斜杠命令**",
    "",
    section("可直接执行", "action"),
    "",
    section("请使用界面控件", "gui"),
    "",
    section("暂不支持", "unsupported"),
    "",
    "_扩展命令（如 `/mcp`）、`/skill:名称` 与提示词模板仍由 pi 正常处理。_",
  ].join("\n");
}
