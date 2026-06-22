import { randomUUID } from "crypto";
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { cacheSessionPath } from "./session-reader";
import type { AgentSessionLike, BindableSession, ToolInfo, WebExtensionUIContext } from "./pi-types";
import type { SlashCommandSourceInfo } from "./types";

// Fallback for ctx.ui.theme — pi-web has no TUI theme. A Proxy returns "" for any
// property access so extensions that read theme colors degrade instead of crashing.
const THEME_FALLBACK: unknown = new Proxy({}, { get: () => "" });

// ============================================================================
// Types
// ============================================================================

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

type EventListener = (event: AgentEvent) => void;

// ============================================================================
// AgentSessionWrapper
// Wraps AgentSession with the same interface the rest of the app expects
// ============================================================================

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private unsubscribe: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private _alive = true;
  // Extension UI bridge (issue #68 follow-up): pending ui.select/confirm/input/editor
  // requests awaiting a client response, and events emitted before any SSE listener
  // attaches (buffered, then flushed on the first onEvent — covers the new-session race).
  private pendingUiRequests = new Map<string, { resolve: (response: Record<string, unknown>) => void }>();
  private eventBuffer: AgentEvent[] = [];

  constructor(public readonly inner: AgentSessionLike) {}

  get sessionId(): string {
    return this.inner.sessionId;
  }

  get sessionFile(): string {
    return this.inner.sessionFile ?? "";
  }

  isAlive(): boolean {
    return this._alive;
  }

  start(): void {
    this.unsubscribe = this.inner.subscribe((event: AgentEvent) => {
      this.resetIdleTimer();
      for (const l of this.listeners) l(event);
    });
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.destroy(), 10 * 60 * 1000);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    // Flush any events emitted before a listener existed (e.g. extension widgets
    // set during bindExtensions' session_start, or a dialog opened on the first prompt).
    if (this.eventBuffer.length) {
      const buffered = this.eventBuffer;
      this.eventBuffer = [];
      for (const e of buffered) listener(e);
    }
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  /** Emit a wrapper-originated event (UI bridge) to listeners, buffering if none yet. */
  private emitLocal(event: AgentEvent): void {
    this.resetIdleTimer();
    if (this.listeners.length === 0) {
      this.eventBuffer.push(event);
      return;
    }
    for (const l of this.listeners) l(event);
  }

  private resolveUiRequest(id: string, response: Record<string, unknown>): void {
    const pending = this.pendingUiRequests.get(id);
    if (pending) {
      this.pendingUiRequests.delete(id);
      pending.resolve(response);
    }
  }

  /** Mirror of pi's rpc-mode dialog bridge: emit a request, await the client's response. */
  private createDialogPromise<T>(
    opts: { signal?: AbortSignal; timeout?: number } | undefined,
    defaultValue: T,
    request: Record<string, unknown>,
    parse: (response: Record<string, unknown>) => T,
  ): Promise<T> {
    if (opts?.signal?.aborted) return Promise.resolve(defaultValue);
    const id = randomUUID();
    return new Promise<T>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        opts?.signal?.removeEventListener("abort", onAbort);
        this.pendingUiRequests.delete(id);
      };
      const onAbort = () => {
        cleanup();
        this.emitLocal({ type: "extension_ui_dismiss", id });
        resolve(defaultValue);
      };
      opts?.signal?.addEventListener("abort", onAbort, { once: true });
      if (opts?.timeout) {
        timeoutId = setTimeout(() => {
          cleanup();
          this.emitLocal({ type: "extension_ui_dismiss", id });
          resolve(defaultValue);
        }, opts.timeout);
      }
      this.pendingUiRequests.set(id, { resolve: (response) => { cleanup(); resolve(parse(response)); } });
      this.emitLocal({ type: "extension_ui_request", id, ...request });
    });
  }

  /**
   * Build the web ExtensionUIContext bound into the SDK so extension/package commands
   * that call ctx.ui.* work in pi-web. Interactive dialogs (select/confirm/input/editor)
   * round-trip to the browser; notify/setStatus/setWidget/setTitle are fire-and-forget;
   * TUI-only capabilities (component factories, raw terminal input, themes, editor
   * components) degrade to safe no-ops.
   */
  buildUiContext(): WebExtensionUIContext {
    const fire = (request: Record<string, unknown>) =>
      this.emitLocal({ type: "extension_ui_request", id: randomUUID(), ...request });
    return {
      select: (title, options, opts) =>
        this.createDialogPromise<string | undefined>(opts, undefined, { method: "select", title, options, timeout: opts?.timeout },
          (r) => (r.cancelled ? undefined : (r.value as string | undefined))),
      confirm: (title, message, opts) =>
        this.createDialogPromise<boolean>(opts, false, { method: "confirm", title, message, timeout: opts?.timeout },
          (r) => (r.cancelled ? false : Boolean(r.confirmed))),
      input: (title, placeholder, opts) =>
        this.createDialogPromise<string | undefined>(opts, undefined, { method: "input", title, placeholder, timeout: opts?.timeout },
          (r) => (r.cancelled ? undefined : (r.value as string | undefined))),
      editor: (title, prefill) =>
        this.createDialogPromise<string | undefined>(undefined, undefined, { method: "editor", title, prefill },
          (r) => (r.cancelled ? undefined : (r.value as string | undefined))),
      notify: (message, type) => fire({ method: "notify", message, notifyType: type }),
      setStatus: (key, text) => fire({ method: "setStatus", statusKey: key, statusText: text }),
      setWidget: (key, content, options) => {
        // Only the string[] form is renderable in a browser; component factories are ignored.
        if (content === undefined || Array.isArray(content)) {
          fire({ method: "setWidget", widgetKey: key, widgetLines: content, widgetPlacement: options?.placement });
        }
      },
      setTitle: (title) => fire({ method: "setTitle", title }),
      pasteToEditor: (text) => fire({ method: "set_editor_text", text }),
      setEditorText: (text) => fire({ method: "set_editor_text", text }),
      getEditorText: () => "",
      onTerminalInput: () => () => {},
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setFooter: () => {},
      setHeader: () => {},
      custom: async () => undefined,
      addAutocompleteProvider: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      get theme() { return THEME_FALLBACK; },
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: "Theme switching is not supported in pi-web" }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => {},
    };
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    this.resetIdleTimer();
    const type = command.type as string;

    switch (type) {
      case "prompt": {
        // Fire and forget — events come via subscribe. Extension commands and
        // input-handled prompts resolve without running the agent (no agent_start/
        // agent_end), so emit prompt_settled when prompt() settles to let the client
        // reset its optimistic running state. For real prompts, agent_end fires first
        // (client already reset) and this is an idempotent no-op. A rejection (e.g. no
        // model/auth) carries the error so the client can surface it.
        const promptImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        this.inner.prompt(command.message as string, promptImages?.length ? { images: promptImages } : undefined)
          .then(() => this.emitLocal({ type: "prompt_settled" }))
          .catch((err: unknown) => this.emitLocal({ type: "prompt_settled", error: err instanceof Error ? err.message : String(err) }));
        return null;
      }

      case "abort":
        await this.inner.abort();
        return null;

      case "get_state": {
        const model = this.inner.model;
        const contextUsage = this.inner.getContextUsage();
        return {
          sessionId: this.inner.sessionId,
          sessionFile: this.inner.sessionFile ?? "",
          isStreaming: this.inner.isStreaming,
          isCompacting: this.inner.isCompacting,
          autoCompactionEnabled: this.inner.autoCompactionEnabled,
          autoRetryEnabled: this.inner.autoRetryEnabled,
          model: model ? { id: model.id, provider: model.provider } : undefined,
          messageCount: 0,
          pendingMessageCount: 0,
          contextUsage: contextUsage
            ? { percent: contextUsage.percent, contextWindow: contextUsage.contextWindow, tokens: contextUsage.tokens }
            : null,
          systemPrompt: this.inner.agent.state?.systemPrompt ?? "",
          thinkingLevel: this.inner.agent.state?.thinkingLevel ?? "off",
        };
      }

      case "set_model": {
        const { provider, modelId } = command as { provider: string; modelId: string };
        const registry = this.inner.modelRegistry;
        const model = registry.find(provider, modelId);
        if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
        await this.inner.setModel(model);
        return { id: model.id, provider: model.provider };
      }

      case "fork": {
        const entryId = command.entryId as string;
        const sessionManager = this.inner.sessionManager;
        const currentSessionFile = this.inner.sessionFile;

        if (!sessionManager.isPersisted()) return { cancelled: true };
        if (!currentSessionFile) throw new Error("Persisted session is missing a session file");

        const entry = sessionManager.getEntry(entryId);
        if (!entry) throw new Error("Invalid entry ID for forking");

        const sessionDir = sessionManager.getSessionDir();
        let newSessionFile: string;

        if (!entry.parentId) {
          // Fork before the first message: create an empty session linked to this one
          const newManager = SessionManager.create(sessionManager.getCwd(), sessionDir);
          newManager.newSession({ parentSession: currentSessionFile });
          newSessionFile = newManager.getSessionFile() as string;
        } else {
          // Fork after some history: copy path up to (but not including) the fork point
          const sourceManager = SessionManager.open(currentSessionFile, sessionDir);
          const forkedPath = sourceManager.createBranchedSession(entry.parentId);
          if (!forkedPath) throw new Error("Failed to create forked session");
          newSessionFile = forkedPath;
        }

        const newSessionId = SessionManager.open(newSessionFile, sessionDir).getSessionId();
        cacheSessionPath(newSessionId, newSessionFile);
        this.destroy();
        return { cancelled: false, newSessionId };
      }

      case "navigate_tree": {
        const result = await this.inner.navigateTree(command.targetId as string, {});
        return { cancelled: result.cancelled };
      }

      case "set_thinking_level": {
        const level = command.level as string;
        this.inner.setThinkingLevel(level);
        // setThinkingLevel clamps xhigh→high for models where supportsXhigh()===false.
        // If the model has DeepSeek thinking compat (reasoningEffortMap maps xhigh→max),
        // force the state back so the compat layer can use it correctly.
        if (level === "xhigh" && (this.inner.model as { compat?: { thinkingFormat?: string } } | null)?.compat?.thinkingFormat === "deepseek" && this.inner.agent?.state) {
          this.inner.agent.state.thinkingLevel = "xhigh";
        }
        return null;
      }

      case "compact": {
        // pi's compact() does not guard against empty messagesToSummarize — use findCutPoint
        // to pre-check and throw a clean error instead of generating a useless empty summary.
        const { findCutPoint, DEFAULT_COMPACTION_SETTINGS } = await import("@earendil-works/pi-coding-agent");
        const pathEntries = this.inner.sessionManager.getBranch() as Array<{ type: string }>;
        const settings = { ...DEFAULT_COMPACTION_SETTINGS, ...this.inner.settingsManager.getCompactionSettings() };
        let prevCompactionIndex = -1;
        for (let i = pathEntries.length - 1; i >= 0; i--) {
          if (pathEntries[i].type === "compaction") { prevCompactionIndex = i; break; }
        }
        const boundaryStart = prevCompactionIndex + 1;
        const cutPoint = findCutPoint(pathEntries as never, boundaryStart, pathEntries.length, settings.keepRecentTokens);
        const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex;
        if (historyEnd <= boundaryStart) {
          throw new Error("Conversation too short to compact");
        }
        const result = await this.inner.compact(command.customInstructions as string | undefined);
        return result;
      }

      case "set_auto_compaction": {
        this.inner.setAutoCompactionEnabled(command.enabled as boolean);
        return null;
      }

      case "steer": {
        const steerImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        await this.inner.steer(command.message as string, steerImages?.length ? steerImages : undefined);
        return null;
      }

      case "follow_up": {
        const followImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        await this.inner.followUp(command.message as string, followImages?.length ? followImages : undefined);
        return null;
      }

      case "get_tools": {
        const all: ToolInfo[] = this.inner.getAllTools();
        const active = new Set<string>(this.inner.getActiveToolNames());
        return all.map((t) => ({
          name: t.name,
          description: t.description,
          active: active.has(t.name),
        }));
      }

      case "set_tools": {
        this.inner.setActiveToolsByName(command.toolNames as string[]);
        return null;
      }

      case "abort_compaction": {
        this.inner.abortCompaction();
        return null;
      }

      case "set_auto_retry": {
        this.inner.setAutoRetryEnabled(command.enabled as boolean);
        return null;
      }

      // ── Host-level slash command support (issue #68) ──
      case "reload": {
        // /reload — reload extensions, skills, prompts, themes, keybindings
        await this.inner.reload();
        return null;
      }

      case "get_session_stats": {
        // /session — session info and stats
        return this.inner.getSessionStats();
      }

      case "get_last_assistant_text": {
        // /copy — last assistant message text (client writes it to the clipboard)
        return { text: this.inner.getLastAssistantText() ?? "" };
      }

      case "set_session_name": {
        // /name <text> — set the session display name
        this.inner.setSessionName(command.name as string);
        return null;
      }

      case "extension_ui_response": {
        // Client's answer to a ctx.ui.select/confirm/input/editor request
        this.resolveUiRequest(command.id as string, command as Record<string, unknown>);
        return null;
      }

      default:
        throw new Error(`Unsupported command: ${type}`);
    }
  }

  destroy(): void {
    if (!this._alive) return;
    this._alive = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.unsubscribe?.();
    this.onDestroyCallback?.();
  }
}

