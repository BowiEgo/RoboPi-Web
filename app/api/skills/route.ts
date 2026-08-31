import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";
import { SkillError } from "@/lib/plugins/core/skills";

export const dynamic = "force-dynamic";

/** GET /api/skills?cwd= —— 技能列表 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  try {
    const ctx = await getRoot();
    const denied = await ctx.files.checkCwdAllowed(cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });
    return NextResponse.json(await ctx.skills.list(cwd));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** PATCH /api/skills —— 切换 disable-model-invocation（仅改 SKILL.md 单键） */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { filePath: string; disableModelInvocation: boolean };
    const { filePath, disableModelInvocation } = body;
    if (!filePath) return NextResponse.json({ error: "filePath required" }, { status: 400 });

    const ctx = await getRoot();
    await ctx.skills.toggleDisableModelInvocation({ filePath, disableModelInvocation });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof SkillError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
