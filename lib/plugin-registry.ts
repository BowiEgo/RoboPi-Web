import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { PluginListEntry, PluginManifest } from "@/lib/plugin-api";

/**
 * 服务端插件目录扫描。
 *
 * 扫描 ~/.pi/agent/pi-web/plugins 下每个子目录的 manifest.json：
 * - 校验 manifest 结构（name/version/entry）
 * - entry 文件必须存在，返回经 API 代理的 URL 与 mtime（热更新版本号）
 */

const PLUGINS_ROOT = join(homedir(), ".pi", "agent", "pi-web", "plugins");

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

/** 扫描插件目录，返回可加载的插件列表（含 entry 的 mtime 作为版本号） */
export function listPlugins(): PluginListEntry[] {
  let entries: string[];
  try {
    entries = readdirSync(PLUGINS_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
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

/** 按 name 读取插件 entry 文件内容（路径已在上一步校验过） */
export function readPluginEntry(name: string): { content: string; versionStamp: number } | null {
  const entry = listPlugins().find((p) => p.name === name);
  if (!entry) return null;
  const dir = join(PLUGINS_ROOT, name);
  const manifest = parseManifest(readFileSync(join(dir, "manifest.json"), "utf8"));
  const entryPath = resolve(join(dir), manifest.entry);
  const stats = statSync(entryPath);
  return { content: readFileSync(entryPath, "utf8"), versionStamp: stats.mtimeMs };
}

export { PLUGINS_ROOT };
