import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";
import { SCOPE_STATUS_LABELS, type PluginStatusInfo } from "@/lib/cordis/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/robopi/status
 * 地基状态探针：Cordis 根实例、已加载插件、各服务快照。
 */
export async function GET() {
  const ctx = await getRoot();

  // 过滤匿名作用域（inject fork 等），仅展示具名插件
  const plugins: PluginStatusInfo[] = [...ctx.registry.values()]
    .filter((scope) => (scope.name ?? scope.plugin.name ?? "") !== "")
    .map((scope) => ({
      name: scope.name ?? scope.plugin.name ?? "anonymous",
      status: SCOPE_STATUS_LABELS[scope.status] ?? "unknown",
      error: scope.error instanceof Error ? scope.error.message : undefined,
    }));

  return NextResponse.json({
    app: {
      name: "RoboPi Web",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    },
    cordis: {
      pluginCount: plugins.length,
      plugins,
    },
    services: {
      hello: {
        calls: ctx.hello.stats.calls,
      },
      settings: {
        keys: Object.keys(ctx.settings.getAll()),
      },
      webui: {
        slots: ctx.webui.getSnapshot(),
      },
    },
  });
}
