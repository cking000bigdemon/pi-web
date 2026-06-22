import type { SessionManager, SettingsManager, AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export interface ContextUsage {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
}

export interface ModelLike {
  id: string;
  provider: string;
}

export interface ToolInfo {
  name: string;
  description: string;
}

export interface NavigateTreeResult {
  editorText?: string;
  cancelled: boolean;
  aborted?: boolean;
}

export type ExtensionModeName = "tui" | "rpc" | "json" | "print";

export interface ExtensionUIDialogOptionsLike {
  signal?: AbortSignal;
  timeout?: number;
}

// pi-web's web implementation of the SDK ExtensionUIContext. Methods we can't
// honor in a browser (TUI component factories, raw terminal input, themes) are
// declared with loose types and implemented as safe no-ops. This is our own
// boundary type — the SDK only sees it via AgentSessionLike.bindExtensions.
export interface WebExtensionUIContext {
  select(title: string, options: string[], opts?: ExtensionUIDialogOptionsLike): Promise<string | undefined>;
  confirm(title: string, message: string, opts?: ExtensionUIDialogOptionsLike): Promise<boolean>;
  input(title: string, placeholder?: string, opts?: ExtensionUIDialogOptionsLike): Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
  onTerminalInput(handler: (data: string) => unknown): () => void;
  setStatus(key: string, text: string | undefined): void;
  setWorkingMessage(message?: string): void;
  setWorkingVisible(visible: boolean): void;
  setWorkingIndicator(options?: unknown): void;
  setHiddenThinkingLabel(label?: string): void;
  setWidget(key: string, content: string[] | ((...args: unknown[]) => unknown) | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
  setFooter(factory: ((...args: unknown[]) => unknown) | undefined): void;
  setHeader(factory: ((...args: unknown[]) => unknown) | undefined): void;
  setTitle(title: string): void;
  custom(factory: (...args: unknown[]) => unknown, options?: unknown): Promise<unknown>;
  pasteToEditor(text: string): void;
  setEditorText(text: string): void;
  getEditorText(): string;
  editor(title: string, prefill?: string): Promise<string | undefined>;
  addAutocompleteProvider(factory: unknown): void;
  setEditorComponent(factory: unknown): void;
  getEditorComponent(): unknown;
  readonly theme: unknown;
  getAllThemes(): { name: string; path: string | undefined }[];
  getTheme(name: string): unknown;
  setTheme(theme: unknown): { success: boolean; error?: string };
  getToolsExpanded(): boolean;
  setToolsExpanded(expanded: boolean): void;
}

export interface SessionStatsResult {
  sessionFile: string | undefined;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
  contextUsage?: ContextUsage;
}

export interface AgentSessionLike {
  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  readonly isStreaming: boolean;
  readonly isCompacting: boolean;
  readonly autoCompactionEnabled: boolean;
  readonly autoRetryEnabled: boolean;
  readonly model: ModelLike | undefined;
  readonly modelRegistry: { find: (provider: string, modelId: string) => ModelLike | undefined };
  readonly sessionManager: SessionManager;
  readonly settingsManager: SettingsManager;
  readonly agent: { state?: { systemPrompt?: string; thinkingLevel?: string } };

  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  prompt(text: string, options?: { images?: Array<{ type: "image"; data: string; mimeType: string }> }): Promise<void>;
  abort(): Promise<void>;
  setModel(model: ModelLike): Promise<void>;
  navigateTree(targetId: string, options?: { summarize?: boolean }): Promise<NavigateTreeResult>;
  setThinkingLevel(level: string): void;
  compact(customInstructions?: string): Promise<unknown>;
  setAutoCompactionEnabled(enabled: boolean): void;
  setAutoRetryEnabled(enabled: boolean): void;
  steer(text: string, images?: Array<{ type: "image"; data: string; mimeType: string }>): Promise<void>;
  followUp(text: string, images?: Array<{ type: "image"; data: string; mimeType: string }>): Promise<void>;
  getAllTools(): ToolInfo[];
  getActiveToolNames(): string[];
  setActiveToolsByName(names: string[]): void;
  abortCompaction(): void;
  getContextUsage(): ContextUsage | undefined;

  // Host-level slash command support (issue #68)
  reload(): Promise<void>;
  getSessionStats(): SessionStatsResult;
  getLastAssistantText(): string | undefined;
  setSessionName(name: string): void;
}

// Extension UI bridge (issue #68 follow-up): the subset used to bind a web UI context.
// Kept separate from AgentSessionLike because the SDK's real bindExtensions takes a
// broad ExtensionBindings whose ExtensionUIContext (with TUI-component factory overloads)
// is contravariantly incompatible with our loosely-typed WebExtensionUIContext — declaring
// it on AgentSessionLike would break the structural assignment from the SDK's AgentSession.
// rpc-manager casts the session to this only for the bind call.
export interface BindableSession {
  bindExtensions(bindings: { uiContext: WebExtensionUIContext; mode?: ExtensionModeName }): Promise<void>;
}
