import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

/** POST /api/auth/api-key/[provider] —— 存储 API key */
export async function POST(req: Request, { params }: Params) {
  const { provider } = await params;
  try {
    const { apiKey } = (await req.json()) as { apiKey?: string };
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
    }
    const ctx = await getRoot();
    await ctx.auth.storeApiKey(provider, apiKey, req.signal);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** DELETE /api/auth/api-key/[provider] —— 移除已存 API key */
export async function DELETE(_req: Request, { params }: Params) {
  const { provider } = await params;
  try {
    const ctx = await getRoot();
    const removal = await ctx.auth.removeCredential(provider, "api_key");
    if (removal.status === "type_mismatch") {
      return NextResponse.json(
        { error: `${provider} is authenticated with OAuth, not an API key` },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
