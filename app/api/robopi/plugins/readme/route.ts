import { NextResponse } from "next/server";
import { readPluginReadme } from "@/lib/plugin-registry";

export const dynamic = "force-dynamic";

/** GET /api/robopi/plugins/readme?name= —— 插件 README.md（dev 源优先；无 README 返回 null） */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const readme = readPluginReadme(name);
  return NextResponse.json({ name, readme });
}
