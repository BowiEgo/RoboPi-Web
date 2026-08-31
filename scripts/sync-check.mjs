#!/usr/bin/env node
/**
 * sync-check.mjs —— pi-web 上游同步巡检（ADR-0004 第 6 节 + ADR-0005）。
 *
 * 用法：
 *   node scripts/sync-check.mjs                 # 巡检并报告（默认不修改文件）
 *   node scripts/sync-check.mjs --apply         # A 类整搬文件直接覆盖
 *   node scripts/sync-check.mjs --upstream ../pi-web   # 指定上游路径
 *
 * 文件分类（详见 docs/0005-upstream-sync.md）：
 *   A 整搬未改 —— 零改动，可整文件覆盖（lib/ 大部分、hooks/、部分路由）
 *   B 改造点   —— 薄壳路由 / UI 挂载点，需 3-way 手动合并
 *   C 独有文件 —— 与上游无关（lib/cordis、lib/plugins、scripts、docs、插件体系）
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const UPSTREAM = resolve(process.argv.includes("--upstream")
  ? process.argv[process.argv.indexOf("--upstream") + 1]
  : join(ROOT, "..", "pi-web"));
const APPLY = process.argv.includes("--apply");

// ---------- 分类清单 ----------

/** B 类改造点：本地改过（薄壳化/挂载点），上游变更需手动合并 */
const B_CLASS = new Set([
  // 薄壳路由
  "app/api/home/route.ts",
  "app/api/auth/api-key/[provider]/route.ts",
  "app/api/auth/login/[provider]/route.ts",
  "app/api/auth/logout/[provider]/route.ts",
  "app/api/auth/providers/route.ts",
  "app/api/agent/new/route.ts",
  "app/api/agent/[id]/route.ts",
  "app/api/agent/[id]/events/route.ts",
  "app/api/agent/running/route.ts",
  "app/api/git/diff/route.ts",
  "app/api/git/status/route.ts",
  "app/api/models-config/route.ts",
  "app/api/models-config/test/route.ts",
  "app/api/plugins/route.ts",
  "app/api/project-trust/route.ts",
  "app/api/sessions/route.ts",
  "app/api/sessions/[id]/route.ts",
  "app/api/sessions/[id]/context/route.ts",
  "app/api/sessions/[id]/state/route.ts",
  "app/api/sessions/[id]/auto-name/route.ts",
  "app/api/skills/route.ts",
  "app/api/skills/check/route.ts",
  "app/api/skills/install/route.ts",
  "app/api/skills/search/route.ts",
  "app/api/skills/update/route.ts",
  "app/api/subagents/[id]/route.ts",
  "app/api/worktrees/route.ts",
  // UI 挂载点
  "components/AppShell.tsx",
  "components/ChatWindow.tsx",
  "components/MessageView.tsx",
  "components/ChatInput.tsx",
  "components/SettingsPanel.tsx",
  // 品牌化改造
  "app/layout.tsx",
  "app/manifest.ts",
  "public/offline.html",
]);

/** C 类独有：RoboPi 自研，与上游无关（前缀匹配） */
const C_PREFIXES = [
  "lib/cordis/",
  "lib/plugins/",
  "lib/plugin-",
  "app/api/robopi/",
  "components/PluginSlot.tsx",
  "components/ComponentRegistry.tsx",
  "scripts/",
  "docs/",
  "examples/",
  ".robopi/",
];

/** A 类根目录：整搬目录（除 C 类外均为整搬） */
const A_ROOTS = ["lib/", "hooks/", "app/", "components/", "public/"];

// ---------- 工具 ----------

function isCClass(rel) {
  return C_PREFIXES.some((p) => rel.startsWith(p));
}

function listFiles(dir, base = "") {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
    if (e.isDirectory()) out.push(...listFiles(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

function sameFile(a, b) {
  try {
    if (!existsSync(a) || !existsSync(b)) return false;
    return readFileSync(a, "utf8") === readFileSync(b, "utf8");
  } catch { return false; }
}

// ---------- 巡检 ----------

console.log(`sync-check: 上游 = ${UPSTREAM}\n`);
if (!existsSync(UPSTREAM)) {
  console.error(`❌ 上游路径不存在：${UPSTREAM}`);
  process.exit(1);
}

const upstreamFiles = listFiles(UPSTREAM);
const classAChanged = [];
const classBChanged = [];
const newFiles = [];

for (const rel of upstreamFiles) {
  if (!A_ROOTS.some((r) => rel.startsWith(r))) continue; // 只巡检整搬根目录
  if (isCClass(rel)) continue;
  const local = join(ROOT, rel);
  const upstream = join(UPSTREAM, rel);
  if (!existsSync(local)) {
    newFiles.push(rel);
    continue;
  }
  if (sameFile(local, upstream)) continue;
  if (B_CLASS.has(rel)) classBChanged.push(rel);
  else classAChanged.push(rel);
}

// 依赖版本对比
let depNote = "";
try {
  const localPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const upPkg = JSON.parse(readFileSync(join(UPSTREAM, "package.json"), "utf8"));
  const sdkPkgs = Object.keys(localPkg.dependencies).filter((k) => k.startsWith("@earendil-works/"));
  const diffs = sdkPkgs.filter((k) =>
    (localPkg.dependencies[k] ?? "").replace(/^\^/, "") !== (upPkg.dependencies[k] ?? "").replace(/^\^/, ""),
  );
  if (diffs.length > 0) {
    depNote = `⚠️ 依赖版本不一致：${diffs.map((k) => `${k} ${localPkg.dependencies[k]} → ${upPkg.dependencies[k]}`).join("、")}`;
  }
} catch { /* package.json 读取失败忽略 */ }

console.log(`[A类 整搬未改] ${classAChanged.length} 个文件有变更`);
if (APPLY && classAChanged.length > 0) {
  for (const rel of classAChanged) {
    execFileSync("cp", [join(UPSTREAM, rel), join(ROOT, rel)]);
  }
  console.log("  ✅ 已覆盖（--apply）");
} else if (classAChanged.length > 0) {
  console.log(`  （加 --apply 自动覆盖）`);
  for (const rel of classAChanged.slice(0, 15)) console.log(`  · ${rel}`);
  if (classAChanged.length > 15) console.log(`  · … 等 ${classAChanged.length - 15} 个`);
}

console.log(`\n[B类 改造点] ${classBChanged.length} 个文件需手动 3-way 合并`);
for (const rel of classBChanged) console.log(`  · ${rel}`);

console.log(`\n[新增文件] ${newFiles.length} 个上游新文件`);
for (const rel of newFiles.slice(0, 10)) console.log(`  · ${rel}`);
if (newFiles.length > 10) console.log(`  · … 等 ${newFiles.length - 10} 个`);

if (depNote) console.log(`\n${depNote}`);
else console.log(`\n✅ pi SDK 依赖版本与上游一致`);

console.log("\n下一步：");
console.log("  1. B 类手动合并（薄壳路由：上游逻辑变更 → 同步到 lib/plugins 服务实现）");
console.log("  2. npm test（553 项行为契约）");
console.log("  3. node scripts/diff-api.mjs（API 差分）");
console.log("  4. 若依赖版本不一致：npm install 对齐后重跑");
