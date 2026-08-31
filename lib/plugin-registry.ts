import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PluginListEntry, PluginManifest } from "@/lib/plugin-api";
const execFileAsync = promisify(execFile);

/**
 * 服务端插件目录扫描 + git 源安装管理。
 *
 * 插件来源两种：
 * - 本地：直接放 ~/.pi/agent/pi-web/plugins/<name>/（目录无 .git-source.json）
 * - git 安装：installPlugin() clone 到目录并写 .git-source.json，update 走 git pull，
 *   remove 仅对 git 安装的插件生效（保护本地文件夹）
 */

const PLUGINS_ROOT = join(
  process.env.ROBOPI_PLUGINS_DIR ?? join(homedir(), ".pi", "agent", "robopi"),
  "plugins",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManifest(raw: string): PluginManifest {
  const data = JSON.parse(raw) as unknown;
  if (!isRecord(data)) throw new Error("manifest.json must be an object");
  if (typeof data.name !== "string" || !data.name) throw new Error("manifest.name is required");
  if (typeof data.version !== "string" || !data.version) throw new Error("manifest.version is required");
  if (typeof data.entry !== "string" || !data.entry) throw new Error("manifest.entry is required");
  return {
    name: data.name,
    version: data.version,
    description: typeof data.description === "string" ? data.description : undefined,
    entry: data.entry,
    ...(Array.isArray(data.slots)
      ? { slots: data.slots.filter((s): s is "navrail" => typeof s === "string") }
      : {}),
  };
}

/** 扫描插件目录，返回可加载的插件列表（含 entry 的 mtime 作为版本号；支持符号链接） */
export function listPlugins(): PluginListEntry[] {
  let entries: string[];
  try {
    entries = readdirSync(PLUGINS_ROOT, { withFileTypes: true })
      .filter((d) => {
        if (d.isDirectory()) return true;
        // 跟随符号链接（开发目录软链即热更）
        if (d.isSymbolicLink()) {
          try {
            return statSync(join(PLUGINS_ROOT, d.name)).isDirectory();
          } catch {
            return false;
          }
        }
        return false;
      })
      .map((d) => d.name);
  } catch {
    return []; // 目录不存在 = 无插件
  }

  const result: PluginListEntry[] = [];
  for (const dir of entries) {
    try {
      const manifestPath = join(PLUGINS_ROOT, dir, "manifest.json");
      const manifest = parseManifest(readFileSync(manifestPath, "utf8"));
      const entryPath = resolve(join(PLUGINS_ROOT, dir), manifest.entry);
      if (!entryPath.startsWith(resolve(PLUGINS_ROOT, dir))) {
        throw new Error("entry must stay inside the plugin directory");
      }
      const stats = statSync(entryPath);
      if (!stats.isFile()) throw new Error(`entry not found: ${manifest.entry}`);
      result.push({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        entryUrl: `/api/robopi/plugins/entry?name=${encodeURIComponent(manifest.name)}`,
        versionStamp: stats.mtimeMs,
      });
    } catch (error) {
      // 单个插件损坏不影响其它插件加载
      console.warn(
        `[plugin-registry] skip broken plugin "${dir}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return result;
}

/** 按 name（manifest.name）查找插件目录并读取 entry 内容（支持目录名与 name 不一致的软链场景） */
export function readPluginEntry(name: string): { content: string; versionStamp: number } | null {
  let dirs: string[];
  try {
    dirs = readdirSync(PLUGINS_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isSymbolicLink())
      .map((d) => d.name);
  } catch {
    return null;
  }
  for (const dirName of dirs) {
    try {
      const dir = join(PLUGINS_ROOT, dirName);
      const manifest = parseManifest(readFileSync(join(dir, "manifest.json"), "utf8"));
      if (manifest.name !== name) continue;
      const entryPath = resolve(join(dir), manifest.entry);
      if (!entryPath.startsWith(resolve(dir))) throw new Error("entry must stay inside the plugin directory");
      const stats = statSync(entryPath);
      if (!stats.isFile()) continue;
      return { content: readFileSync(entryPath, "utf8"), versionStamp: stats.mtimeMs };
    } catch {
      continue; // 单个插件损坏不影响其它
    }
  }
  return null;
}

export { PLUGINS_ROOT };

// ============================================================================
// git 源安装管理
// ============================================================================

/** git 安装元数据文件（目录内存在 = git 安装，允许 remove/update） */
const GIT_SOURCE_FILE = ".git-source.json";

interface GitSourceMeta {
  url: string;
  ref?: string;
  installedAt: string;
}

function readGitSource(dir: string): GitSourceMeta | null {
  try {
    return JSON.parse(readFileSync(join(dir, GIT_SOURCE_FILE), "utf8")) as GitSourceMeta;
  } catch {
    return null;
  }
}

/** 从 git URL/路径推断仓库名（防路径穿越：白名单字符） */
export function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/^git:/, "")
    .replace(/^git@[^:]+:/, "")
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\.git$/, "");
  const base = cleaned.split("/").filter(Boolean).pop() ?? "plugin";
  const safe = base.replace(/[^\w.-]/g, "-");
  return safe || "plugin";
}

/** 安装：git clone 到插件目录并记录元数据。dir 为仓库内子目录（monorepo） */
export async function installPlugin(
  source: string,
  ref?: string,
  name?: string,
  dir?: string,
): Promise<PluginListEntry> {
  const url = source.replace(/^git:/, "");
  const dirName = name ?? repoNameFromUrl(url);
  if (!/^[\w.-]+$/.test(dirName)) throw new Error(`invalid plugin name: ${dirName}`);
  const target = join(PLUGINS_ROOT, dirName);
  if (!target.startsWith(PLUGINS_ROOT)) throw new Error("invalid plugin name");

  const { mkdirSync, renameSync, rmSync } = await import("node:fs");
  mkdirSync(PLUGINS_ROOT, { recursive: true });

  // 先 clone 到临时目录，校验 manifest 后重命名为 manifest.name
  // （目录名 = 插件身份，保证 update/remove 按 name 定位一致）
  const tmpDir = join(PLUGINS_ROOT, `.install-${dirName}-${Date.now()}`);
  const cloneArgs = ["clone", "--depth", "1"];
  if (ref) cloneArgs.push("--branch", ref);
  cloneArgs.push(url, tmpDir);
  let manifest: PluginManifest;
  try {
    await execFileAsync("git", cloneArgs, { timeout: 120_000 });

    // monorepo：manifest 在仓库子目录 dir 下（校验防路径穿越）
    const manifestDir = dir ? resolve(tmpDir, dir) : tmpDir;
    if (!manifestDir.startsWith(resolve(tmpDir))) {
      throw new Error(`invalid dir: ${dir}`);
    }
    manifest = parseManifest(readFileSync(join(manifestDir, "manifest.json"), "utf8"));
    if (!/^[\w.-]+$/.test(manifest.name)) throw new Error(`invalid manifest.name: ${manifest.name}`);
    const finalDir = join(PLUGINS_ROOT, manifest.name);
    if (existsSync(finalDir)) {
      throw new Error(`plugin already exists: ${manifest.name}`);
    }
    renameSync(manifestDir, finalDir);

    writeFileSync(
      join(finalDir, GIT_SOURCE_FILE),
      JSON.stringify({ url, ref, dir, installedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const entry = listPlugins().find((p) => p.name === manifest.name);
  if (!entry) throw new Error(`plugin installed but manifest invalid: ${dirName}`);
  return entry;
}

/** 更新：git 安装的插件 git pull（保持浅克隆语义：fetch + reset） */
export async function updatePlugin(name: string): Promise<PluginListEntry | null> {
  const dir = join(PLUGINS_ROOT, name);
  const meta = readGitSource(dir);
  if (!meta) throw new Error(`not a git-installed plugin: ${name}`);

  await execFileAsync("git", ["fetch", "origin"], { cwd: dir, timeout: 120_000 });
  const resetTarget = meta.ref ? `origin/${meta.ref}` : "origin/HEAD";
  await execFileAsync("git", ["reset", "--hard", resetTarget], { cwd: dir, timeout: 120_000 });

  return listPlugins().find((p) => p.name === name) ?? null;
}

/** 移除：仅 git 安装的插件（本地文件夹保护） */
export async function removePlugin(name: string): Promise<boolean> {
  const dir = join(PLUGINS_ROOT, name);
  const meta = readGitSource(dir);
  if (!meta) throw new Error(`refusing to remove local plugin (not git-installed): ${name}`);
  const { rmSync } = await import("node:fs");
  rmSync(dir, { recursive: true, force: true });
  return true;
}

/** 插件列表补充 git 源信息 */
export function getPluginSource(name: string): { url: string; ref?: string } | null {
  const meta = readGitSource(join(PLUGINS_ROOT, name));
  return meta ? { url: meta.url, ref: meta.ref } : null;
}

// ============================================================================
// 插件市场
// ============================================================================

/** 市场清单条目 */
export interface MarketPluginEntry {
  name: string;
  description?: string;
  /** git 源（支持 git: 前缀） */
  source: string;
  /** 可选 ref（branch/tag） */
  ref?: string;
  /** monorepo 子目录（仓库内 manifest 所在路径，缺省为仓库根） */
  dir?: string;
}

/** 市场清单文件（用户可编辑）；ROBOPI_PLUGIN_MARKET_URL 可指向远程 JSON */
const MARKET_FILE = join(
  process.env.ROBOPI_PLUGINS_DIR ?? join(homedir(), ".pi", "agent", "robopi"),
  "market.json",
);

function parseMarket(data: unknown): MarketPluginEntry[] {
  if (!isRecord(data) || !Array.isArray(data.plugins)) return [];
  return data.plugins.filter((p): p is MarketPluginEntry => {
    if (!isRecord(p)) return false;
    return typeof p.name === "string" && typeof p.source === "string" && p.source.trim() !== "";
  });
}

/** 读取市场清单（本地文件优先；环境变量 URL 为远程源，缓存 10 分钟） */
export async function listMarketPlugins(): Promise<MarketPluginEntry[]> {
  const remote = process.env.ROBOPI_PLUGIN_MARKET_URL;
  if (!remote) {
    try {
      return parseMarket(JSON.parse(readFileSync(MARKET_FILE, "utf8")));
    } catch {
      return []; // 无市场文件 = 空市场
    }
  }
  try {
    const res = await fetch(remote, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`market HTTP ${res.status}`);
    return parseMarket(await res.json());
  } catch (error) {
    console.warn("[plugin-market] fetch failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

/** 市场条目 + 已安装状态 */
export async function listMarketWithStatus(): Promise<
  Array<MarketPluginEntry & { installed: boolean; installedVersion?: string }>
> {
  const [market, installed] = await Promise.all([listMarketPlugins(), Promise.resolve(listPlugins())]);
  const installedByName = new Map(installed.map((p) => [p.name, p.version]));
  return market.map((entry) => ({
    ...entry,
    installed: installedByName.has(entry.name),
    installedVersion: installedByName.get(entry.name),
  }));
}

export { MARKET_FILE };

