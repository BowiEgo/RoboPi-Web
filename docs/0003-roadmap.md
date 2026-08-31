# RoboPi Web 实施路线图（ADR-0003）

> 状态：P0 已完成；pi-web 迁移执行计划详见 [0004-pi-web-migration.md](./0004-pi-web-migration.md)
> 日期：2026-08-31

## P0 ✅ 地基（已完成）

- [x] 项目骨架（镜像 pi-web：app/ lib/ components/，CSS 变量体系，30142 端口）
- [x] Cordis 接入：根 Context（globalThis 缓存）、内置插件清单、API 薄壳
- [x] 内置插件：`@web/ui-host`（slot 注册表）、`@core/settings`（JSON 原子持久化）、`@core/hello`（服务 + 事件 + 依赖声明示例）
- [x] 全链路示例：NavRail（导航栏插槽）→ `/api/robopi/status` → `ctx.webui`；hello/settings 表单
- [x] 测试 4 项全过；类型检查通过

## P1 周边服务插件化（约 2–4 周）

> 迁移执行计划：见 ADR-0004 的 M2（管理路由六步）与 M5（平台化收尾）

- [x] M2a：@core/settings（pi SettingsManager 包装）+ @core/models + 路由 home/models-config 四件套 + 差分 API 工具（scripts/diff-api.mjs，5 路径全一致）
- [x] M2b：@core/auth → auth/* 路由（4 路由差分全一致）
- [x] M2c：@core/files + @core/session-store（M2f 前置）→ files/cwd/file-index/default-cwd（差分全一致）
- [x] M2d：@core/worktrees → worktrees/git（差分全一致）
- [ ] M2e：@core/skills + @core/packages → skills/plugins 路由
- [ ] M2f：@core/project → sessions 只读等
- [ ] 引入 Schema 配置校验，设置项可视化
- [ ] 迁移 pi-web 的 .test.mjs 测试，补服务级测试（ctx.mock 模式）

## P2 会话核心迁移（约 1–2 周，唯一高难度项）

> 迁移执行计划：见 ADR-0004 的 M3（会话核心，含逐条语义验收清单）

- [ ] `@core/sessions`：迁移 rpc-manager 的 wrapper 注册表（globalThis.__piSessions → Cordis 服务）
- [ ] 保住 pi 语义：fork 后立即销毁 wrapper、10 分钟 idle 超时、并发 start 共享锁、Chat-only 边界重建、SSE 重连与 run id 单调性
- [ ] `@core/pi-bridge`：AgentSession 工厂（createAgentSessionServices 注入点）+ 扩展绑定 + 工具注册桥（Cordis 插件 → pi 工具）
- [ ] `@core/session-store`：session-reader 迁移（.jsonl 格式不变）

## P3 Web 插件宿主完善（约 1–2 周）

- [ ] PluginHost：浏览器端动态加载插件 JS（manifest + entry）
- [ ] slots 扩展：sidebar / tabbar / settings / message-card
- [ ] 热更新：插件目录 watch + 前端刷新（不依赖 Turbopack HMR）
- [ ] 自有导航栏插件落地（RoboPi 产品化入口）

## P4 自有插件与产品化（持续）

- [ ] 业务插件逐个落地（后端服务 / agent 工具 / UI 组件）
- [ ] 可选：iframe 沙箱 + postMessage 白名单桥（第三方插件市场）
- [ ] 可选：独立进程部署（Cordis 拆出，WebSocket 传输）

## 持续事项

- [ ] 定期 rebase 上游 agegr/pi-web，冲突收敛到 pi-bridge
- [ ] pin @earendil-works/pi-coding-agent 版本，升级走灰度
- [ ] 关注 cordis v4 稳定发布，评估迁移
