import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

/** GET /api/worktrees?cwd= —— 项目 worktrees 列表 */
export async function GET(req: Request) {
  try {
    const cwd = new URL(req.url).searchParams.get("cwd");
    if (!cwd) {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    const ctx = await getRoot();
    const denied = await ctx.worktrees.checkCwdAllowed(cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    return NextResponse.json(await ctx.worktrees.list(cwd));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** POST /api/worktrees —— 添加 worktree body: { cwd, branch } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { cwd?: string; branch?: string };
    if (!body.cwd || typeof body.cwd !== "string") {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    if (!body.branch || typeof body.branch !== "string") {
      return NextResponse.json({ error: "branch is required" }, { status: 400 });
    }
    const ctx = await getRoot();
    const denied = await ctx.worktrees.checkCwdAllowed(body.cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });
    if (!existsSync(body.cwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${body.cwd}` }, { status: 400 });
    }

    const result = await ctx.worktrees.add(body.cwd, body.branch);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/worktrees —— 移除 worktree body: { cwd, path, force? } */
export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { cwd?: string; path?: string; force?: boolean };
    if (!body.cwd || typeof body.cwd !== "string") {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    if (!body.path || typeof body.path !== "string") {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }
    const ctx = await getRoot();
    const denied = await ctx.worktrees.checkCwdAllowed(body.cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    await ctx.worktrees.remove(body.cwd, body.path, body.force === true);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // git refuses to remove dirty worktrees without --force; surface that so
    // the UI can offer a force-remove confirmation.
    const dirty = /contains modified or untracked files|is dirty/i.test(message);
    return NextResponse.json({ error: message, dirty }, { status: dirty ? 409 : 400 });
  }
}
