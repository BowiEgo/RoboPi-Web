#!/usr/bin/env node
/**
 * plugin.mjs —— 插件 git 源安装 CLI。
 *
 * 用法：
 *   node scripts/plugin.mjs list
 *   node scripts/plugin.mjs install <git-url|本地路径> [--ref <branch>] [--name <dir>]
 *   node scripts/plugin.mjs update <name>
 *   node scripts/plugin.mjs remove <name>
 *
 * 支持 URL 格式（与 pi packages 语义一致）：git: 前缀可选，
 *   https://github.com/user/repo、git@github.com:user/repo、本地路径。
 */
import { argv } from "node:process";

const BASE = "http://127.0.0.1:30142/api/robopi/plugins";

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
    if (!source) throw new Error("usage: plugin.mjs install <url> [--ref x] [--name y]");
    const flag = (flagName) => {
      const idx = rest.indexOf(flagName);
      return idx === -1 ? undefined : rest[idx + 1];
    };
    const ref = flag("--ref");
    const name = flag("--name");
    const result = await request("", {
      method: "POST",
      body: JSON.stringify({ action: "install", source, ref, name }),
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
  } else {
    console.log("用法：node scripts/plugin.mjs <list|install|update|remove> ...");
    process.exit(1);
  }
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
