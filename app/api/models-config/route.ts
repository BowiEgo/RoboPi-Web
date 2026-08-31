import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

/**
 * GET/PUT /api/models-config —— 读写 ~/.pi/agent/models.json
 * 经 @core/models 服务（薄壳）。
 */
export async function GET() {
  const ctx = await getRoot();
  return NextResponse.json(ctx.models.readConfig());
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const ctx = await getRoot();
    ctx.models.writeConfig(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
