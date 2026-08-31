import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";
import { SkillError } from "@/lib/plugins/core/skills";

export const dynamic = "force-dynamic";

/** POST /api/skills/update —— 更新单个技能 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cwd?: unknown;
      package?: unknown;
      scope?: unknown;
    };
    const cwd = typeof body.cwd === "string" ? body.cwd : "";
    const pkg = typeof body.package === "string" ? body.package : "";
    const scope = body.scope === "global" || body.scope === "project"
      ? (body.scope as "global" | "project")
      : undefined;
    if (!cwd || !pkg || !scope) {
      return NextResponse.json({ error: "cwd, package, and scope are required" }, { status: 400 });
    }

    const ctx = await getRoot();
    const denied = await ctx.files.checkCwdAllowed(cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const result = await ctx.skills.updateSkill(cwd, pkg, scope);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SkillError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    const output = `${detail.stdout ?? ""}${detail.stderr ?? ""}`;
    return NextResponse.json(
      { error: output || detail.message || String(error) },
      { status: 500 },
    );
  }
}
