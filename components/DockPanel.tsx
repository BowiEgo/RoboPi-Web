"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * DockPanel - a dockable side window rendered beside the chat column
 * (VSCode-style docking).
 *
 * Features:
 * - Sits on the left or right of the chat column (default left)
 * - Width is adjustable by dragging the edge handle
 * - Dragging the title bar shows a drop hint (left/right highlight),
 *   releasing docks the panel to that side
 *
 * The content is provided by plugins via window.robopi.registerDockPanel();
 * the host only owns the chrome (position, width, drag interactions).
 */

export type DockSide = "left" | "right";

export const DOCK_MIN_WIDTH = 240;
export const DOCK_MAX_WIDTH = 600;
export const DOCK_DEFAULT_WIDTH = 320;
const DOCK_WIDTH_STORAGE_KEY = "robopi-dock-width";

interface DropZoneProps {
  side: DockSide;
  hint: DockSide | null;
  active: boolean;
}

/** Half-screen drop indicator shown while dragging the title bar. */
function DropZone({ side, hint, active }: DropZoneProps) {
  const highlighted = active && hint === side;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "50%",
        left: side === "left" ? 0 : "50%",
        pointerEvents: "none",
        background: highlighted ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
        borderLeft: highlighted && side === "right" ? "3px solid var(--accent)" : "none",
        borderRight: highlighted && side === "left" ? "3px solid var(--accent)" : "none",
        transition: "background 0.1s ease",
      }}
    />
  );
}

export function DockPanel({
  side,
  width,
  title,
  onWidthChange,
  onSideChange,
  onClose,
  children,
}: {
  side: DockSide;
  width: number;
  title: string;
  onWidthChange: (width: number) => void;
  onSideChange: (side: DockSide) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [dragHint, setDragHint] = useState<DockSide | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  // Persist the width across reloads
  useEffect(() => {
    try {
      window.localStorage.setItem(DOCK_WIDTH_STORAGE_KEY, String(width));
    } catch {
      /* ignore storage errors */
    }
  }, [width]);

  /** Title-bar drag: track the pointer, show a drop hint, dock on release. */
  const startHeaderDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);

    const move = (ev: MouseEvent) => {
      setDragHint(ev.clientX < window.innerWidth / 2 ? "left" : "right");
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDragging(false);
      setDragHint(null);
      const hint: DockSide = ev.clientX < window.innerWidth / 2 ? "left" : "right";
      if (hint !== side) onSideChange(hint);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [side, onSideChange]);

  /** Edge handle drag: resize the panel width. */
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = widthRef.current;

    const move = (ev: MouseEvent) => {
      const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      onWidthChange(Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, startWidth + delta)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setResizing(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [side, onWidthChange]);

  return (
    <>
      <div
        role="complementary"
        aria-label={title}
        style={{
          width,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
          background: "var(--bg-panel)",
          borderRight: side === "left" ? "1px solid var(--border)" : "none",
          borderLeft: side === "right" ? "1px solid var(--border)" : "none",
        }}
      >
        {/* Title bar: drag to re-dock */}
        <div
          onMouseDown={startHeaderDrag}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 32,
            padding: "0 10px",
            flexShrink: 0,
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-panel)",
            cursor: dragging ? "grabbing" : "grab",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--text)",
            userSelect: "none",
          }}
          title="拖拽标题栏切换左右停靠"
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

      {/* Edge resize handle */}
      <div
        onMouseDown={startResize}
        role="separator"
        aria-orientation="vertical"
        style={{
          width: 4,
          flexShrink: 0,
          cursor: "col-resize",
          background: resizing ? "var(--accent)" : "transparent",
          transition: "background 0.1s ease",
        }}
      />

      {/* Drop hint overlay while dragging the title bar */}
      {dragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            pointerEvents: "none",
            display: "flex",
          }}
        >
          <div style={{ flex: 1, position: "relative" }}>
            <DropZone side="left" hint={dragHint} active />
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <DropZone side="right" hint={dragHint} active />
          </div>
        </div>
      )}
    </>
  );
}
