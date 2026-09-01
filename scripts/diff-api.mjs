#!/usr/bin/env node
/**
 * diff-api.mjs - Differential API testing between pi-web and RoboPi Web
 * (the M2 acceptance tool from ADR-0004).
 *
 * Usage:
 *   node scripts/diff-api.mjs                                   # defaults: pi-web(30141) vs robopi(30142)
 *   node scripts/diff-api.mjs --left http://... --right http://...
 *   node scripts/diff-api.mjs --path /api/home --path /api/sessions
 *   node scripts/diff-api.mjs --method POST --body '{"key":"value"}'
 *   node scripts/diff-api.mjs --verbose
 *
 * Strategy:
 * - Issues the same request against both servers and deep-compares JSON
 *   (object keys sorted before comparison).
 * - A field allowlist (IGNORE_FIELDS) drops volatile values (versions, timestamps).
 * - Both-sides 5xx responses are treated as equivalent (upstream network issues).
 * - Exit code: 0 when every path matches, 1 otherwise.
 */

import { parseFlags, warn } from "./lib/utils.mjs";

const VALUE_FLAGS = ["left", "right", "path", "method", "body"];
const { flags, positionals } = parseFlags(process.argv.slice(2), VALUE_FLAGS);

const LEFT = flags.left ?? "http://127.0.0.1:30141";
const RIGHT = flags.right ?? "http://127.0.0.1:30142";

const DEFAULT_PATHS = [
  "/api/home",
  "/api/models-config",
  "/api/models-config/catalog?limit=3",
];

/** Volatile fields to exclude from comparison, expressed as dotted paths. */
const IGNORE_FIELDS = [
  "app.version",
  "currentVersion",
  "latestVersion",
  "updateAvailable",
  "cordis.pluginCount",
  "cordis.plugins",
  "services",
  "source",
].map((path) => path.split("."));

function withoutIgnored(value, path = []) {
  if (Array.isArray(value)) return value.map((item) => withoutIgnored(item, path));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const next = [...path, key];
      if (IGNORE_FIELDS.some((f) => f.length === next.length && f.every((x, i) => x === next[i]))) {
        continue;
      }
      out[key] = withoutIgnored(item, next);
    }
    return out;
  }
  return value;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, sortKeys(item)])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return value;
}

function normalize(value) {
  return JSON.stringify(sortKeys(withoutIgnored(value)), null, 2);
}

async function fetchJson(base, path, method, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { __raw: text };
  }
  return { status: res.status, json };
}

const paths = Array.isArray(flags.path) ? flags.path : flags.path ? [flags.path] : DEFAULT_PATHS;
const method = flags.method ?? "GET";
const body = flags.body ? JSON.parse(String(flags.body)) : undefined;

console.log(`diff-api: ${LEFT}  vs  ${RIGHT}\n`);

let failed = 0;
for (const path of paths) {
  try {
    const [left, right] = await Promise.all([
      fetchJson(LEFT, path, method, body),
      fetchJson(RIGHT, path, method, body),
    ]);

    // Treat both-sides 5xx as equivalent: environmental, not a migration diff
    if (left.status >= 500 && right.status >= 500 && left.json?.error && right.json?.error) {
      warn(`${path}  both 5xx (left ${left.status} / right ${right.status}): ${left.json.error.slice(0, 60)}`);
      continue;
    }

    const same = left.status === right.status && normalize(left.json) === normalize(right.json);
    if (same) {
      console.log(`✅ ${path}  (HTTP ${left.status})`);
      continue;
    }

    failed += 1;
    console.log(`❌ ${path}  (left HTTP ${left.status} / right HTTP ${right.status})`);
    if (flags.verbose) {
      console.log("--- left ---\n" + normalize(left.json));
      console.log("--- right ---\n" + normalize(right.json));
    } else {
      const leftLines = normalize(left.json).split("\n");
      const rightLines = normalize(right.json).split("\n");
      const max = Math.max(leftLines.length, rightLines.length);
      for (let i = 0; i < max; i++) {
        if (leftLines[i] !== rightLines[i]) {
          console.log(`  diff line ${i}: left=${leftLines[i] ?? "(none)"}  right=${rightLines[i] ?? "(none)"}`);
        }
      }
    }
  } catch (error) {
    failed += 1;
    console.log(`❌ ${path}  (request failed: ${error instanceof Error ? error.message : error})`);
  }
}

console.log(`\n${failed === 0 ? "all consistent ✅" : `${failed} path(s) differ ❌`}`);
process.exit(failed === 0 ? 0 : 1);
