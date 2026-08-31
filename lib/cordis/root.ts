import { Context } from "cordis";
import { builtinPlugins } from "@/lib/plugins";

/**
 * Cordis 根 Context 管理。
 *
 * 关键设计（见 docs/0002-cordis-plugin-spec.md）：
 * - 根 Context 缓存在 globalThis.__robopiRoot 上，跨 Next.js HMR 存活；
 * - 缓存的是 Promise<Context>，保证并发 API 请求共享同一次初始化；
 * - 初始化失败时清除缓存，允许下一次请求重试。
 */

const GLOBAL_KEY = "__robopiRoot";

export async function createRoot(): Promise<Context> {
  const ctx = new Context();
  for (const entry of builtinPlugins) {
    ctx.plugin({ name: entry.name, apply: entry.apply }, entry.config);
  }
  await ctx.start();
  return ctx;
}

export function getRoot(): Promise<Context> {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    const promise = createRoot().catch((error) => {
      delete g[GLOBAL_KEY];
      throw error;
    });
    g[GLOBAL_KEY] = promise;
  }
  return g[GLOBAL_KEY] as Promise<Context>;
}
