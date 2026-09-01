"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * DockPanel - a dockable window rendered below the file browser in the right
 * panel (vertical split). The host owns the chrome: title bar with close
 * button, and a vertical resize handle. Content is provided by plugins via
 * window.robopi.registerDockPanel().
 */

export const DOCK_MIN_HEIGHT = 160;
export const DOCK_MAX_HEIGHT = 640;
export const DOCK_DEFAULT_HEIGHT = 280;
const DOCK_HEIGHT_STORAGE_KEY = "robopi-dock-height";

export function DockPanel({
  height,
  title,
  onHeightChange,
  onClose,
  children,
}: {
  height: number;
  title: string;
  onHeightChange: (height: number) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [resizing, setResizing] = useState(false);
  const heightRef = useRef(height);
  heightRef.current = height;

  // Persist the height across reloads
  useEffect(() => {
    try {
      window.localStorage.setItem(DOCK_HEIGHT_STORAGE_KEY, String(height));
    } catch {
      /* ignore storage errors */
    }
  }, [height]);

  /** Top-edge handle drag: resize the panel height. */
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startY = e.clientY;
    const startHeight = heightRef.current;

    const move = (ev: MouseEvent) => {
      const delta = startY - ev.clientY; // dragging up grows the panel
      onHeightChange(Math.min(DOCK_MAX_HEIGHT, Math.max(DOCK_MIN_HEIGHT, startHeight + delta)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setResizing(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [onHeightChange]);

  return (
    <div
      role="complementary"
      aria-label={title}
      style={{
        height,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-panel)",
      }}
    >
      {/* Vertical resize handle (top edge) */}
      <div
        onMouseDown={startResize}
        role="separator"
        aria-orientation="horizontal"
        title="拖拽调整工作台高度"
        style={{
          height: 4,
          flexShrink: 0,
          cursor: "row-resize",
          background: resizing ? "var(--accent)" : "transparent",
          transition: "background 0.1s ease",
        }}
      />

      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 28,
          padding: "0 10px",
          flexShrink: 0,
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text)",
          userSelect: "none",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭工作台"
          title="关闭工作台"
          style={{
            border: "none", background: "none", cursor: "pointer", color: "var(--text-dim)",
            fontSize: 14, padding: "2px 6px", borderRadius: 4,
          }}
        >
          ×
        </button>
      </div>

      {/* Plugin-provided content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
    </div>
  );
}
