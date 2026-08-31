import { NextResponse } from "next/server";
import { listPlugins } from "@/lib/plugin-registry";

export const dynamic = "force-dynamic";

/** GET /api/robopi/plugins —— 插件列表（含 entry mtime 版本号） */
export async function GET() {
  return NextResponse.json({ plugins: listPlugins() });
}
