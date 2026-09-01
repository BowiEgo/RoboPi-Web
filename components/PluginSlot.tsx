"use client";

import { Fragment } from "react";
import { getWorktableItems, useSlot } from "@/lib/plugin-client";
import type { PluginApi, PluginSlotName } from "@/lib/plugin-api";

/**
 * 位置级插件插槽挂载点。
 *
 * 用法：<PluginSlot name="sidebar-bottom" /> —— 插件注册的渲染函数在此渲染。
 * 渲染函数接收 PluginApi（fetch 宿主能力的桥）。
 */
const pluginApi: PluginApi = {
  getStatus: () => fetch("/api/robopi/status", { cache: "no-store" }).then((r) => r.json()),
  listSessions: () => fetch("/api/sessions", { cache: "no-store" }).then((r) => r.json()),
  openSession: (sessionId: string) => {
    // 地基版本：跳转到带 session 参数的首页（AppShell 读取 URL 状态）
    window.location.assign(`/?session=${encodeURIComponent(sessionId)}`);
  },
  getWorktableItems: () => getWorktableItems(),
};

export function PluginSlot({ name }: { name: PluginSlotName }) {
  const renderers = useSlot(name);
  if (renderers.length === 0) return null;
  return (
    <div data-plugin-host={name}>
      {renderers.map((render, index) => (
        <Fragment key={index}>{render(pluginApi)}</Fragment>
      ))}
    </div>
  );
}
