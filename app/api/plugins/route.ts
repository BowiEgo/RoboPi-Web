import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";
import { PackagesError, type PluginAction } from "@/lib/plugins/core/packages";
import type { PluginScope } from "@/lib/api-types";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

function readScope(scope: unknown): PluginScope {
  return scope === "project" ? "project" : "global";
}

/** GET /api/plugins?cwd= —— 已配置包列表 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  try {
    const ctx = await getRoot();
    const denied = await ctx.files.checkCwdAllowed(cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });
    return NextResponse.json(await ctx.packages.list(cwd));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** POST /api/plugins —— 包动作 body: { action, source?, scope?, cwd } */
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
      scope?: PluginScope;
      cwd?: string;
    };
    if (!body.cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!body.action) return NextResponse.json({ error: "action required" }, { status: 400 });

    const ctx = await getRoot();
    const denied = await ctx.files.checkCwdAllowed(body.cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const scope = readScope(body.scope);
    const result = await ctx.packages.perform(body.cwd, body.action, body.source?.trim(), scope);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PackagesError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
