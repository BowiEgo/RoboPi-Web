#!/usr/bin/env node
/**
 * plugin-build.mjs —— 宿主构建 TSX 插件（免插件 package.json，支持 monorepo）。
 *
 * 用法：
 *   node scripts/plugin-build.mjs build <name|path>   构建单个插件
 *   node scripts/plugin-build.mjs watch <name|path>    watch 单个插件（后台安全）
 *   node scripts/plugin-build.mjs build --all         构建全部插件
 *   node scripts/plugin-build.mjs watch --all          watch 全部插件
 *
 * npm 便捷脚本：
 *   npm run plugin:build -- workspace      # 构建 plugins-dev/workspace
 *   npm run plugin:watch -- workspace      # watch（改 src 自动编译，浏览器 5 秒热更）
 *   npm run plugin:watch-all               # watch 全部插件
 *
 * 约定：
 * - 插件目录：plugins-dev/<name>/（或显式路径）
 * - 入口 src/index.tsx → 产物 dist/index.js（发布时随仓库提交）
 * - JSX 配置：esbuild 自动读插件 tsconfig.json；无 tsconfig 默认 window.React.createElement
 * - 不 bundle React（宿主注入 window.React）
 */
import { build, context } from "esbuild";
import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEV_DIR = join(ROOT, "plugins-dev");

const [mode, target] = process.argv.slice(2);
if (!["build", "watch"].includes(mode ?? "") || !target) {
  console.error("用法：node scripts/plugin-build.mjs <build|watch> <name|path|--all>");
  process.exit(1);
}

function resolvePluginDir(nameOrPath) {
  if (nameOrPath.startsWith(".") || nameOrPath.startsWith("/")) {
    return resolve(nameOrPath);
  }
  // 支持扁平（workspace）、嵌套（robopi-plugins/plugins/worktable）、
  // 带前缀（plugins-dev/xxx）三种形式
  const candidates = [
    join(DEV_DIR, nameOrPath.replace(/^plugins-dev\//, "")),
    resolve(ROOT, nameOrPath),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

function listPluginDirs() {
  // 递归发现（monorepo 嵌套）：任意层级含 src/index.tsx 的目录即插件
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === "dist") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (existsSync(join(full, "src", "index.tsx"))) found.push(full);
        else walk(full);
      }
    }
  };
  walk(DEV_DIR);
  return found;
}

const targets =
  target === "--all"
    ? listPluginDirs()
    : [resolvePluginDir(target)];

const contexts = [];

for (const pluginDir of targets) {
  const entryPoint = join(pluginDir, "src", "index.tsx");
  if (!existsSync(entryPoint)) {
    console.warn(`⏭ 跳过（无 src/index.tsx）：${pluginDir}`);
    continue;
  }

  const tsconfig = join(pluginDir, "tsconfig.json");
  const options = {
    entryPoints: [entryPoint],
    bundle: true,
    format: "iife",
    outfile: join(pluginDir, "dist", "index.js"),
    // tsconfig 存在时 esbuild 自动读 jsx/jsxFactory；否则用宿主默认
    ...(existsSync(tsconfig)
      ? {}
      : { jsxFactory: "window.React.createElement", jsxFragment: "window.React.Fragment" }),
    logLevel: "info",
  };

  if (mode === "build") {
    await build(options);
    console.log(`✅ 构建完成：${options.outfile}`);
  } else {
    const ctx = await context(options);
    await ctx.watch();
    contexts.push(ctx);
    console.log(`👁 watch 中：${entryPoint} → ${options.outfile}`);
  }
}

if (mode === "watch") {
  if (contexts.length === 0) {
    console.log("（plugins-dev 下未发现 TSX 插件，watch 保持待命…）");
    // 保持进程存活，避免 concurrently -k 误杀 web；Ctrl+C 退出
    const idle = setInterval(() => {}, 60_000);
    process.on("SIGINT", () => { clearInterval(idle); process.exit(0); });
    process.on("SIGTERM", () => { clearInterval(idle); process.exit(0); });
  } else {
    console.log(`\n共 ${contexts.length} 个插件在 watch（Ctrl+C 停止）`);
  }
  const shutdown = () => {
    for (const ctx of contexts) ctx.dispose();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