// ============================================================================
// Session registry
// ============================================================================

declare global {
  var __piSessions: Map<string, AgentSessionWrapper> | undefined;
  var __piStartLocks: Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> | undefined;
  var __piCommandsCache: Map<string, { ts: number; commands: SlashCommandSourceInfo[] }> | undefined;
}

function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__piSessions) {
    globalThis.__piSessions = new Map();
    const cleanup = () => globalThis.__piSessions?.forEach((s) => s.destroy());
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__piSessions;
}

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> {
  if (!globalThis.__piStartLocks) globalThis.__piStartLocks = new Map();
  return globalThis.__piStartLocks;
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

/**
 * Get or create an AgentSession for the given session.
 * For new sessions (sessionFile === ""), pi generates its own id.
 * Pass toolNames to pre-configure active tools (empty array = all tools disabled).
 */
export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  toolNames?: string[]
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const registry = getRegistry();
  const locks = getLocks();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) return { session: existing, realSessionId: sessionId };

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    const { SessionManager, getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const agentDir = getAgentDir();

    const sessionManager = sessionFile
      ? SessionManager.open(sessionFile, undefined)
      : SessionManager.create(cwd, undefined);

    // Determine which tools to pass based on requested toolNames.
    // Since v0.68.0, createAgentSession expects string[] tool names instead of Tool[] instances.
    const allCodingToolNames = ["read", "bash", "edit", "write", "grep", "find", "ls"];
    let toolsOption: string[] | undefined;
    if (toolNames !== undefined) {
      // toolNames === [] -> "all off" (an empty allow-list disables every tool).
      // Otherwise DO NOT pass a builtin-only allow-list: passing allCodingToolNames
      // set allowedToolNames to coding builtins only, which filtered every
      // extension/package-provided tool (e.g. subagents, web access) out of the
      // tool registry — so they were unavailable in pi-web sessions even though the
      // `pi` CLI keeps them. Leaving the allow-list unset lets the SDK register all
      // tools (and activate extension tools); we narrow the ACTIVE set below.
      toolsOption = toolNames.length === 0 ? [] : undefined;
    }

    const { session: inner } = await createAgentSession({
      cwd,
      agentDir,
      sessionManager,
      ...(toolsOption !== undefined ? { tools: toolsOption } : {}),
    });

    // If specific tool names were requested (non-empty), set the active tools to the
    // requested builtin coding tools PLUS all extension/package tools, so installed
    // extensions stay usable in pi-web just like in the `pi` CLI.
    if (toolNames && toolNames.length > 0) {
      const extensionToolNames = inner
        .getAllTools()
        .map((t) => t.name)
        .filter((name) => !allCodingToolNames.includes(name));
      inner.setActiveToolsByName([...toolNames, ...extensionToolNames]);
    }

    // When all tools are disabled, clear the system prompt entirely.
    // pi's buildSystemPrompt always produces a non-empty prompt even with no tools;
    // the only way to truly clear it is to call agent.setSystemPrompt directly.
    if (toolNames?.length === 0) {
      inner.agent.state.systemPrompt = "";
    }

    const wrapper = new AgentSessionWrapper(inner);
    wrapper.start();

    // Bind a web UI context so extension/package commands that call ctx.ui.* work
    // in pi-web (issue #68 follow-up). Best-effort: a binding failure must not block
    // session creation — the session simply falls back to no extension UI.
    try {
      // Cast to BindableSession: the SDK's real bindExtensions signature is intentionally
      // not on AgentSessionLike (see pi-types.ts BindableSession).
      await (inner as unknown as BindableSession).bindExtensions({ uiContext: wrapper.buildUiContext(), mode: "rpc" });
    } catch (err) {
      console.error("Failed to bind extension UI context:", err);
    }

    const realSessionId = inner.sessionId as string;
    const realSessionFile = inner.sessionFile as string | undefined;
    if (realSessionFile) cacheSessionPath(realSessionId, realSessionFile);

    wrapper.onDestroy(() => registry.delete(realSessionId));
    registry.set(realSessionId, wrapper);

    return { session: wrapper, realSessionId };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}

