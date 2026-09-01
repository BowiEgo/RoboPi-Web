#!/usr/bin/env node
/**
 * verify-plugins.mjs - End-to-end verification of the plugin system via Playwright.
 *
 * Usage:
 *   node scripts/verify-plugins.mjs
 *
 * Prerequisites:
 *   - dev server running on http://127.0.0.1:30142
 *   - demo-plugin installed under ~/.pi/agent/robopi/plugins/
 *   - worktable plugin auto-mounted from plugins-dev (dev mode)
 *
 * Checks:
 *   - Level-1 slots: sidebar-bottom host mounts plugin panels
 *   - Level-2 component override: ModelSelector replaced by a plugin
 *   - Worktable container: collapsible header + worktable list
 *   - No browser console/page errors
 */

import { chromium } from "playwright";

const BASE = "http://127.0.0.1:30142";
const EXECUTABLE_PATH =
  process.env.PW_EXECUTABLE_PATH ??
  "/Users/boboboost/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell";

const results = [];
function check(name, okFlag, detail = "") {
  results.push({ name, ok: okFlag });
  console.log(`${okFlag ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  // Open the first session so the chat area (and ModelSelector) renders
  const res = await fetch(`${BASE}/api/sessions`, { cache: "no-store" });
  const { sessions } = await res.json().catch(() => ({ sessions: [] }));
  const sessionId = sessions?.[0]?.id;
  if (sessionId) {
    await page.goto(`${BASE}/?session=${encodeURIComponent(sessionId)}`, { waitUntil: "networkidle", timeout: 60_000 });
  } else {
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  }

  // Wait for plugin polling + entry loading (first sync runs on subscribe)
  await page.waitForFunction(() => window.robopi !== undefined, null, { timeout: 15_000 });
  await page.waitForTimeout(9_000);

  const sidebarText = await page.evaluate(() => {
    const host = document.querySelector('[data-plugin-host="sidebar-bottom"]');
    return host ? host.textContent : "";
  });
  const dockInfo = await page.evaluate(() => {
    // The dock panel is plugin-owned; locate it via its close button
    const btn = document.querySelector('button[aria-label="关闭工作台"]');
    const panel = btn?.parentElement?.parentElement;
    return {
      exists: !!panel,
      text: panel ? panel.textContent : "",
    };
  });

  // Level-1: sidebar-bottom hosts plugin content
  check("level-1 slot: sidebar-bottom mounted", sidebarText.length > 0);
  check("demo-plugin panel rendered", sidebarText.includes("demo-plugin"));

  // Worktable dock panel: renders beside the chat column, default visible
  check("worktable dock rendered (default visible)", dockInfo.exists);
  check("worktable items (overview/wiki/office)", ["概览", "Wiki 知识库", "办公助手"].every((t) => sidebarText.includes(t)));

  // Level-2: component override mechanism (register a probe override directly,
  // independent of demo-plugin's own (currently disabled) override sample)
  await page.evaluate(() => {
    window.robopi.registerComponent("ModelSelector", () => () =>
      window.React.createElement("div", null, "VERIFY-OVERRIDE"),
    );
  });
  await page.waitForTimeout(1_500);
  const overrideText = await page.evaluate(() => document.body.innerText);
  check("level-2 component override mechanism", overrideText.includes("VERIFY-OVERRIDE"));

  check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "all passed ✅" : `${failed} check(s) failed ❌`}`);
process.exit(failed === 0 ? 0 : 1);
