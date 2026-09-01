#!/usr/bin/env node
/**
 * plugin.mjs - RoboPi plugin CLI (install / update / remove / market).
 *
 * Usage:
 *   node scripts/plugin.mjs list
 *   node scripts/plugin.mjs install <git-url|local-path> [--ref <branch>] [--name <dir>] [--dir <repo-subdir>]
 *   node scripts/plugin.mjs update <name>
 *   node scripts/plugin.mjs remove <name>
 *   node scripts/plugin.mjs market
 *   node scripts/plugin.mjs market-add <name> <url> [--ref x] [--dir y] [--description z]
 *   node scripts/plugin.mjs market-remove <name>
 *
 * URL formats follow pi packages semantics: `git:` prefix is optional;
 * https://, ssh://, git@ and local paths are all accepted.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { fail, ok, parseFlags, readJson, writeJson } from "./lib/utils.mjs";

const API_BASE = "http://127.0.0.1:30142/api/robopi/plugins";
const MARKET_FILE = join(
  process.env.ROBOPI_PLUGINS_DIR ?? join(homedir(), ".pi", "agent", "robopi"),
  "market.json",
);

/** JSON request helper against the plugin API. */
async function apiRequest(path = "", options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** Load market entries, tolerating a missing/invalid file. */
function readMarket() {
  return readJson(MARKET_FILE) ?? { plugins: [] };
}

/** Persist market entries. */
function writeMarket(market) {
  writeJson(MARKET_FILE, market);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdList() {
  const { plugins } = await apiRequest("");
  if (plugins.length === 0) {
    console.log("(no plugins)");
    return;
  }
  for (const p of plugins) {
    const src = p.source
      ? `  <- ${p.source.url}${p.source.ref ? `@${p.source.ref}` : ""}`
      : "";
    console.log(`- ${p.name} v${p.version}${src}`);
  }
}

async function cmdInstall(positionals, flags) {
  const source = positionals[0];
  if (!source) fail("usage: plugin.mjs install <url> [--ref x] [--name y] [--dir z]");
  const { plugins: [plugin] } = await apiRequest("", {
    method: "POST",
    body: JSON.stringify({
      action: "install",
      source,
      ref: flags.ref,
      name: flags.name,
      dir: flags.dir,
    }),
  });
  ok(`installed ${plugin.name} v${plugin.version}`);
}

async function cmdUpdate(positionals) {
  const name = positionals[0];
  if (!name) fail("usage: plugin.mjs update <name>");
  const { plugin } = await apiRequest("", {
    method: "POST",
    body: JSON.stringify({ action: "update", name }),
  });
  ok(`updated ${plugin?.name ?? name}`);
}

async function cmdRemove(positionals) {
  const name = positionals[0];
  if (!name) fail("usage: plugin.mjs remove <name>");
  await apiRequest("", { method: "POST", body: JSON.stringify({ action: "remove", name }) });
  ok(`removed ${name}`);
}

async function cmdMarket() {
  const { plugins } = await apiRequest("/market");
  if (plugins.length === 0) {
    console.log(`(market is empty: ${MARKET_FILE})`);
    return;
  }
  console.log(`Market (${MARKET_FILE}):`);
  for (const p of plugins) {
    const state = p.installed ? `installed v${p.installedVersion}` : "not installed";
    console.log(`- ${p.name} ${state}${p.ref ? ` @${p.ref}` : ""}${p.dir ? ` dir=${p.dir}` : ""}`);
    if (p.description) console.log(`    ${p.description}`);
    console.log(`    ${p.source}`);
  }
}

async function cmdMarketAdd(positionals, flags) {
  const [name, source] = positionals;
  if (!name || !source) fail("usage: plugin.mjs market-add <name> <git-url> [--ref x] [--dir y] [--description z]");

  const market = readMarket();
  market.plugins = market.plugins.filter((p) => p.name !== name);
  market.plugins.push({
    name,
    ...(flags.description ? { description: flags.description } : {}),
    source,
    ...(flags.ref ? { ref: flags.ref } : {}),
    ...(flags.dir ? { dir: flags.dir } : {}),
  });
  writeMarket(market);
  ok(`added ${name} to market (${MARKET_FILE})`);
}

async function cmdMarketRemove(positionals) {
  const name = positionals[0];
  if (!name) fail("usage: plugin.mjs market-remove <name>");
  const market = readMarket();
  const before = market.plugins.length;
  market.plugins = market.plugins.filter((p) => p.name !== name);
  if (market.plugins.length === before) fail(`not in market: ${name}`);
  writeMarket(market);
  ok(`removed ${name} from market`);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const COMMANDS = {
  list: { run: cmdList },
  install: { run: cmdInstall },
  update: { run: cmdUpdate },
  remove: { run: cmdRemove },
  market: { run: cmdMarket },
  "market-add": { run: cmdMarketAdd },
  "market-remove": { run: cmdMarketRemove },
};

const VALUE_FLAGS = ["ref", "name", "dir", "description"];

const [, , action, ...rest] = process.argv;
const { flags, positionals } = parseFlags(rest, VALUE_FLAGS);

const command = COMMANDS[action];
if (!command) {
  fail(`unknown command: ${action ?? "(none)"}\nusage: ${Object.keys(COMMANDS).join(" | ")}`);
}

try {
  await command.run(positionals, flags);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