/**
 * List extension/skill/prompt slash commands available for a cwd, for autocomplete.
 * Uses DefaultResourceLoader directly (discovery only — does NOT create a session file,
 * unlike createAgentSession), and caches per-cwd for 30s. Built-in commands are merged
 * in on the client (lib/slash-commands.ts).
 */
export async function listSlashCommands(cwd: string): Promise<SlashCommandSourceInfo[]> {
  if (!globalThis.__piCommandsCache) globalThis.__piCommandsCache = new Map();
  const cache = globalThis.__piCommandsCache;
  const now = Date.now();
  const cached = cache.get(cwd);
  if (cached && now - cached.ts < 30_000) return cached.commands;

  const { DefaultResourceLoader, SettingsManager, getAgentDir } = await import("@earendil-works/pi-coding-agent");
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
  await loader.reload();

  const commands: SlashCommandSourceInfo[] = [];
  const seen = new Set<string>();
  for (const ext of loader.getExtensions().extensions) {
    for (const cmd of ext.commands.values()) {
      if (seen.has(cmd.name)) continue;
      seen.add(cmd.name);
      commands.push({ name: cmd.name, description: cmd.description, source: "extension" });
    }
  }
  for (const skill of loader.getSkills().skills) {
    const name = `skill:${skill.name}`;
    if (seen.has(name)) continue;
    seen.add(name);
    commands.push({ name, description: skill.description, source: "skill" });
  }
  for (const tpl of loader.getPrompts().prompts) {
    if (seen.has(tpl.name)) continue;
    seen.add(tpl.name);
    commands.push({ name: tpl.name, description: tpl.description, source: "prompt" });
  }

  cache.set(cwd, { ts: now, commands });
  return commands;
}
