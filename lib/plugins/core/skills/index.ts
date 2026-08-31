import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Context, Service } from "cordis";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SkillSearchResult } from "@/lib/api-types";
import { runNpx } from "@/lib/npx";
import { setDisableModelInvocation } from "@/lib/skill-frontmatter";
import { buildSkillUpdateArgs, checkSkillUpdates } from "@/lib/skill-updates";
import { loadSkillsWithInstallInfo } from "@/lib/skills-service";

/**
 * @core/skills —— 技能服务（ADR-0004 M2e）。
 *
 * 覆盖：技能列表（DefaultResourceLoader 同一发现逻辑）、disable-model-invocation
 * 开关（仅改 SKILL.md frontmatter 单键）、更新检查/执行、安装、skills.sh 搜索。
 * 搜索解析逻辑迁移自 pi-web 路由（ANSI 清理、npx 回退、安装数排序）。
 */

export const name = "@core/skills";

declare module "cordis" {
  interface Context {
    skills: SkillsService;
  }
}

export interface SkillToggleInput {
  filePath: string;
  disableModelInvocation: boolean;
}

const ANSI_RE = /\x1B\[[0-9;]*m/g;
const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const SEARCH_API_BASE = process.env.SKILLS_API_URL || "https://skills.sh";

interface SkillsApiSkill {
  id?: string;
  name?: string;
  source?: string;
  installs?: number;
}

interface SkillsApiResponse {
  skills?: SkillsApiSkill[];
}

function parseLimit(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(num)));
}

function formatInstalls(count?: number): string {
  if (!count || count <= 0) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M installs`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K installs`;
  return `${count} install${count === 1 ? "" : "s"}`;
}

function parseInstallCount(installs: string): number {
  const match = installs.match(/^([\d.]+)([KMB])?\s+installs?$/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  const multiplier = match[2] === "B" ? 1_000_000_000 : match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  return value * multiplier;
}

function parseSearchOutput(raw: string): SkillSearchResult[] {
  const clean = raw.replace(ANSI_RE, "");
  const results: SkillSearchResult[] = [];
  const lines = clean.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // package line: "owner/repo@skill  NNK installs"
    const pkgMatch = line.match(/^([\w.\-]+\/[\w.\-@:]+)\s+([\d.,]+[KMB]?\s+installs)$/);
    if (pkgMatch) {
      const urlLine = lines[i + 1]?.trim().replace(/^└\s*/, "");
      results.push({
        package: pkgMatch[1],
        installs: pkgMatch[2],
        url: urlLine?.startsWith("https://") ? urlLine : "",
      });
    }
  }
  return results;
}

