#!/usr/bin/env node
/**
 * plugin-build.mjs - Build or watch TSX plugins using the host esbuild
 * (no plugin-local package.json / node_modules required).
 *
 * Usage:
 *   node scripts/plugin-build.mjs build <name|path|--all>
 *   node scripts/plugin-build.mjs watch <name|path|--all>
 *
 * npm shortcuts:
 *   npm run plugin:build -- workspace
 *   npm run plugin:watch -- workspace
 *   npm run plugin:watch-all
 *
 * Conventions:
 * - Plugin dirs live under plugins-dev/ (flat or nested monorepo layouts)
 * - Entry: <dir>/src/index.tsx -> output: <dir>/dist/index.js (committed on release)
 * - JSX config is read from the plugin tsconfig.json; without one it defaults
 *   to window.React.createElement (the React instance injected by the host)
 * - React is never bundled: the jsxFactory points at window.React
 */

import { build, context } from "esbuild";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, parseFlags, warn } from "./lib/utils.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEV_DIR = join(ROOT, "plugins-dev");

const VALUE_FLAGS = []; // --all is a boolean flag
const [, , mode, ...rest] = process.argv;
const { flags, positionals } = parseFlags(rest, VALUE_FLAGS);

if (!["build", "watch"].includes(mode ?? "")) {
  fail("usage: plugin-build.mjs <build|watch> <name|path|--all>");
}
if (flags.all !== true && !positionals[0]) {
  fail("usage: plugin-build.mjs <build|watch> <name|path|--all> (missing target)");
}

/** Resolve a plugin directory from a name or path (flat / nested / prefixed). */
function resolvePluginDir(nameOrPath) {
  if (nameOrPath.startsWith(".") || nameOrPath.startsWith("/")) {
    return resolve(nameOrPath);
  }
  const candidates = [
    join(DEV_DIR, nameOrPath.replace(/^plugins-dev\//, "")),
    resolve(ROOT, nameOrPath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

/** Recursively discover plugin dirs (any depth) containing src/index.tsx. */
function discoverPluginDirs() {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (existsSync(join(full, "src", "index.tsx"))) found.push(full);
      else walk(full);
    }
  };
  walk(DEV_DIR);
  return found;
}

const targets =
  flags.all === true
    ? discoverPluginDirs()
    : [resolvePluginDir(positionals[0] ?? "")];

const contexts = [];

for (const pluginDir of targets) {
  const entryPoint = join(pluginDir, "src", "index.tsx");
  if (!existsSync(entryPoint)) {
    warn(`skipping (no src/index.tsx): ${pluginDir}`);
    continue;
  }

  const hasTsconfig = existsSync(join(pluginDir, "tsconfig.json"));
  const options = {
    entryPoints: [entryPoint],
    bundle: true,
    format: "iife",
    outfile: join(pluginDir, "dist", "index.js"),
    // esbuild reads jsx/jsxFactory from the plugin tsconfig when present;
    // otherwise default to the React instance injected by the host.
    ...(hasTsconfig
      ? {}
      : { jsxFactory: "window.React.createElement", jsxFragment: "window.React.Fragment" }),
    logLevel: "info",
  };

  if (mode === "build") {
    await build(options);
    console.log(`✅ built: ${options.outfile}`);
  } else {
    const ctx = await context(options);
    await ctx.watch();
    contexts.push(ctx);
    console.log(`👁 watching: ${entryPoint} -> ${options.outfile}`);
  }
}

if (mode === "watch") {
  const shutdown = () => {
    for (const ctx of contexts) ctx.dispose();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (contexts.length === 0) {
    console.log("(no TSX plugins found under plugins-dev; watch standing by)");
    // Keep the process alive so `concurrently -k` does not kill the web server
    const idle = setInterval(() => {}, 60_000);
    process.on("SIGINT", () => { clearInterval(idle); process.exit(0); });
    process.on("SIGTERM", () => { clearInterval(idle); process.exit(0); });
  } else {
    console.log(`\n${contexts.length} plugin(s) being watched (Ctrl+C to stop)`);
  }
}
