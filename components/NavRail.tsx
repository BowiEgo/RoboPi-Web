"use client";

import type { NavItem } from "@/lib/plugins/core/webui";

/**
 * 左侧导航栏 —— 数据来自 @web/ui-host 的 navrail 插槽（经 /api/robopi/status 下发）。
 * 后续接入真实路由后，href 将指向内部视图而非锚点。
 */
export function NavRail({ items, activeId }: { items: NavItem[]; activeId?: string }) {
  if (items.length === 0) {
    return (
      <nav className="rp-navrail" aria-label="导航栏">
        <span className="rp-navrail-item" title="无导航项">
          ·
        </span>
      </nav>
    );
  }
  return (
    <nav className="rp-navrail" aria-label="导航栏">
      {items.map((item) => (
        <a
          key={item.id}
          className={`rp-navrail-item${item.id === activeId ? " active" : ""}`}
          href={item.href ?? `#${item.id}`}
          title={item.label}
        >
          <span aria-hidden>{item.icon ?? "•"}</span>
        </a>
      ))}
    </nav>
  );
}
