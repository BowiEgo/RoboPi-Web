import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { Context, Service } from "cordis";
import {
  DefaultPackageManager,
  getAgentDir,
  SettingsManager,
  type PackageSource,
  type ResolvedPaths,
  type ResolvedResource,
} from "@earendil-works/pi-coding-agent";
import { getProjectTrustStatus } from "@/lib/project-trust";
import type {
  PluginDiagnostic,
  PluginPackageInfo,
  PluginResourceCounts,
  PluginResourceInfo,
  PluginResourceKind,
  PluginScope,
  PluginsResponse,
} from "@/lib/api-types";

/**
 * @core/packages —— pi 包管理服务（ADR-0004 M2e）。
 *
 * 逻辑移植自 pi-web app/api/plugins/route.ts（364 行）：
 * - list：DefaultPackageManager.resolve + 资源统计 + 禁用状态（disable = 资源数组清空）
 * - perform：install / remove / update / disable / enable 五个动作
 * 授权检查（allowed roots）由调用方（路由）完成后传入，请求级安全在路由层。
 */

export const name = "@core/packages";

declare module "cordis" {
  interface Context {
    packages: PackagesService;
  }
}

export type PluginAction = "install" | "remove" | "update" | "disable" | "enable";

function emptyCounts(): PluginResourceCounts {
  return { extensions: 0, skills: 0, prompts: 0, themes: 0 };
}

function toPluginScope(scope: string): PluginScope {
  return scope === "project" ? "project" : "global";
}

function keyFor(source: string, scope: PluginScope): string {
  return `${scope}\0${source}`;
}

function getPackageSource(entry: PackageSource): string {
  return typeof entry === "string" ? entry : entry.source;
}

function isDisabledPackage(entry: PackageSource): boolean {
  if (typeof entry === "string") return false;
  return (
    Array.isArray(entry.extensions) && entry.extensions.length === 0 &&
    Array.isArray(entry.skills) && entry.skills.length === 0 &&
    Array.isArray(entry.prompts) && entry.prompts.length === 0 &&
    Array.isArray(entry.themes) && entry.themes.length === 0
  );
}

function getDisabledPackages(settingsManager: SettingsManager): Map<string, boolean> {
  const disabled = new Map<string, boolean>();
  for (const entry of settingsManager.getGlobalSettings().packages ?? []) {
    disabled.set(keyFor(getPackageSource(entry), "global"), isDisabledPackage(entry));
  }
  for (const entry of settingsManager.getProjectSettings().packages ?? []) {
    disabled.set(keyFor(getPackageSource(entry), "project"), isDisabledPackage(entry));
  }
  return disabled;
}

function setPackageDisabled(
  settingsManager: SettingsManager,
  source: string,
  scope: PluginScope,
  disabled: boolean,
): boolean {
  const current = scope === "project"
    ? settingsManager.getProjectSettings().packages ?? []
    : settingsManager.getGlobalSettings().packages ?? [];
  let changed = false;
  const next = current.map((entry): PackageSource => {
    if (getPackageSource(entry) !== source) return entry;
    changed = true;
    if (disabled) {
      return {
        ...(typeof entry === "string" ? { source: entry } : entry),
        extensions: [],
        skills: [],
        prompts: [],
        themes: [],
      };
    }
    return getPackageSource(entry);
  });
  if (!changed) return false;
  if (scope === "project") settingsManager.setProjectPackages(next);
  else settingsManager.setPackages(next);
  return true;
}

function addCount(counts: PluginResourceCounts, kind: keyof PluginResourceCounts): void {
  counts[kind] += 1;
}

function getResourceName(path: string, kind: PluginResourceKind): string {
  const file = basename(path);
  const ext = extname(file);
  if (kind === "skill" && file.toLowerCase() === "skill.md") return basename(dirname(path));
  if ((kind === "extension" || kind === "theme" || kind === "prompt") && ext) {
    if (kind === "extension" && /^index\.(ts|js)$/.test(file)) return basename(dirname(path));
    return file.slice(0, -ext.length);
  }
  return file;
}

