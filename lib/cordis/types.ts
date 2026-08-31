import type { Context } from "cordis";

/**
 * 内置插件条目 —— 由 lib/cordis/root.ts 加载。
 * 采用 Cordis Plugin.Object 形态（{ name, apply }），便于日志与注册表展示。
 */
export interface BuiltinPluginEntry {
  /** 插件名，遵循 `@scope/name` 约定 */
  name: string;
  /** 插件 apply 函数（config 类型由各插件自行声明；清单层异构，沿用 Cordis 生态的 any 约定） */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: (ctx: Context, config: any) => void;
  /** 插件配置（可选） */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any;
}

/** 插件运行时状态（ScopeStatus 数值 → 可读字符串） */
export type PluginStatus = "pending" | "loading" | "active" | "failed" | "disposed";

export const SCOPE_STATUS_LABELS: readonly PluginStatus[] = [
  "pending",
  "loading",
  "active",
  "failed",
  "disposed",
];

export interface PluginStatusInfo {
  name: string;
  status: PluginStatus;
  error?: string;
}
