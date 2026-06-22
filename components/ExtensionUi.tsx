"use client";

// Extension UI bridge rendering (issue #68 follow-up).
//
// Server-side extension/package commands call ctx.ui.* (select/confirm/input/editor,
// notify, setStatus, setWidget, setTitle). Those calls are bridged to the browser over
// the SSE event stream and surfaced here:
//   - ExtensionDialog : modal for the four interactive dialogs (round-trips a response)
//   - ExtensionWidgets: setWidget string-array widgets + setStatus chips, above the input
//   - ExtensionToasts : notify() messages as auto-dismissing toasts
//
// TUI-only capabilities (custom components, footer/header factories, themes) have no web
// equivalent and are no-ops on the server side, so nothing renders for them here.

import { useEffect, useRef, useState } from "react";
import type {
  ExtensionUiDialog,
  ExtensionUiResponse,
  ExtensionUiStatus,
  ExtensionUiToast,
  ExtensionUiWidget,
} from "@/lib/types";

const PANEL_MAX_WIDTH = 820;

// ============================================================================
// Dialog (select / confirm / input / editor)
// ============================================================================

export function ExtensionDialog({
  dialog,
  onRespond,
}: {
  dialog: ExtensionUiDialog;
  onRespond: (id: string, response: ExtensionUiResponse) => void;
}) {
  const [text, setText] = useState(dialog.prefill ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);
  const [remaining, setRemaining] = useState<number | null>(
    dialog.timeout ? Math.ceil(dialog.timeout / 1000) : null,
  );

  // Autofocus the relevant control on mount.
  useEffect(() => {
    if (dialog.method === "input") inputRef.current?.focus();
    else if (dialog.method === "editor") textareaRef.current?.focus();
    else firstButtonRef.current?.focus();
  }, [dialog.method]);

  // Countdown display for timeouts (the server owns the actual auto-dismiss).
  useEffect(() => {
    if (!dialog.timeout) return;
    const t = setInterval(() => {
      setRemaining((r) => (r == null ? r : Math.max(0, r - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [dialog.timeout]);

  const cancel = () => onRespond(dialog.id, { cancelled: true });
  const submitValue = () => onRespond(dialog.id, { value: text });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          boxShadow: "0 8px 32px rgba(0,0,0,0.32)",
          overflow: "hidden",
          fontFamily: "var(--font-mono)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-panel)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1, minWidth: 0, wordBreak: "break-word" }}>
            {dialog.title || "Extension"}
          </span>
          {remaining != null && (
            <span style={{ fontSize: 11, color: "var(--text-dim)", flexShrink: 0 }}>{remaining}s</span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {dialog.method === "select" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(dialog.options ?? []).map((opt, i) => (
                <button
                  key={`${opt}-${i}`}
                  ref={i === 0 ? firstButtonRef : undefined}
                  onClick={() => onRespond(dialog.id, { value: opt })}
                  style={optionButtonStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-panel)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  {opt}
                </button>
              ))}
              {(dialog.options ?? []).length === 0 && (
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>（无可选项）</span>
              )}
            </div>
          )}

          {dialog.method === "confirm" && (
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {dialog.message}
            </div>
          )}

          {dialog.method === "input" && (
            <input
              ref={inputRef}
              value={text}
              placeholder={dialog.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitValue(); }
              }}
              style={fieldStyle}
            />
          )}

          {dialog.method === "editor" && (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitValue(); }
              }}
              rows={8}
              style={{ ...fieldStyle, resize: "vertical", minHeight: 140, lineHeight: 1.5 }}
            />
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            padding: "10px 14px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-panel)",
          }}
        >
          {dialog.method === "editor" && (
            <span style={{ fontSize: 11, color: "var(--text-dim)", marginRight: "auto" }}>Ctrl/⌘+Enter 提交</span>
          )}
          {dialog.method === "confirm" ? (
            <>
              <button onClick={() => onRespond(dialog.id, { confirmed: false })} style={secondaryButtonStyle}>取消</button>
              <button ref={firstButtonRef} onClick={() => onRespond(dialog.id, { confirmed: true })} style={primaryButtonStyle}>确认</button>
            </>
          ) : dialog.method === "select" ? (
            <button onClick={cancel} style={secondaryButtonStyle}>取消</button>
          ) : (
            <>
              <button onClick={cancel} style={secondaryButtonStyle}>取消</button>
              <button onClick={submitValue} style={primaryButtonStyle}>确认</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const optionButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--text)",
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "background 0.12s, border-color 0.12s",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  color: "var(--text)",
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 0,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "7px 16px",
  fontSize: 13,
  fontWeight: 600,
  color: "#fff",
  background: "var(--accent)",
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  fontFamily: "inherit",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "7px 14px",
  fontSize: 13,
  color: "var(--text-muted)",
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 0,
  cursor: "pointer",
  fontFamily: "inherit",
};

// ============================================================================
// Widgets (setWidget string arrays) + statuses (setStatus chips)
// ============================================================================

export function ExtensionWidgets({
  widgets,
  statuses,
}: {
  widgets: ExtensionUiWidget[];
  statuses: ExtensionUiStatus[];
}) {
  if (widgets.length === 0 && statuses.length === 0) return null;
  const above = widgets.filter((w) => w.placement !== "belowEditor");
  const below = widgets.filter((w) => w.placement === "belowEditor");
  const ordered = [...above, ...below];

  return (
    <div style={{ maxWidth: PANEL_MAX_WIDTH, margin: "0 auto", padding: "0 16px 6px", paddingRight: 52 }}>
      {ordered.map((w) => (
        <div
          key={w.key}
          style={{
            marginBottom: 6,
            padding: "6px 10px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {w.lines.map((line, i) => (
            <div key={i}>{line || " "}</div>
          ))}
        </div>
      ))}
      {statuses.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 2 }}>
          {statuses.map((s) => (
            <span
              key={s.key}
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 0,
                padding: "2px 8px",
                fontFamily: "var(--font-mono)",
                whiteSpace: "nowrap",
              }}
            >
              {s.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Toasts (notify)
// ============================================================================

export function ExtensionToasts({
  toasts,
  onDismiss,
}: {
  toasts: ExtensionUiToast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 1100,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ExtensionUiToast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const accent =
    toast.type === "error" ? "#E51400" : toast.type === "warning" ? "#F0A30A" : "var(--accent)";

  return (
    <div
      onClick={() => onDismiss(toast.id)}
      style={{
        pointerEvents: "auto",
        cursor: "pointer",
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 0,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--text)",
        lineHeight: 1.5,
        wordBreak: "break-word",
        fontFamily: "var(--font-mono)",
      }}
    >
      {toast.message}
    </div>
  );
}
