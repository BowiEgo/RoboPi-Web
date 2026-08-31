# RoboPi Web 总体架构设计（ADR-0001）

> 状态：已采纳（P0 地基已按本文实现）
> 日期：2026-08-31

## 1. 背景与目标

RoboPi Web 是基于 [pi-web](https://github.com/agegr/pi-web)（MIT，v0.8.11）二次开发的新 Agent 平台：

- **目标 A**：保留 pi-web 完整能力（会话、文件、模型、技能、认证、子代理、工作树），并持续跟上上游。
- **目标 B**：把后端模块用 **Cordis 插件系统**（v3，Koishi 生态的插件框架）重构，实现模块化、可插拔、可热重载、可测试。
- **目标 C**：支持自有插件——包括后端服务插件、Agent 工具插件、**UI 组件插件**（导航栏等）。

## 2. 现状分析（pi-web）

### 2.1 架构

```
Browser (React + CSS 变量)          Next.js Server            AgentSession (in-process)
  AppShell / ChatWindow  ◀───HTTP/SSE─── lib/rpc-manager.ts ──── pi SDK 扩展 (ctx.ui.*)
                                       session-reader.ts 读 .jsonl
```

- 会话运行时：`AgentSession`（pi SDK）in-process，经 `globalThis.__piSessions` 注册表管理（规避 HMR 重置）。
- 模块边界清晰：`lib/` 下每功能一文件（settings/models/auth/files/worktrees/skills/subagents/plugins/i18n…），API 路由一一对应。
- 现有"插件系统"= pi SDK 扩展体系（按会话绑定）+ 包分发（npm/git）+ pi-web 管理 UI，**缺少 DI、依赖声明、配置 schema**。

### 2.2 差距

| 能力 | pi 扩展 | Cordis |
|---|---|---|
| 依赖声明 | ❌ | ✅ `ctx.inject()` |
| 服务注册/DI | ❌ | ✅ 核心能力 |
| 热重载 | `/reload` 会话级 | `ctx.reload()` 插件级 |
| 配置 schema | ❌ | ✅ |
| 作用域 | global/project | ctx 作用域树 |
| UI 组件（chrome 层） | ❌ 仅聊天区内 | 需宿主提供 slot |

## 3. 目标架构（三层）

```
Browser (Next.js 前端)
  AppShell / ChatWindow / PluginHost(slot 渲染)
        │ HTTP + SSE（现有通道不变）
Next.js Server (in-process)
  API routes（薄壳，转发给 Cordis 服务）
        │
globalThis.__robopiRoot ← Cordis 根 Context（跨 HMR 存活）
  ├─ @core/settings    ├─ @core/models   ├─ @core/auth
  ├─ @core/files       ├─ @core/worktrees├─ @core/skills
  ├─ @core/subagents   ├─ @core/packages ├─ @core/i18n
  ├─ @core/session-store
  ├─ @core/sessions    ← 会话服务（迁移自 rpc-manager）
  ├─ @core/pi-bridge   ← pi SDK 适配层（AgentSession 工厂 + 扩展桥 + 工具注册桥）
  └─ @web/ui-host      ← Web 插件宿主（slots：navrail/sidebar/tabbar/…）
        │
AgentSession (pi SDK，.jsonl 会话格式保持兼容)
pi 扩展系统（按会话绑定，原样保留）
```

### 3.1 关键决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | **单进程**：Cordis 跑在 Next.js server 内 | HTTP/SSE/会话 in-process 架构不动，改动面最小 |
| D2 | **保留 pi 扩展系统**，经 pi-bridge 桥接 | 避免重写 pi 扩展 API 面；双插件系统边界见 §4 |
| D3 | **.jsonl 会话格式兼容** | 保留 pi 生态互操作价值 |
| D4 | 根 Context 缓存在 `globalThis.__robopiRoot`（Promise 形式） | 跨 HMR 存活；并发请求共享同一次初始化 |
| D5 | API routes 保持原签名，内部转发 | 前端契约不变，rebase 冲突最小化 |
| D6 | Web UI 插件本地信任模型 | pi 扩展本就有完整系统权限，威胁模型一致；第三方市场再升级 iframe 沙箱 |

## 4. 双插件系统边界

| 层 | 系统 | 生命周期 | 职责 |
|---|---|---|---|
| 服务层 | **Cordis 插件** | 应用级（root ctx） | settings/models/auth/sessions/…、依赖注入、配置 |
| 会话层 | **pi 扩展** | 会话级（bindExtensions per wrapper） | 工具、ctx.ui 交互、事件拦截、自定义消息 |
| 组件层 | **Web UI 插件**（@web/ui-host slots） | 应用级（浏览器） | 导航栏、侧边栏卡片、TabBar 按钮、设置面板项 |

桥接约定：Cordis 插件需要给 agent 暴露工具时，经 `@core/pi-bridge` 的 `registerTool()` 注入；pi 扩展需要应用级状态时，经 `ctx.emit` 广播到 Cordis 事件总线。

## 5. 模块 → 插件映射（迁移目标）

| pi-web 模块 | Cordis 插件 | 依赖 |
|---|---|---|
| lib/settings.ts 等 | @core/settings | — |
| models.json / model-scope | @core/models | settings |
| provider-listing / auth | @core/auth | settings |
| file-access / path-security | @core/files | — |
| worktree.ts | @core/worktrees | files |
| session-reader.ts | @core/session-store | files |
| **rpc-manager.ts** | @core/sessions | settings, models, pi-bridge |
| subagent-settings / runtime | @core/subagents | sessions, settings |
| tool-presets / startup-preferences / chat-only | @core/session-policy | sessions |
| skills 路由 | @core/skills | settings, npx |
| plugins 路由 | @core/packages | settings, npx |
| i18n | @core/i18n | — |
| —（新增） | @web/ui-host | sessions, files, models |

## 6. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| pi SDK 升级破坏桥接层 | 中 | pin 版本；适配层隔离在 pi-bridge 一个目录 |
| 双插件系统心智负担 | 中 | 本文 §4 边界 + 开发规范文档 |
| HMR 与 Cordis 实例生命周期 | 低-中 | 根 ctx 挂 globalThis（D4） |
| 插件热重载打断运行中会话 | 中 | 服务级 reload 不碰 AgentSession；会话级变化才重建 wrapper |
| rebase 上游冲突（rpc-manager 重灾区） | 中 | 迁移后核心逻辑收进插件，冲突面收敛到 pi-bridge |
| 磁盘空间 | — | 本机开发注意 npm 缓存/多项目 node_modules 占用 |

## 7. 参考

- [0002-cordis-plugin-spec.md](./0002-cordis-plugin-spec.md) — Cordis 集成规范与插件开发指南
- [0003-roadmap.md](./0003-roadmap.md) — 实施路线图
