/**
 * 三层插件化端到端验证脚本（Playwright）。
 *
 * 用法：node scripts/verify-plugins.mjs
 * 前置：dev server 运行在 30142，demo-plugin 已安装到 ~/.pi/agent/pi-web/plugins/
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:30142";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  // 复用本机已下载的 chromium（版本可能与 playwright 期望不一致，显式指定路径）
  executablePath: process.env.PW_EXECUTABLE_PATH ?? undefined,
});
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });

// 等待插件加载（轮询 5s 间隔，最多等 15s）
await page.waitForFunction(() => window.robopi !== undefined, null, { timeout: 15_000 });
await page.waitForTimeout(7000); // 等 syncOnce 拉取 + 执行 entry

// 1. 位置级：sidebar-bottom 面板
const sidebarText = await page.locator('[data-plugin-host="sidebar-bottom"]').count();
check("第1层 slot：sidebar-bottom 挂载", sidebarText > 0);
const countText = await page.locator("text=会话数：").first().count();
check("第1层 slot：会话统计面板渲染", countText > 0);

// 2. 组件级：ModelSelector 覆盖
const overrideText = await page.locator("text=插件版模型选择器").first().count();
check("第2层 组件覆盖：ModelSelector", overrideText > 0);

// 3. 控制台无错误（插件相关）
const pluginErrors = consoleErrors.filter((e) => !e.includes("favicon"));
check("浏览器控制台无插件错误", pluginErrors.length === 0, pluginErrors.join(" | ").slice(0, 120));

await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "全部通过 ✅" : `${failed} 项失败 ❌`}`);
process.exit(failed === 0 ? 0 : 1);
