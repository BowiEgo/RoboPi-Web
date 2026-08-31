# RoboPi Web 实施路线图（ADR-0003）

> 状态：**全部完成（P0 → M1 → M2 → M3 → M4 → M5）**；迁移执行计划见 [0004-pi-web-migration.md](./0004-pi-web-migration.md)
> 日期：2026-08-31

## 最终状态 ✅

- **P0 地基**：Cordis 根 Context（globalThis 缓存）+ @web/ui-host + 示例插件
- **M1 纯逻辑**：71 个纯模块 + i18n + 58 测试整搬
- **M2 管理路由**：M2a~M2f 六步完成，@core/settings·models·auth·files·session-store·worktrees·skills·packages·sessions(过渡) 九个服务
- **M3 会话核心**：rpc-manager 迁移（委托零偏差），RoboPi 可真实对话（SSE 事件流端到端验证）
- **M4 前端**：components 33 + hooks 9 + app 资源 + public 全量迁移，品牌化 RoboPi Web
- **M5 平台化**：全部 lib 模块（102）与 API 路由（45+）迁移完成

质量门：**553 项测试全绿**（lib 287 + 前端 266）· tsc ✅ · 差分 API 20+ 路径全一致 · 插件端到端验证 ✅

## 遗留清单状态（2026-08-31 更新）

- [x] **Schema 配置校验**：@core/settings、@core/kv-store 已用 Cordis Schema（Config 导出），字段级校验自动生效
- [x] **UI 插件系统（三层）**：位置级 slot（PluginHost + 5 个挂载点）/ 组件级覆盖（ComponentRegistry，ModelSelector 已接入）/ 内容级消息渲染器（MessageView 分发）—— 见 ADR-0002 §8
- [x] **热更新**：插件目录 5s 轮询 + mtime 版本号破缓存
- [x] **自有插件落地**：examples/plugins/demo-plugin（三层演示，纯 JS 无构建），已安装生效
- [x] **上游同步方案**：scripts/sync-check.mjs（A/B/C 分类巡检 + --apply 覆盖 + 依赖对比）+ 手册 ADR-0005
- [x] **pin SDK 版本**：@earendil-works/* 精确锁版，sync-check 自动对比上游
- [ ] **插件 i18n 化（宿主 i18n 桥）**：`robopi.registerMessages({en, zh-CN, zh-TW})` + `api.t(key, params)` / `api.getLocale()` / `api.onLocaleChange(cb)`；`useI18n` 的 setLocale 派发 `robopi:locale` 事件桥接；插件键约定 `插件名.xxx` 前缀；存量插件（workspace/workspace-stats）文案迁移到语言包；市场描述/README 属内容层另行约定。方案评估见会话记录，预计工作量：宿主 0.5 天 + 示例迁移 0.5 天（2026-08-31 评估，待排期）

## 架构演进（评估结论，暂缓）

- **iframe 沙箱 + postMessage 白名单桥**：本地信任模型已够用；开放第三方插件市场时再引入（插件能力受限、开发体验下降，仅用于市场插件）
- **独立进程部署（Cordis 拆出）**：单机本地场景无必要；多用户服务化时再拆（WebSocket 传输，lib/agent-event-connection 已备）
- **cordis v4 迁移**：v4 仍 RC；核心 API（Context/Service/plugin/inject/on/emit）兼容面大，等正式版 + Koishi 生态跟进后评估
- **设置项可视化（Schema 驱动表单）**：Schema 元数据已就绪，后续按需生成通用设置表单