function getRelativePath(resource: ResolvedResource): string {
  const baseDir = resource.metadata.baseDir;
  if (!baseDir) return resource.path;
  const rel = relative(baseDir, resource.path);
  return rel && !rel.startsWith("..") ? rel : resource.path;
}

function getConfiguredVersion(source: string): string | undefined {
  const npmSpec = source.startsWith("npm:") ? source.slice(4) : undefined;
  if (npmSpec) {
    const lastAt = npmSpec.lastIndexOf("@");
    const packageNameEnd = npmSpec.startsWith("@") ? npmSpec.indexOf("/", 1) : 0;
    if (lastAt > packageNameEnd) return npmSpec.slice(lastAt + 1) || undefined;
    return undefined;
  }

  if (source.startsWith("git:") || /^[a-z]+:\/\//.test(source)) {
    const lastAt = source.lastIndexOf("@");
    const lastSlash = source.lastIndexOf("/");
    const lastColon = source.lastIndexOf(":");
    if (lastAt > Math.max(lastSlash, lastColon)) return source.slice(lastAt + 1) || undefined;
  }
  return undefined;
}

function readPackageMetadata(installedPath?: string): { packageName?: string; version?: string } {
  if (!installedPath) return {};
  try {
    const stats = statSync(installedPath);
    const packageJsonPath = stats.isDirectory()
      ? join(installedPath, "package.json")
      : join(dirname(installedPath), "package.json");
    if (!existsSync(packageJsonPath)) return {};
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    return {
      packageName: typeof parsed.name === "string" ? parsed.name : undefined,
      version: typeof parsed.version === "string" ? parsed.version : undefined,
    };
  } catch {
    return {};
  }
}

function collectResource(
  resource: ResolvedResource,
  kind: keyof PluginResourceCounts,
  countsByPackage: Map<string, PluginResourceCounts>,
  resourcesByPackage: Map<string, PluginResourceInfo[]>,
  totals: PluginResourceCounts,
): void {
  if (!resource.enabled || resource.metadata.origin !== "package") return;
  const source = resource.metadata.source;
  const scope = toPluginScope(resource.metadata.scope);
  const key = keyFor(source, scope);
  const counts = countsByPackage.get(key) ?? emptyCounts();
  addCount(counts, kind);
  addCount(totals, kind);
  countsByPackage.set(key, counts);
  const resources = resourcesByPackage.get(key) ?? [];
  const resourceKind = kind === "extensions"
    ? "extension"
    : kind === "skills"
      ? "skill"
      : kind === "prompts"
        ? "prompt"
        : "theme";
  resources.push({
    kind: resourceKind,
    name: getResourceName(resource.path, resourceKind),
    path: resource.path,
    relativePath: getRelativePath(resource),
  });
  resourcesByPackage.set(key, resources);
}

function collectResources(paths: ResolvedPaths): {
  countsByPackage: Map<string, PluginResourceCounts>;
  resourcesByPackage: Map<string, PluginResourceInfo[]>;
  totals: PluginResourceCounts;
} {
  const countsByPackage = new Map<string, PluginResourceCounts>();
  const resourcesByPackage = new Map<string, PluginResourceInfo[]>();
  const totals = emptyCounts();
  for (const resource of paths.extensions) collectResource(resource, "extensions", countsByPackage, resourcesByPackage, totals);
  for (const resource of paths.skills) collectResource(resource, "skills", countsByPackage, resourcesByPackage, totals);
  for (const resource of paths.prompts) collectResource(resource, "prompts", countsByPackage, resourcesByPackage, totals);
  for (const resource of paths.themes) collectResource(resource, "themes", countsByPackage, resourcesByPackage, totals);
  return { countsByPackage, resourcesByPackage, totals };
}

