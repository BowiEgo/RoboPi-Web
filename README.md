# RoboPi Web

基于 [pi-web](https://github.com/agegr/pi-web) 与 [Cordis](https://github.com/cordisjs/cordis) 插件系统的新 Agent 平台。

- 📐 架构与决策：[docs/0001-architecture.md](./docs/0001-architecture.md)
- 🔌 插件开发规范：[docs/0002-cordis-plugin-spec.md](./docs/0002-cordis-plugin-spec.md)
- 🗺️ 路线图：[docs/0003-roadmap.md](./docs/0003-roadmap.md)

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:30142
```

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器（端口 30142） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 单元测试（node:test + jiti） |
| `npm run lint` | ESLint |

## 当前状态（P0 地基）

- Cordis 根 Context（`globalThis.__robopiRoot`，跨 HMR 存活）
- 内置插件：`@web/ui-host`（UI 插槽注册表）、`@core/settings`（JSON 原子持久化）、`@core/hello`（示例服务）
- 全链路示例：左侧导航栏（navrail 插槽）→ `/api/robopi/status` → Cordis 服务

## 目录结构

```
app/                  Next.js 页面 + API 薄壳路由
  api/robopi/         status / hello / settings
components/           前端组件（NavRail、FoundationStatus）
lib/
  cordis/             root.ts（根 Context）+ types.ts
  plugins/            Cordis 插件
    core/             settings / hello / webui
docs/                 设计文档（ADR）
```
