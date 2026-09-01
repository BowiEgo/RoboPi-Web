#!/usr/bin/env node
/**
 * sync-check.mjs - Upstream (pi-web) sync inspection per ADR-0005.
 *
 * Usage:
 *   node scripts/sync-check.mjs                  # inspect and report (no file changes)
 *   node scripts/sync-check.mjs --apply          # overwrite class-A files
 *   node scripts/sync-check.mjs --upstream ../pi-web
 *
 * File classes (see docs/0005-upstream-sync.md):
 *   A untouched imports  - identical to upstream, safe to overwrite wholesale
 *   B modified locally   - thin-shell routes / UI mount points, need manual 3-way merge
 *   C RoboPi-specific    - never synced (lib/cordis, lib/plugins, scripts, docs, ...)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fail, parseFlags, warn } from "./lib/utils.mjs";

const VALUE_FLAGS = ["upstream"];
const { flags, positionals } = parseFlags(process.argv.slice(2), VALUE_FLAGS);

const ROOT = resolve(import.meta.dirname, "..");
const UPSTREAM = resolve(flags.upstream ?? join(ROOT, "..", "pi-web"));
const APPLY = flags.apply === true;

/** Class-B files: modified locally (thin-shell routes, UI mount points, branding). */
const B_CLASS = new Set([
  // Thin-shell routes
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
  // UI mount points
  "components/AppShell.tsx",
  "components/ChatWindow.tsx",
  "components/MessageView.tsx",
  "components/ChatInput.tsx",
  "components/SettingsPanel.tsx",
  // Branding
  "app/layout.tsx",
  "app/manifest.ts",
  "public/offline.html",
  // i18n messages (extended with robopi.* keys)
  "lib/i18n/messages/en.ts",
  "lib/i18n/messages/zh-CN.ts",
  "lib/i18n/messages/zh-TW.ts",
]);

/** Class-C prefixes: RoboPi-specific, never synced. */
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

/** Class-A roots: wholesale-import directories. */
const A_ROOTS = ["lib/", "hooks/", "app/", "components/", "public/"];

function isClassC(relPath) {
  return C_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function listFiles(dir, base = "") {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

function sameFile(a, b) {
  try {
    if (!existsSync(a) || !existsSync(b)) return false;
    return readFileSync(a, "utf8") === readFileSync(b, "utf8");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

if (!existsSync(UPSTREAM)) {
  fail(`upstream path does not exist: ${UPSTREAM}`);
}
console.log(`sync-check: upstream = ${UPSTREAM}\n`);

const classAChanged = [];
const classBChanged = [];
const newFiles = [];

for (const rel of listFiles(UPSTREAM)) {
  if (!A_ROOTS.some((root) => rel.startsWith(root))) continue; // only wholesale dirs
  if (isClassC(rel)) continue;
  const local = join(ROOT, rel);
  if (!existsSync(local)) {
    newFiles.push(rel);
    continue;
  }
  if (sameFile(local, join(UPSTREAM, rel))) continue;
  (B_CLASS.has(rel) ? classBChanged : classAChanged).push(rel);
}

// SDK dependency drift check (ignoring caret prefixes)
let depNote = "";
try {
  const localPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const upPkg = JSON.parse(readFileSync(join(UPSTREAM, "package.json"), "utf8"));
  const sdkPkgs = Object.keys(localPkg.dependencies).filter((k) => k.startsWith("@earendil-works/"));
  const drifted = sdkPkgs.filter((k) =>
    (localPkg.dependencies[k] ?? "").replace(/^\^/, "") !==
    (upPkg.dependencies[k] ?? "").replace(/^\^/, ""),
  );
  if (drifted.length > 0) {
    depNote = `⚠️ SDK version drift: ${drifted
      .map((k) => `${k} ${localPkg.dependencies[k]} -> ${upPkg.dependencies[k]}`)
      .join(", ")}`;
  }
} catch {
  /* ignore package.json read failures */
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`[Class A: untouched imports] ${classAChanged.length} file(s) changed`);
if (APPLY && classAChanged.length > 0) {
  for (const rel of classAChanged) {
    execFileSync("cp", [join(UPSTREAM, rel), join(ROOT, rel)]);
  }
  console.log("  ✅ overwritten (--apply)");
} else if (classAChanged.length > 0) {
  console.log("  (add --apply to overwrite automatically)");
  for (const rel of classAChanged.slice(0, 15)) console.log(`  - ${rel}`);
  if (classAChanged.length > 15) console.log(`  - ... ${classAChanged.length - 15} more`);
}

console.log(`\n[Class B: modified locally] ${classBChanged.length} file(s) need manual 3-way merge`);
for (const rel of classBChanged) console.log(`  - ${rel}`);

console.log(`\n[New upstream files] ${newFiles.length}`);
for (const rel of newFiles.slice(0, 10)) console.log(`  - ${rel}`);
if (newFiles.length > 10) console.log(`  - ... ${newFiles.length - 10} more`);

if (depNote) console.log(`\n${depNote}`);
else console.log("\n✅ SDK versions match upstream");

console.log("\nNext steps:");
console.log("  1. Manually merge class-B files (upstream logic changes -> lib/plugins services)");
console.log("  2. npm test (553 behavioral contracts)");
console.log("  3. node scripts/diff-api.mjs (API parity)");
console.log("  4. If SDK drifted: npm install to align, then re-run");

if (classBChanged.length > 0) warn("class-B files pending manual merge");
