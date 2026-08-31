import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

/**
 * GET /api/robopi/settings —— 读取全部设置
 * POST /api/robopi/settings —— 写入 { key, value }
 * 验证 @core/settings 服务的持久化读写。
 */
export async function GET() {
  const ctx = await getRoot();
  return NextResponse.json({ data: ctx.settings.getAll() });
}

export async function POST(request: Request) {
  const ctx = await getRoot();
  const body = (await request.json().catch(() => ({}))) as { key?: unknown; value?: unknown };
  if (typeof body.key !== "string" || !body.key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  await ctx.settings.set(body.key, body.value);
  return NextResponse.json({ ok: true, data: ctx.settings.getAll() });
}
