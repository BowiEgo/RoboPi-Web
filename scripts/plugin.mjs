#!/usr/bin/env node
/**
 * plugin.mjs —— 插件 git 源安装 + 市场管理 CLI。
 *
 * 用法：
 *   node scripts/plugin.mjs list
 *   node scripts/plugin.mjs install <git-url|本地路径> [--ref <branch>] [--name <dir>] [--dir <repo子目录>]
 *   node scripts/plugin.mjs update <name>
 *   node scripts/plugin.mjs remove <name>
 *   node scripts/plugin.mjs market                    查看市场（含已安装状态）
 *   node scripts/plugin.mjs market-add <name> <url> [--ref x] [--dir y] [--description z]
 *   node scripts/plugin.mjs market-remove <name>
 *
 * 支持 URL 格式（与 pi packages 语义一致）：git: 前缀可选，
 *   https://github.com/user/repo、git@github.com:user/repo、本地路径。
 */
import { argv } from "node:process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BASE = "http://127.0.0.1:30142/api/robopi/plugins";
const MARKET_FILE = join(
  process.env.ROBOPI_PLUGINS_DIR ?? join(homedir(), ".pi", "agent", "robopi"),
  "market.json",
);

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

const [action, ...rest] = argv.slice(2);

try {
  if (action === "list") {
    const { plugins } = await request("");
    if (plugins.length === 0) {
      console.log("（无插件）");
    } else {
      for (const p of plugins) {
        const src = p.source ? `  ← ${p.source.url}${p.source.ref ? `@${p.source.ref}` : ""}` : "";
        console.log(`· ${p.name} v${p.version}${src}`);
      }
    }
  } else if (action === "install") {
    const source = rest[0];
    if (!source) throw new Error("usage: plugin.mjs install <url> [--ref x] [--name y] [--dir z]");
    const flag = (flagName) => {
      const idx = rest.indexOf(flagName);
      return idx === -1 ? undefined : rest[idx + 1];
    };
    const ref = flag("--ref");
    const name = flag("--name");
    const dir = flag("--dir");
    const result = await request("", {
      method: "POST",
      body: JSON.stringify({ action: "install", source, ref, name, dir }),
    });
    console.log(`✅ 已安装 ${result.plugin.name} v${result.plugin.version}`);
  } else if (action === "update") {
    const name = rest[0];
    if (!name) throw new Error("usage: plugin.mjs update <name>");
    const result = await request("", {
      method: "POST",
      body: JSON.stringify({ action: "update", name }),
    });
    console.log(`✅ 已更新 ${result.plugin?.name ?? name}`);
  } else if (action === "remove") {
    const name = rest[0];
    if (!name) throw new Error("usage: plugin.mjs remove <name>");
    await request("", { method: "POST", body: JSON.stringify({ action: "remove", name }) });
    console.log(`✅ 已移除 ${name}`);
  } else if (action === "market") {
    const { plugins } = await request("/market");
    if (plugins.length === 0) {
      console.log(`（市场为空：${MARKET_FILE}）`);
    } else {
      console.log(`市场清单（${MARKET_FILE}）：`);
      for (const p of plugins) {
        const state = p.installed
          ? `✅ 已装 v${p.installedVersion}`
          : "⬜ 未安装";
        console.log(`· ${p.name} ${state}${p.ref ? ` @${p.ref}` : ""}${p.dir ? ` dir=${p.dir}` : ""}`);
        if (p.description) console.log(`    ${p.description}`);
        console.log(`    ${p.source}`);
      }
    }
  } else if (action === "market-add") {
    const name = rest[0];
    const source = rest[1];
    if (!name || !source) throw new Error("usage: plugin.mjs market-add <name> <git-url> [--ref x] [--dir y] [--description z]");
    const flag = (flagName) => {
      const idx = rest.indexOf(flagName);
      return idx === -1 ? undefined : rest[idx + 1];
    };
    const entry = {
      name,
      ...(flag("--description") ? { description: flag("--description") } : {}),
      source,
      ...(flag("--ref") ? { ref: flag("--ref") } : {}),
      ...(flag("--dir") ? { dir: flag("--dir") } : {}),
    };
    const market = existsSync(MARKET_FILE)
      ? JSON.parse(readFileSync(MARKET_FILE, "utf8"))
      : { plugins: [] };
    market.plugins = market.plugins.filter((p) => p.name !== name);
    market.plugins.push(entry);
    writeFileSync(MARKET_FILE, JSON.stringify(market, null, 2) + "\n", "utf8");
    console.log(`✅ 已收录 ${name} → ${MARKET_FILE}`);
  } else if (action === "market-remove") {
    const name = rest[0];
    if (!name) throw new Error("usage: plugin.mjs market-remove <name>");
    const market = existsSync(MARKET_FILE)
      ? JSON.parse(readFileSync(MARKET_FILE, "utf8"))
      : { plugins: [] };
    const before = market.plugins.length;
    market.plugins = market.plugins.filter((p) => p.name !== name);
    if (market.plugins.length === before) {
      throw new Error(`市场中没有 ${name}`);
    }
    writeFileSync(MARKET_FILE, JSON.stringify(market, null, 2) + "\n", "utf8");
    console.log(`✅ 已从市场移除 ${name}`);
  } else {
    console.log("用法：node scripts/plugin.mjs <list|install|update|remove|market|market-add|market-remove> ...");
    process.exit(1);
  }
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
