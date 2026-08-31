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

## 当前状态（全部阶段完成 ✅）

- **P0 地基**：Cordis 根 Context（`globalThis.__robopiRoot`，跨 HMR 存活）
- **M1–M5 迁移完成**：pi-web v0.8.11 全部 lib 模块（102 个）+ API 路由 + 前端组件
- **9 个 Cordis 服务插件**：settings / models / auth / files / session-store / sessions / worktrees / skills / packages + @web/ui-host（UI 插槽注册表）
- **可完整使用**：会话/聊天（SSE）/文件/模型/技能/插件/子代理/认证/worktree
- 质量门：553 项测试全绿 · tsc ✅ · 差分 API 20+ 路径与 pi-web 全一致

## 目录结构

```
app/                  Next.js 页面 + API 薄壳路由（45+ 路由）
  api/robopi/         平台探针（status / hello / settings 演示）
components/           前端组件（AppShell、ChatWindow、MessageView…）
hooks/                前端 hooks（useAgentSession、useTheme…）
lib/                  pi-web 迁移的纯逻辑/SDK 适配模块（102 个）
  cordis/             root.ts（根 Context）+ types.ts
  plugins/            Cordis 插件
    core/             settings·models·auth·files·session-store·sessions·worktrees·skills·packages
    web/              webui（slot 注册表）
docs/                 设计文档（ADR-0001~0004）
scripts/              diff-api.mjs（差分 API 测试工具）
```
