import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

/** GET /api/auth/providers —— OAuth 与 API-key 供应商双列表（能力驱动） */
export async function GET() {
  const ctx = await getRoot();
  const result = await ctx.auth.listProviders();
  return NextResponse.json(result);
}