async function searchSkillsApi(query: string, limit: number): Promise<SkillSearchResult[]> {
  const url = `${SEARCH_API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`skills.sh search failed: HTTP ${res.status}`);

  const data = (await res.json()) as SkillsApiResponse;
  return (data.skills ?? [])
    .map((skill) => {
      const name = skill.name?.trim();
      const source = skill.source?.trim();
      const slug = skill.id?.trim();
      if (!name || (!source && !slug)) return null;

      const pkg = `${source || slug}@${name}`;
      return {
        package: pkg,
        installs: formatInstalls(skill.installs),
        url: slug ? `${SEARCH_API_BASE}/${slug}` : "",
      };
    })
    .filter((skill): skill is SkillSearchResult => skill !== null)
    .sort((a, b) => parseInstallCount(b.installs) - parseInstallCount(a.installs));
}

class SkillsService extends Service {
  constructor(ctx: Context) {
    super(ctx, "skills", true);
  }

  /** 技能列表（settings 路径 + 包内 + .agents/skills 统一发现） */
  async list(cwd: string) {
    return loadSkillsWithInstallInfo(cwd);
  }

  /**
   * 切换 disable-model-invocation（仅改 SKILL.md 的该 frontmatter 键）。
   * 授权：allowed roots + agentDir + ~/.agents/skills（全局技能符号链接真实目标）。
   */
  async toggleDisableModelInvocation(input: SkillToggleInput): Promise<boolean> {
    const { filePath, disableModelInvocation } = input;
    if (!existsSync(filePath)) throw new SkillError("file not found", 404);

    const roots = new Set(await this.ctx.files.getAllowedFileRoots());
    roots.add(getAgentDir());
    const globalSkillsDir = join(homedir(), ".agents", "skills");
    if (existsSync(globalSkillsDir)) roots.add(globalSkillsDir);
    if (!this.ctx.files.isExistingFilePathAllowed(filePath, roots)) {
      throw new SkillError("Access denied", 403);
    }

    const content = readFileSync(filePath, "utf8");
    const updated = setDisableModelInvocation(content, disableModelInvocation);
    writeFileSync(filePath, updated, "utf8");
    return true;
  }

  /** 更新检查（github token 从环境读取） */
  async checkUpdates(cwd: string, pkg?: string, scope?: "global" | "project") {
    const { skills } = await loadSkillsWithInstallInfo(cwd);
    const installs = skills
      .map((skill) => skill.install)
      .filter((install): install is NonNullable<typeof install> => Boolean(install))
      .filter((install) => !pkg || (install.package === pkg && install.scope === scope));

    if (pkg && installs.length === 0) {
      throw new SkillError("Installed skill not found", 404);
    }

    return checkSkillUpdates(installs, {
      githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    });
  }

  /** 更新单个技能（npx 执行后刷新列表） */
  async updateSkill(cwd: string, pkg: string, scope: "global" | "project") {
    const { skills } = await loadSkillsWithInstallInfo(cwd);
    const skill = skills.find(
      (item) => item.install?.package === pkg && item.install.scope === scope,
    );
    if (!skill?.install) {
      throw new SkillError("Installed skill not found", 404);
    }
    if (!skill.install.canCheckForUpdates) {
      throw new SkillError("This skill cannot be updated automatically", 400);
    }

    const { stdout, stderr } = await runNpx(buildSkillUpdateArgs(skill.install), {
      timeout: 60_000,
      cwd: scope === "project" ? cwd : undefined,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    const refreshed = await loadSkillsWithInstallInfo(cwd);
    const updatedSkill = refreshed.skills.find(
      (item) => item.install?.package === pkg && item.install.scope === scope,
    );
    return {
      success: true,
      skill: updatedSkill,
      output: `${stdout}${stderr}`.slice(-500),
    };
  }

  /** 安装技能（npx skills add --agent pi） */
  async install(pkg: string, scope: "global" | "project", cwd?: string) {
    const args = ["skills", "add", pkg.trim(), "-y", "--agent", "pi"];
    if (scope === "global") args.push("-g");

    const { stdout, stderr } = await runNpx(args, {
      timeout: 60_000,
      cwd: scope === "project" ? cwd : undefined,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    const output = (stdout + stderr).replace(ANSI_RE, "");
    const success = /Installation complete|Installed \d+ skill/.test(output);
    if (!success) {
      throw new SkillError(output.slice(-300) || "Install failed", 500);
    }
    return { success: true, output };
  }

  /** skills.sh 搜索（API 优先，npx skills find 回退） */
  async search(query: string, rawLimit: unknown): Promise<SkillSearchResult[]> {
    const limit = parseLimit(rawLimit);
    try {
      return await searchSkillsApi(query.trim(), limit);
    } catch {
      const { stdout, stderr } = await runNpx(["skills", "find", query.trim()], {
        timeout: 20_000,
        env: { ...process.env, FORCE_COLOR: "0" },
      });
      return parseSearchOutput(stdout + stderr).slice(0, limit);
    }
  }
}

/** 带 HTTP 状态码的服务错误 */
export class SkillError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function apply(ctx: Context) {
  ctx.plugin(SkillsService);
}

export const inject = ["files"];
