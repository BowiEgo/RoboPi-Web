import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

/** POST /api/skills/search —— skills.sh 搜索 body: { query, limit? } */
export async function POST(req: Request) {
  try {
    const { query, limit } = (await req.json()) as { query?: string; limit?: unknown };
    if (!query?.trim()) return NextResponse.json({ error: "query required" }, { status: 400 });

    const ctx = await getRoot();
    const results = await ctx.skills.search(query.trim(), limit);
    return NextResponse.json({ results });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const raw = (err.stdout ?? "") + (err.stderr ?? "");
    const ANSI_RE = /\x1B\[[0-9;]*m/g;
    // 回退解析（npx 输出含结果时返回结果而非错误）
    const results = raw.replace(ANSI_RE, "").split("\n")
      .map((line) => {
        const pkgMatch = line.trim().match(/^([\w.\-]+\/[\w.\-@:]+)\s+([\d.,]+[KMB]?\s+installs)$/);
        return pkgMatch ? { package: pkgMatch[1], installs: pkgMatch[2], url: "" } : null;
      })
      .filter((r): r is { package: string; installs: string; url: string } => r !== null);
    if (results.length > 0) return NextResponse.json({ results });
    return NextResponse.json({ error: err.message ?? String(e) }, { status: 500 });
  }
}
