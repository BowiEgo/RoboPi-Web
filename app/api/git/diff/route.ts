import { NextRequest, NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";
import { isWindowsAbsolutePath } from "@/lib/file-access";

export const dynamic = "force-dynamic";

/** GET /api/git/diff?cwd=&path= —— git 文件差异 */
export async function GET(request: NextRequest) {
  try {
    const cwd = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
    const filePath = request.nextUrl.searchParams.get("path")?.trim() ?? "";
    if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
      return NextResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });
    }
    if (!filePath || (!filePath.startsWith("/") && !isWindowsAbsolutePath(filePath))) {
      return NextResponse.json({ error: "path must be an absolute path" }, { status: 400 });
    }

    const ctx = await getRoot();
    const denied = await ctx.worktrees.checkCwdAllowed(cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });
    // cwd 必须解析进允许根；文件本身可能已删除（git 报告为 deleted 时），
    // getGitFileDiff 会验证路径属于该仓库与状态。
    const allowedRoots = await ctx.files.getAllowedFileRoots();
    if (!ctx.files.isFilePathAllowed(filePath, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(await ctx.worktrees.gitFileDiff(cwd, filePath));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
