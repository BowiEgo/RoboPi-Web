import { statSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";
import { isWindowsAbsolutePath } from "@/lib/file-access";

export const dynamic = "force-dynamic";

/** GET /api/git/status?cwd= —— git 工作区状态 */
export async function GET(request: NextRequest) {
  try {
    const cwd = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
    if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
      return NextResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });
    }

    const ctx = await getRoot();
    const denied = await ctx.worktrees.checkCwdAllowed(cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    let stat;
    try {
      stat = statSync(cwd);
    } catch {
      return NextResponse.json({ error: "Directory not found" }, { status: 404 });
    }
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }

    return NextResponse.json(await ctx.worktrees.gitStatus(cwd));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
