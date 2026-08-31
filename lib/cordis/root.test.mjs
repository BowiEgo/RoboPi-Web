import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { createRoot } = await createJiti(import.meta.url, {
  tsconfigPaths: true,
}).import("./root.ts");

test("Cordis 根实例加载全部内置插件", async () => {
  const ctx = await createRoot();
  const names = [...ctx.registry.values()].map((scope) => scope.name);
  for (const expected of ["@web/ui-host", "@core/settings", "@core/hello"]) {
    assert.ok(names.includes(expected), `缺少插件 ${expected}`);
  }
  await ctx.stop();
});

test("@core/hello 服务可调用并广播事件", async () => {
  const ctx = await createRoot();
  let greeted = "";
  ctx.on("robopi/greeting", (caller) => {
    greeted = caller;
  });
  const message = ctx.hello.greet("测试");
  assert.match(message, /测试/);
  assert.equal(greeted, "测试");
  assert.equal(ctx.hello.stats.calls, 1);
  await ctx.stop();
});

test("@web/ui-host 的 navrail 插槽包含各插件注册项", async () => {
  const ctx = await createRoot();
  const items = ctx.webui.getSlot("navrail");
  const ids = items.map((item) => item.id);
  for (const expected of ["overview", "hello", "settings"]) {
    assert.ok(ids.includes(expected), `navrail 缺少 ${expected}`);
  }
  // 按 order 升序
  const orders = items.map((item) => item.order ?? 0);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  await ctx.stop();
});

test("@core/kv-store 服务读写并持久化", async () => {
  const ctx = await createRoot();
  await ctx.kvStore.set("robopi.test", "地基通过");
  assert.equal(ctx.kvStore.get("robopi.test"), "地基通过");
  assert.equal(ctx.kvStore.get("不存在的键", "fallback"), "fallback");
  await ctx.stop();
});

test("@core/settings 包装 pi SettingsManager，可读默认模型", async () => {
  const ctx = await createRoot();
  assert.ok(ctx.settings.manager);
  const defaultModel = ctx.settings.getDefaultModel();
  assert.ok(defaultModel === null || typeof defaultModel.provider === "string");
  await ctx.stop();
});

test("@core/models 读写 models.json 配置", async () => {
  const ctx = await createRoot();
  const config = ctx.models.readConfig();
  assert.ok(typeof config === "object" && config !== null);
  await ctx.stop();
});