function createPackageManager(cwd: string) {
  const agentDir = getAgentDir();
  const projectTrust = getProjectTrustStatus(cwd, agentDir);
  const settingsManager = SettingsManager.create(cwd, agentDir, {
    projectTrusted: projectTrust.trusted,
  });
  const packageManager = new DefaultPackageManager({
    cwd,
    agentDir,
    settingsManager,
  });
  return { agentDir, projectTrust, settingsManager, packageManager };
}

class PackagesService extends Service {
  constructor(ctx: Context) {
    super(ctx, "packages", true);
  }

  /** 列出已配置包（含资源统计、禁用状态、诊断信息） */
  async list(cwd: string): Promise<PluginsResponse> {
    const { projectTrust, settingsManager, packageManager } = createPackageManager(cwd);

    const diagnostics: PluginDiagnostic[] = [];
    let countsByPackage = new Map<string, PluginResourceCounts>();
    let resourcesByPackage = new Map<string, PluginResourceInfo[]>();
    let totals = emptyCounts();
    const disabledByPackage = getDisabledPackages(settingsManager);

    try {
      const resolved = await packageManager.resolve(async (source) => {
        diagnostics.push({
          type: "warning",
          source,
          message: "Package is configured but not installed yet.",
        });
        return "skip";
      });
      ({ countsByPackage, resourcesByPackage, totals } = collectResources(resolved));
    } catch (error) {
      diagnostics.push({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const packages = packageManager.listConfiguredPackages().map((pkg) => {
      const scope = toPluginScope(pkg.scope);
      const key = keyFor(pkg.source, scope);
      const disabled = disabledByPackage.get(key) ?? false;
      const counts = countsByPackage.get(key) ?? emptyCounts();
      const resources = resourcesByPackage.get(key) ?? [];
      const resourceCount = counts.extensions + counts.skills + counts.prompts + counts.themes;
      const packageMetadata = readPackageMetadata(pkg.installedPath);
      if (!pkg.installedPath) {
        diagnostics.push({
          type: "warning",
          source: pkg.source,
          message: "Configured package path was not found.",
        });
      }
      return {
        source: pkg.source,
        scope,
        filtered: pkg.filtered,
        disabled,
        installedPath: pkg.installedPath,
        packageName: packageMetadata.packageName,
        version: packageMetadata.version,
        configuredVersion: getConfiguredVersion(pkg.source),
        counts,
        resources,
        status: disabled ? "disabled" : resourceCount > 0 ? "loaded" : pkg.installedPath ? "installed" : "missing",
      } satisfies PluginPackageInfo;
    });

    return {
      packages,
      totals,
      diagnostics,
      projectResourcesLoaded: projectTrust.trusted,
    };
  }

  /** 执行包动作（install/remove/update/disable/enable），返回最新列表 */
  async perform(
    cwd: string,
    action: PluginAction,
    source: string | undefined,
    scope: PluginScope,
  ): Promise<PluginsResponse> {
    const { projectTrust, settingsManager, packageManager } = createPackageManager(cwd);
    if (scope === "project" && !projectTrust.trusted) {
      throw new PackagesError(
        "Project resources must be trusted before modifying project plugins",
        403,
      );
    }
    const local = scope === "project";

    if (action === "install") {
      if (!source) throw new PackagesError("source required", 400);
      await packageManager.installAndPersist(source, { local });
    } else if (action === "remove") {
      if (!source) throw new PackagesError("source required", 400);
      await packageManager.removeAndPersist(source, { local });
    } else if (action === "update") {
      await packageManager.update(source);
    } else if (action === "disable") {
      if (!source) throw new PackagesError("source required", 400);
      setPackageDisabled(settingsManager, source, scope, true);
      await settingsManager.flush();
    } else if (action === "enable") {
      if (!source) throw new PackagesError("source required", 400);
      setPackageDisabled(settingsManager, source, scope, false);
      await settingsManager.flush();
    } else {
      throw new PackagesError(`Unsupported action: ${action}`, 400);
    }

    return this.list(cwd);
  }
}

/** 带 HTTP 状态码的服务错误 */
export class PackagesError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function apply(ctx: Context) {
  ctx.plugin(PackagesService);
}
