import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

/**
 * GET /api/robopi/settings —— 读取 @core/kv-store 全部键值
 * POST /api/robopi/settings —— 写入 { key, value }
 */
export async function GET() {
  const ctx = await getRoot();
  return NextResponse.json({ data: ctx.kvStore.getAll() });
}

export async function POST(request: Request) {
  const ctx = await getRoot();
  const body = (await request.json().catch(() => ({}))) as { key?: unknown; value?: unknown };
  if (typeof body.key !== "string" || !body.key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  await ctx.kvStore.set(body.key, body.value);
  return NextResponse.json({ ok: true, data: ctx.kvStore.getAll() });
}
