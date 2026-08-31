import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";
import { ProviderError } from "@/lib/plugins/core/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

/** POST /api/auth/logout/[provider] —— OAuth 登出 */
export async function POST(_req: Request, { params }: Params) {
  const { provider } = await params;
  try {
    const ctx = await getRoot();
    await ctx.auth.logout(provider);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
