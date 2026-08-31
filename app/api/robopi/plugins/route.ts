import { NextResponse } from "next/server";
import {
  getPluginSource,
  installPlugin,
  listPlugins,
  removePlugin,
  updatePlugin,
} from "@/lib/plugin-registry";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

/** GET /api/robopi/plugins —— 插件列表（含 entry mtime 版本号与 git 源信息） */
export async function GET() {
  const plugins = listPlugins().map((p) => ({
    ...p,
    ...(getPluginSource(p.name) ? { source: getPluginSource(p.name) } : {}),
  }));
  return NextResponse.json({ plugins });
}

type PluginAction = "install" | "update" | "remove";

/** POST /api/robopi/plugins —— git 源安装管理 body: { action, source?, ref?, name? } */
export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  try {
    const body = (await req.json()) as {
      action?: PluginAction;
      source?: string;
      ref?: string;
      name?: string;
    };
    if (!body.action) return NextResponse.json({ error: "action required" }, { status: 400 });

    if (body.action === "install") {
      if (!body.source?.trim()) return NextResponse.json({ error: "source required" }, { status: 400 });
      const plugin = await installPlugin(body.source.trim(), body.ref, body.name);
      return NextResponse.json({ ok: true, plugin });
    }
    if (body.action === "update") {
      if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
      const plugin = await updatePlugin(body.name);
      return NextResponse.json({ ok: true, plugin });
    }
    if (body.action === "remove") {
      if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
      await removePlugin(body.name);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: `Unsupported action: ${body.action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
