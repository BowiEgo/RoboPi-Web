import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";
import { SkillError } from "@/lib/plugins/core/skills";

export const dynamic = "force-dynamic";

/** POST /api/skills/check —— 检查技能更新 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cwd?: unknown;
      package?: unknown;
      scope?: unknown;
    };
    const cwd = typeof body.cwd === "string" ? body.cwd : "";
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

    const ctx = await getRoot();
    const denied = await ctx.files.checkCwdAllowed(cwd);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const pkg = typeof body.package === "string" ? body.package : undefined;
    const scope = body.scope === "global" || body.scope === "project"
      ? (body.scope as "global" | "project")
      : undefined;
    if ((pkg && !scope) || (!pkg && scope)) {
      return NextResponse.json({ error: "package and scope must be provided together" }, { status: 400 });
    }

    const updates = await ctx.skills.checkUpdates(cwd, pkg, scope);
    return NextResponse.json({ updates });
  } catch (error) {
    if (error instanceof SkillError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
