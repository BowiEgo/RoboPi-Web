# Cordis 集成规范与插件开发指南（ADR-0002）

> 状态：已采纳（P0 地基已按本文实现）
> 日期：2026-08-31

## 1. 依赖与版本

- `cordis@^3.18.1`（稳定线；v4 仍为 RC，暂不采用）
- 运行环境：Node >= 22.19，Next.js 16（Turbopack）
- Cordis 为纯库，嵌入 Next.js server 进程，无独立进程

## 2. 根 Context 模式（lib/cordis/root.ts）

```ts
const GLOBAL_KEY = "__robopiRoot";

export async function createRoot(): Promise<Context> {
  const ctx = new Context();
  for (const entry of builtinPlugins) {
    ctx.plugin({ name: entry.name, apply: entry.apply }, entry.config);
  }
  await ctx.start();
  return ctx;
}

export function getRoot(): Promise<Context> {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    const promise = createRoot().catch((error) => { delete g[GLOBAL_KEY]; throw error; });
    g[GLOBAL_KEY] = promise;
  }
  return g[GLOBAL_KEY] as Promise<Context>;
}
```

约定：
- **缓存的是 Promise 而非 Context** —— 并发 API 请求共享同一次初始化；失败自动清除缓存，下次请求重试。
- 根实例只创建一次，跨 Next.js HMR 存活；插件状态放 Cordis 服务内，不放模块级变量。
- 新插件一律加入 `lib/plugins/index.ts` 的内置清单，按依赖方向排序。

## 3. 插件形态

采用 Cordis `Plugin.Object` 形态（`{ name, apply }`），便于注册表展示与日志：

```ts
// lib/plugins/core/hello/index.ts
export const name = "@core/hello";

export interface HelloConfig { /* 插件配置 */ }

export function apply(ctx: Context, config: HelloConfig = {}) {
  // 注册服务 / 订阅事件 / 声明依赖…
}
```

命名约定：`@<scope>/<name>`，scope 取 `core`（核心服务）或 `web`（前端宿主）。

## 4. 服务定义模式

服务 = `Service` 子类，通过 `ctx.plugin(ServiceClass)` 注册，并做 Context 类型增强：

```ts
import { Context, Service } from "cordis";

declare module "cordis" {
  interface Context {
    hello: HelloService;
  }
}

class HelloService extends Service {
  constructor(ctx: Context) {
    super(ctx, "hello", true); // immediate=true：apply 期间即可访问
  }
  greet(caller: string): string { return `你好，${caller}！`; }
}

export function apply(ctx: Context) {
  ctx.plugin(HelloService);
}
```

- `immediate: true` 用于被其他插件 `ctx.inject` 依赖的服务；纯工具型服务也可设 `false`（ready 后可用）。
- 其他插件通过 `ctx.hello` 访问 —— 类型来自 `declare module "cordis"` 增强，跨文件自动生效。

## 5. 依赖声明

用 `ctx.inject(deps, callback)`（`ctx.using` 已废弃）：

```ts
ctx.inject(["webui"], () => {
  ctx.webui.register("navrail", { id: "hello", label: "Hello 演示", icon: "👋", href: "#demo-hello", order: 20 });
});
```

- 回调在依赖服务可用后执行；内置清单的加载顺序仍按依赖方向排列（双保险）。
- 依赖未安装时 Cordis 会给出明确报错，避免隐式崩溃。

## 6. 事件

自定义事件通过 `Events` 接口增强获得类型安全：

```ts
declare module "cordis" {
  interface Events<C extends Context = Context> {
    "robopi/greeting"(caller: string): void;
  }
}

// 广播（同步）
ctx.emit("robopi/greeting", name);
// 订阅
ctx.on("robopi/greeting", (caller) => ctx.logger.info("greeting from %s", caller));
```

内置生命周期事件：`ready` / `dispose` / `fork` 等（cordis 自带）。

## 7. 配置

插件配置经 `apply(ctx, config)` 第二参数传入，默认值在插件内合并：

```ts
export function apply(ctx: Context, config: SettingsConfig = {}) {
  // config.file ?? 默认路径
}
```

