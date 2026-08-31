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

质量门：**553 项测试全绿**（lib 287 + 前端 266）· tsc ✅ · 差分 API 20+ 路径全一致

## 遗留与后续（非阻塞）

- [ ] 引入 Schema 配置校验，设置项可视化（P1 遗留）
- [ ] PluginHost：浏览器端动态加载插件 JS（manifest + entry，@web/ui-host 已具备 slot 注册表底座）
- [ ] slots 扩展：sidebar / tabbar / settings / message-card
- [ ] 热更新：插件目录 watch + 前端刷新（不依赖 Turbopack HMR）
- [ ] 自有插件落地（后端服务 / agent 工具 / UI 组件）
- [ ] 可选：iframe 沙箱 + postMessage 白名单桥（第三方插件市场）
- [ ] 可选：独立进程部署（Cordis 拆出，WebSocket 传输）
- [ ] 定期 rebase 上游 agegr/pi-web，冲突收敛到 pi-bridge
- [ ] pin @earendil-works/pi-coding-agent 版本，升级走灰度
- [ ] 关注 cordis v4 稳定发布，评估迁移
