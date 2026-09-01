/**
 * Shared utilities for RoboPi CLI scripts.
 *
 * Provides:
 * - parseFlags: unified CLI argument parsing (--flag value / --flag=value / repeated flags)
 * - readJson / writeJson: JSON file I/O with graceful errors
 * - fail / ok: unified output and exit-code conventions
 */

import { readFileSync, writeFileSync } from "node:fs";

/**
 * Parse argv into flags and positional arguments.
 *
 * Supported forms:
 *   --flag value        (value-taking flag)
 *   --flag=value
 *   --flag              (boolean flag)
 * Repeated flags are collected into arrays (e.g. --path a --path b).
 *
 * @param argv raw process argv slice (after node and script path)
 * @param valueFlags set of flag names that consume a following argument
 * @returns { flags: Record<string, unknown>, positionals: string[] }
 */
export function parseFlags(argv, valueFlags = []) {
  const valueFlagSet = new Set(valueFlags);
  const flags = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const rawKey = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const key = rawKey.replace(/-/g, "");
    let value = eq === -1 ? true : arg.slice(eq + 1);

    if (value === true && valueFlagSet.has(rawKey)) {
      value = argv[++i];
    }
    if (Array.isArray(flags[key])) {
      flags[key].push(value);
    } else if (key in flags) {
      flags[key] = [flags[key], value];
    } else {
      flags[key] = value;
    }
  }
  return { flags, positionals };
}

/** Read and parse a JSON file; returns null when the file is missing or invalid. */
export function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** Serialize and write a JSON file (pretty-printed, trailing newline). */
export function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Print an error and exit with the given code (default 1). */
export function fail(message, code = 1) {
  console.error(`❌ ${message}`);
  process.exit(code);
}

/** Print a success message. */
export function ok(message) {
  console.log(`✅ ${message}`);
}

/** Print a warning message. */
export function warn(message) {
  console.warn(`⚠️ ${message}`);
}
