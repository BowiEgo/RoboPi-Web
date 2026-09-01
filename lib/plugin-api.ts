/**
 * 浏览器端插件 API（window.robopi）类型定义。
 *
 * 插件通过 <script> 注入，调用 window.robopi 注册：
 * - registerSlot：位置级（navrail/sidebar-bottom/tabbar-right/settings-section/chat-toolbar）
 * - registerComponent：组件级覆盖（ComponentRegistry 查表）
 * - registerMessageRenderer：内容级（自定义消息卡片）
 *
 * 类型仅供宿主与插件开发共用；运行时代码在 lib/plugin-client.ts。
 */

import type { ComponentType } from "react";

/** 位置级插槽 */
export type PluginSlotName =
  | "navrail"
  | "sidebar-bottom"
  | "tabbar-right"
  | "chat-toolbar"
  | "settings-section";

/** 可覆盖的宿主组件（ComponentRegistry 白名单） */
export type OverridableComponentName =
  | "ChatInput"
  | "MessageView"
  | "MarkdownBody"
  | "SessionSidebar"
  | "FileExplorer"
  | "FileViewer"
  | "SettingsPanel"
  | "TabBar"
  | "ModelSelector"
  | "ExtensionStatusBar"
  | "BranchNavigator"
  | "AppShell";

/** 位置级 slot 渲染函数：返回 React 元素或 DOM 节点 */
export type SlotRenderer = (api: PluginApi) => React.ReactNode;

/** 组件覆盖工厂：返回组件（可同步或异步） */
export type ComponentFactory = () => ComponentType<never> | Promise<ComponentType<never>>;

/** 自定义消息渲染器：customType → 渲染函数 */
export type MessageRenderer = (
  message: unknown,
  api: PluginApi,
) => React.ReactNode;

/** Dock panel docking sides (VSCode-style four-way) */
export type DockSide = "left" | "right" | "top" | "bottom";

/** 插件获取宿主能力的 API 桥（fetch 现有路由的封装） */
export interface PluginApi {
  /** 读取宿主信息（版本/插件列表） */
  getStatus(): Promise<unknown>;
  /** 列出会话 */
  listSessions(): Promise<unknown>;
  /** 打开会话/文件等动作（占位，后续按需扩展） */
  openSession(sessionId: string): void;
  /** Open the dock panel (rendered below the file browser) */
  openDock(): void;
  /** Dock the panel to a side of the chat area (VSCode-style) */
  setDockSide(side: DockSide): void;
  /** Current docking side of the panel */
  getDockSide(): DockSide;
}

/** 浏览器全局注册表内容 */
export interface PluginRegistryState {
  slots: Record<PluginSlotName, Map<string, SlotRenderer>>;
  components: Map<OverridableComponentName, ComponentFactory>;
  messageRenderers: Map<string, MessageRenderer>;
  /** Dock panel content (single renderer; later registrations replace) */
  dockPanel: SlotRenderer | null;
  /** Dock panel visibility (opened by plugins, closed via the panel's × button) */
  dockOpen: boolean;
  /** Dock panel side relative to the chat area */
  dockSide: DockSide;
}

/** manifest.json 结构 */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  /** 入口 JS 文件（相对 manifest 目录） */
  entry: string;
  /** 声明的插槽（元信息，运行时以实际注册为准） */
  slots?: PluginSlotName[];
}

/** 服务端扫描结果 */
export interface PluginListEntry {
  name: string;
  version: string;
  description?: string;
  /** 入口 URL（经 API 路由代理，避免直接暴露文件路径） */
  entryUrl: string;
  /** 入口文件 mtime（热更新版本号） */
  versionStamp: number;
  /** git 源信息（本地插件为 null） */
  source?: { url: string; ref?: string };
  /** 来源：dev = plugins-dev 自动挂载（开发模式）；installed = 插件目录 */
  origin?: "dev" | "installed";
}

declare global {
  interface Window {
    robopi?: {
      registerSlot(slot: PluginSlotName, renderer: SlotRenderer): void;
      registerComponent(name: OverridableComponentName, factory: ComponentFactory): void;
      registerMessageRenderer(customType: string, renderer: MessageRenderer): void;
      /** Register the dock panel content (rendered below the file browser) */
      registerDockPanel(renderer: SlotRenderer): void;
      /** Open the dock panel */
      openDock(): void;
      /** Set dock panel visibility (plugin-owned close button) */
      setDockOpen(open: boolean): void;
      /** Dock the panel to a side of the chat area (VSCode-style) */
      setDockSide(side: DockSide): void;
      /** Current docking side of the panel */
      getDockSide(): DockSide;
    };
    React?: typeof import("react");
  }
}
