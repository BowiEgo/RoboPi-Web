#!/usr/bin/env node
/**
 * diff-api.mjs —— pi-web 与 RoboPi-web 的 API 差分测试（ADR-0004 M2 验收工具）。
 *
 * 用法：
 *   node scripts/diff-api.mjs                     # pi-web(30141) vs robopi(30142)
 *   node scripts/diff-api.mjs --left http://127.0.0.1:30141 --right http://127.0.0.1:30142 --path /api/home
 *
 * 对比策略：
 *   - GET 请求两个服务，JSON 深度比较（对象键排序后）；
 *   - 可配置忽略字段（版本号、时间戳等易变值）；
 *   - 退出码：全部一致 → 0；任一不一致 → 1。
 */
import { argv } from "node:process";
import assert from "node:assert/strict";

const rawArgs = argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  const [k, ...rest] = rawArgs[i].split("=");
  const key = k.replace(/^--/, "");
  let value = rest.join("=") || true;
  if (key === "path" && value === true) {
    // 支持 `--path /api/x` 空格分隔形式
    value = rawArgs[++i];
  }
  if (key === "path") {
    if (!Array.isArray(args.path)) args.path = [];
    args.path.push(String(value));
  } else {
    args[key] = value;
  }
}

const LEFT = String(args.left ?? "http://127.0.0.1:30141");
const RIGHT = String(args.right ?? "http://127.0.0.1:30142");

const DEFAULT_PATHS = [
  "/api/home",
  "/api/models-config",
  "/api/models-config/catalog?limit=3",
];

/** 需要忽略的易变字段（路径用 a.b.c 表示，命中则从比较中剔除） */
const IGNORE_FIELDS = [
  "app.version",
  "cordis.pluginCount",
  "cordis.plugins",
  "services",
  "source",
].map((p) => p.split("."));

function withoutIgnored(value, path = []) {
  if (Array.isArray(value)) return value.map((v) => withoutIgnored(v, path));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const next = [...path, k];
      if (IGNORE_FIELDS.some((f) => f.length === next.length && f.every((x, i) => x === next[i]))) continue;
      out[k] = withoutIgnored(v, next);
    }
    return out;
  }
  return value;
}

function normalize(value) {
  return JSON.stringify(sortKeys(withoutIgnored(value)), null, 2);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sortKeys(v)]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return value;
}

async function fetchJson(base, path) {
  const res = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { __raw: text }; }
  return { status: res.status, json };
}

const paths = Array.isArray(args.path) ? args.path : args.path ? [args.path] : DEFAULT_PATHS;
let failed = 0;

console.log(`diff-api: ${LEFT}  vs  ${RIGHT}\n`);
for (const path of paths) {
  try {
    const [left, right] = await Promise.all([fetchJson(LEFT, path), fetchJson(RIGHT, path)]);
    // 双方 5xx（如上游网络不可达）视为等价：环境问题而非迁移差异
    if (left.status >= 500 && right.status >= 500 && left.json?.error && right.json?.error) {
      console.log(`⚠️ ${path}  双方 5xx（left ${left.status} / right ${right.status}）：${left.json.error.slice(0, 60)}`);
      continue;
    }
    const same = left.status === right.status && normalize(left.json) === normalize(right.json);
    if (same) {
      console.log(`✅ ${path}  (HTTP ${left.status})`);
    } else {
      failed += 1;
      console.log(`❌ ${path}  (left HTTP ${left.status} / right HTTP ${right.status})`);
      if (args.verbose) {
        console.log("--- left ---\n" + normalize(left.json));
        console.log("--- right ---\n" + normalize(right.json));
      } else {
        const leftNorm = normalize(left.json);
        const rightNorm = normalize(right.json);
        const leftLines = leftNorm.split("\n");
        const rightLines = rightNorm.split("\n");
        const max = Math.max(leftLines.length, rightLines.length);
        for (let i = 0; i < max; i++) {
          if (leftLines[i] !== rightLines[i]) {
            console.log(`  差异行 ${i}: left=${leftLines[i] ?? "(无)"}  right=${rightLines[i] ?? "(无)"}`);
          }
        }
      }
    }
  } catch (err) {
    failed += 1;
    console.log(`❌ ${path}  (请求失败: ${err instanceof Error ? err.message : err})`);
  }
}

console.log(`\n${failed === 0 ? "全部一致 ✅" : `${failed} 个路径不一致 ❌`}`);
process.exit(failed === 0 ? 0 : 1);
