#!/usr/bin/env node
/**
 * plugin-build.mjs —— 宿主构建 TSX 插件（免插件 package.json）。
 *
 * 用法：
 *   node scripts/plugin-build.mjs build plugins-dev/tsx-workspace
 *   node scripts/plugin-build.mjs watch plugins-dev/tsx-workspace   # 后台安全（context.watch）
 *
 * 约定：
 * - 入口：<插件目录>/src/index.tsx
 * - 输出：<插件目录>/dist/index.js（发布时随仓库提交）
 * - JSX 配置：esbuild 自动读取插件目录 tsconfig.json 的 jsx/jsxFactory；
 *   无 tsconfig 时默认 window.React.createElement（宿主注入的 React）
 * - 不 bundle React：jsxFactory 指向 window.React，产物仅插件自身代码
 */
import { build, context } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const [mode, dirArg] = process.argv.slice(2);
if (!["build", "watch"].includes(mode ?? "") || !dirArg) {
  console.error("用法：node scripts/plugin-build.mjs <build|watch> <插件目录>");
  process.exit(1);
}

const pluginDir = resolve(dirArg);
const entryPoint = join(pluginDir, "src", "index.tsx");
const outfile = join(pluginDir, "dist", "index.js");

if (!existsSync(entryPoint)) {
  console.error(`❌ 未找到入口：${entryPoint}`);
  process.exit(1);
}

// tsconfig 存在时由 esbuild 自动读取（jsx/jsxFactory/jsxFragmentFactory）；
// 不存在时用宿主默认（与宿主注入的 window.React 一致）
const tsconfig = join(pluginDir, "tsconfig.json");
const jsxFactory = existsSync(tsconfig)
  ? undefined // esbuild 读 tsconfig
  : "window.React.createElement";
const jsxFragment = existsSync(tsconfig)
  ? undefined
  : "window.React.Fragment";

const options = {
  entryPoints: [entryPoint],
  bundle: true,
  format: "iife",
  outfile,
  ...(jsxFactory ? { jsxFactory } : {}),
  ...(jsxFragment ? { jsxFragment } : {}),
  logLevel: "info",
};

if (mode === "build") {
  await build(options);
  console.log(`✅ 构建完成：${outfile}`);
} else {
  const ctx = await context(options);
  await ctx.watch();
  console.log(`👁 watch 中：${entryPoint} → ${outfile}（Ctrl+C 停止）`);
  // context.watch 无 stdin 依赖，后台运行安全
  process.on("SIGINT", () => { ctx.dispose(); process.exit(0); });
  process.on("SIGTERM", () => { ctx.dispose(); process.exit(0); });
}
