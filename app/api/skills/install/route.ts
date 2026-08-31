import { NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getRoot } from "@/lib/cordis/root";
import { getProjectTrustStatus } from "@/lib/project-trust";
import { SkillError } from "@/lib/plugins/core/skills";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

/** POST /api/skills/install —— 安装技能 body: { package, scope, cwd? } */
export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  try {
    const { package: pkg, scope, cwd } = (await req.json()) as {
      package?: string;
      scope?: string;
      cwd?: string;
    };
    if (!pkg?.trim()) return NextResponse.json({ error: "package required" }, { status: 400 });

    const isGlobal = scope !== "project";
    if (!isGlobal) {
      if (!cwd) return NextResponse.json({ error: "cwd required for project install" }, { status: 400 });
      const ctx = await getRoot();
      const denied = await ctx.files.checkCwdAllowed(cwd);
      if (denied) return NextResponse.json({ error: denied }, { status: 403 });
      if (!getProjectTrustStatus(cwd, getAgentDir()).trusted) {
        return NextResponse.json(
          { error: "Project resources must be trusted before installing project skills" },
          { status: 403 },
        );
      }
    }

    const ctx = await getRoot();
    const result = await ctx.skills.install(pkg, isGlobal ? "global" : "project", cwd);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SkillError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = ((err.stdout ?? "") + (err.stderr ?? "")).replace(/\x1B\[[0-9;]*m/g, "");
    return NextResponse.json({ error: output || (err.message ?? String(e)) }, { status: 500 });
  }
}
