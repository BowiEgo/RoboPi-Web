import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

/**
 * POST /api/robopi/hello
 * 示例：调用 @core/hello 服务，验证 路由 → Cordis 服务 链路。
 */
export async function POST(request: Request) {
  const ctx = await getRoot();
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "RoboPi";
  const message = ctx.hello.greet(name);
  return NextResponse.json({ message, calls: ctx.hello.stats.calls });
}
