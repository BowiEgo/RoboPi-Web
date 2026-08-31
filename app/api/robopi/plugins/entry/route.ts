import { NextResponse } from "next/server";
import { readPluginEntry } from "@/lib/plugin-registry";

export const dynamic = "force-dynamic";

/** GET /api/robopi/plugins/entry?name= —— 插件入口 JS（带缓存破坏版本头） */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const entry = readPluginEntry(name);
  if (!entry) return NextResponse.json({ error: `Plugin not found: ${name}` }, { status: 404 });
  return new Response(entry.content, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Plugin-Version": String(entry.versionStamp),
    },
  });
}
