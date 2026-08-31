"use client";

import React from "react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type {
  ComponentFactory,
  MessageRenderer,
  OverridableComponentName,
  PluginListEntry,
  PluginRegistryState,
  PluginSlotName,
  SlotRenderer,
} from "@/lib/plugin-api";

/**
 * 浏览器端插件客户端（lib/plugin-client.ts）。
 *
 * - 提供 window.robopi 注册 API（slot / component / messageRenderer）
 * - 从 /api/robopi/plugins 拉取清单，加载 entry 脚本（script 标签 + 版本号破缓存）
 * - 轮询清单做热更新（mtime 变化 → 重载 entry + 通知 React 重挂载）
 * - React 侧经 useSyncExternalStore 订阅注册表变化
 */

const POLL_INTERVAL_MS = 5_000;

type Listener = () => void;
const listeners = new Set<Listener>();

const state: PluginRegistryState = {
  slots: {
    navrail: new Map(),
    "sidebar-bottom": new Map(),
    "tabbar-right": new Map(),
    "chat-toolbar": new Map(),
    "settings-section": new Map(),
  },
  components: new Map(),
  messageRenderers: new Map(),
};

let loadedEntries = new Map<string, number>(); // name -> versionStamp
let polling = false;

function emit(): void {
  listeners.forEach((cb) => cb());
}

function getSnapshot(): PluginRegistryState {
  return state;
}

/** SSR/测试环境快照：空注册表 */
function getServerSnapshot(): PluginRegistryState {
  return state;
}

function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  ensurePolling();
  return () => {
    listeners.delete(cb);
  };
}

function installGlobalApi(): void {
  if (window.robopi) return;
  // 暴露 React 给插件（纯 JS 插件无需构建工具）
  window.React = React;
  window.robopi = {
    registerSlot(slot: PluginSlotName, renderer: SlotRenderer): void {
      state.slots[slot].set(rendererKey(), renderer);
      emit();
    },
    registerComponent(name: OverridableComponentName, factory: ComponentFactory): void {
      state.components.set(name, factory);
      emit();
    },
    registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
      state.messageRenderers.set(customType, renderer);
      emit();
    },
  };
}

// 每个 entry 内多次注册用自增 key 区分（渲染器/组件按名字唯一即可）
let rendererSeq = 0;
function rendererKey(): string {
  rendererSeq += 1;
  return `plugin-${rendererSeq}`;
}

async function fetchPluginList(): Promise<PluginListEntry[]> {
  try {
    const res = await fetch("/api/robopi/plugins", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { plugins: PluginListEntry[] };
    return data.plugins ?? [];
  } catch {
    return [];
  }
}

async function loadEntry(entry: PluginListEntry): Promise<void> {
  const script = document.createElement("script");
  script.src = `${entry.entryUrl}&v=${entry.versionStamp}`;
  script.dataset.plugin = entry.name;
  document.head.appendChild(script);
  await new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`plugin entry failed to load: ${entry.name}`));
  });
  emit();
}

async function syncOnce(): Promise<void> {
  const list = await fetchPluginList();
  const byName = new Map(list.map((p) => [p.name, p]));
  // 已加载但被移除的插件：重新加载会因脚本缓存执行两次注册——由 entry 内做幂等保护
  for (const [name, stamp] of loadedEntries) {
    const next = byName.get(name);
    if (!next || next.versionStamp !== stamp) {
      loadedEntries.delete(name);
      const script = document.head.querySelector(`script[data-plugin="${name}"]`);
      script?.remove();
    }
  }
  for (const entry of list) {
    const known = loadedEntries.get(entry.name);
    if (known === entry.versionStamp) continue;
    try {
      await loadEntry(entry);
      loadedEntries.set(entry.name, entry.versionStamp);
    } catch (error) {
      console.warn("[plugin-client] load failed:", entry.name, error);
    }
  }
}

function ensurePolling(): void {
  if (polling || typeof window === "undefined") return;
  polling = true;
  void syncOnce().finally(() => {
    setInterval(() => {
      void syncOnce();
    }, POLL_INTERVAL_MS);
  });
}

/** 位置级插槽内容（按注册顺序） */
export function useSlot(slot: PluginSlotName): SlotRenderer[] {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const renderers = snapshot.slots[slot];
  return useCallback(() => Array.from(renderers.values()), [renderers])();
}

/** 组件覆盖：返回覆盖工厂或 undefined（宿主用默认组件） */
export function useComponentOverride(name: OverridableComponentName): ComponentFactory | undefined {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snapshot.components.get(name);
}

/** 自定义消息渲染器 */
export function useMessageRenderer(customType: string): MessageRenderer | undefined {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snapshot.messageRenderers.get(customType);
}

/** 所有已注册消息渲染器的 customType 集合（MessageView 据此分发） */
export function getRegisteredMessageTypes(): Set<string> {
  return new Set(state.messageRenderers.keys());
}

// 保证在客户端模块加载时安装全局 API
if (typeof window !== "undefined") installGlobalApi();