后续引入 `Schema`（cordis 自带 `Schema` / `z` 导出）做配置校验与设置页生成。

## 8. @web/ui-host 插槽协议（地基版）

```ts
export type WebUiSlot = "navrail" | "sidebar" | "tabbar";

export interface NavItem {
  id: string; label: string;
  href?: string; icon?: string; order?: number;
}

ctx.webui.register(slot, item); // 返回注销函数
ctx.webui.getSlot(slot);        // 按 order 升序
```

- 前端经 `GET /api/robopi/status` 拉取 `services.webui.slots`，渲染 NavRail 等组件。
- 后续扩展：组件级 slot（下发可渲染描述）、点击回调、事件推送（SSE）。

## 9. API 路由薄壳约定

```ts
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getRoot();   // 拿到已 start 的根 Context
  return NextResponse.json({ ...ctx.xxx 服务调用 });
}
```

- 路由不做业务逻辑，只做参数校验 + 服务调用 + 序列化。
- 服务抛错时路由统一转 500（地基阶段），后续按服务细分错误码。

## 10. 测试

- 测试文件：`lib/**/*.test.mjs`（node:test + jiti 加载 TS，需 `tsconfigPaths: true` 解析 `@/` 别名）。
- 命令：`npm test`。
- 模式：`createRoot()` 起真实根实例 → 断言服务行为 → `ctx.stop()` 清理。
- 注意：测试与 dev server 是独立进程，互不干扰；kv-store 测试会写入 `.robopi/settings.json`。

## 11. 自有插件开发步骤（模板）

1. `mkdir lib/plugins/<scope>/<name>/`，新建 `index.ts`（按 §3–§6 模式编写）；
2. 在 `lib/plugins/index.ts` 加入清单（按依赖方向排序）；
3. 需要 UI 时经 `@web/ui-host` 注册 slot 项；
4. `npm run typecheck && npm test`；
5. dev server 下直接访问页面验证（根实例缓存于 globalThis，HMR 不重建）。

## 12. 内置插件清单（现状）

| 插件 | 服务 | 职责 | 状态 |
|---|---|---|---|
| @web/ui-host | `ctx.webui` | UI 插槽注册表（navrail/sidebar/tabbar） | ✅ P0 |
| @core/settings | `ctx.settings` | pi SettingsManager 包装（~/.pi/agent/settings.json） | ✅ M2a |
| @core/models | `ctx.models` | models.json 读写 + 模型连通性测试 | ✅ M2a |
| @core/kv-store | `ctx.kvStore` | RoboPi 自有 KV（.robopi/settings.json，演示用） | ✅ P0 |
| @core/session-store | `ctx.sessionStore` | 会话读取（列表/上下文/分支切片，M2f 前置） | ✅ M2c |
| @core/files | `ctx.files` | 文件访问权限边界（allowed roots） | ✅ M2c |
| @core/worktrees | `ctx.worktrees` | git worktree 操作 + git 状态/差异 + cwd 授权 | ✅ M2d |
| @core/hello | `ctx.hello` | 示例服务（事件 + 依赖声明演示） | ✅ P0 |

## 13. 差分 API 测试

`node scripts/diff-api.mjs` —— 对比 pi-web(30141) 与 RoboPi(30142) 的 GET 响应：

```bash
node scripts/diff-api.mjs                          # 默认路径集
node scripts/diff-api.mjs --path /api/home         # 追加路径（可重复）
node scripts/diff-api.mjs --verbose                # 打印完整差异
```

- 忽略字段白名单（IGNORE_FIELDS）剔除易变值；
- 双方 5xx 视为等价（上游网络问题）；
- 退出码 0 = 全部一致（可接入 CI）。

1. `mkdir lib/plugins/<scope>/<name>/`，新建 `index.ts`（按 §3–§6 模式编写）；
2. 在 `lib/plugins/index.ts` 加入清单（按依赖方向排序）；
3. 需要 UI 时经 `@web/ui-host` 注册 slot 项；
4. `npm run typecheck && npm test`；
5. dev server 下直接访问页面验证（根实例缓存于 globalThis，HMR 不重建）。
