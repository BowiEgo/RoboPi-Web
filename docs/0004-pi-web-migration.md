# pi-web → RoboPi Web 分阶段迁移方案（ADR-0004）

> 状态：评估完成，待评审
> 日期：2026-08-31
> 目标源：pi-web v0.8.11（upstream: github.com/agegr/pi-web，MIT）

## 1. 规模基线（迁移对象）

| 区域 | 文件数 | 行数 | 说明 |
|---|---|---|---|
| app/api | 55 | 4.8K | 20 个路由组；其中 15 个文件直接 import pi SDK |
| lib | 203 | 25.5K | 102 个 TS 模块；**70 个无相对导入的叶子模块**，23 个依赖 pi SDK |
| components | 70 | 25.2K | AppShell(2455) / SessionSidebar(2254) / ChatWindow / MessageView… |
| hooks | 13 | 3.6K | useAgentSession(2K+) / useTheme / useAudio… |
| 测试 | 144 | — | `.test.mjs`（node:test），是每模块迁移的验收标准 |
| 合计 | ~341 | ~59K | — |

两个关键事实：
- **rpc-manager.ts（2043 行）+ session-reader.ts（652 行）是唯一真正困难的核心**，其余模块要么是纯逻辑、要么是薄包装。
- **70/102 的 lib 模块是叶子纯函数**，可整文件复制、零风险。

## 2. 迁移策略评估

| 策略 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| A. 绞杀者（推荐） | RoboPi-web 为宿主，按依赖深度分层搬入模块，每层可验收 | 每步可验证可回滚；Cordis 地基逐步变厚；风险隔离 | 长期两仓库并存；上游变更需按模块同步 |
| B. 整树复制 | 把 pi-web 全量复制进 RoboPi-web 再就地重构 | 单一代码库，一次 rebase | 重构期代码库混合新旧两套模式；Cordis 接入被 59K 行淹没；迁移不可见 |
| C. 仅 API 层迁移 | 只搬路由，逻辑仍调 pi-web 服务 | 最省 | 两仓库运行时耦合，违背目标架构，否决 |

**推荐 A（绞杀者模式）**，理由：
1. 70 个叶子模块可以"整文件搬运 + 测试全绿"的方式快速消灭，前期收益立竿见影；
2. 每阶段结束 RoboPi-web 都是一个可运行、可测试的完整应用；
3. 风险最高的会话核心（rpc-manager）被压到中期单独处理，有充分的准备时间；
4. 上游同步成本可控（见 §6）：纯模块覆盖式同步，薄壳路由手动合并。

## 3. 数据共享决策（迁移期关键约束）

RoboPi-web 与 pi-web 共享 `~/.pi/agent/`（sessions/settings/models/auth/extensions）。

| 阶段 | 写操作 | 冲突风险 |
|---|---|---|
| M1 纯逻辑 | 无 | 无 |
| M2 管理路由 | settings/models.json（已有 proper-lockfile 跨进程锁） | 低，但约定**不同时**在两应用操作同一配置 |
| M3 会话核心 | sessions .jsonl 写入 | **高**：两进程对同一会话 wrapper 状态不一致 |
| M4+ 前端 | 跟随 M3 | 同 M3 |

决策：
- M1–M2 可安全并行，遵守"同一配置不同时写"约定；
- **M3 起启用隔离测试目录**：RoboPi-web 的 `@core/sessions` 支持配置 `sessionDir`（对应 pi SDK 的 `--session-dir`），联调时指向 `~/.robopi/sessions-test/`，避免与 pi-web 的真实会话互相污染；
- M5 收尾后再决定是否默认指向 `~/.pi/agent`（产品形态决策）。

## 4. 分阶段计划

### M1：纯逻辑层搬移（1–2 天，风险：极低）

- **范围**：70 个叶子模块 + 其余无 SDK 依赖的纯模块（types/api-types/normalize/markdown/i18n 消息文件等），连同各自的 `.test.mjs` 一起搬。
- **形态**：普通 TS 模块（不经 Cordis），保持路径结构 `lib/` 一致，便于上游 diff。
- **验收**：对应测试全绿；`tsc --noEmit` 通过。
- **产出**：RoboPi-web 的 lib/ 拥有 pi-web 的纯逻辑底座。

### M2：管理路由迁移（1.5–2.5 周，风险：低）

按业务域拆成小阶段，每步 = 「Cordis 插件 + 薄壳路由 + 测试」：

| 步 | 插件 | 迁移路由 | 依赖的 SDK 面 | 状态 |
|---|---|---|---|---|
| M2a | @core/settings、@core/models | models-config、models-config/catalog、models-config/discover、models-config/test、home | SettingsManager、ModelRuntime | ✅ 已完成 |
| M2b | @core/auth | auth/* | AuthStorage | ✅ 已完成 |
| M2c | @core/files + @core/session-store（M2f 前置） | files、cwd/validate、file-index、default-cwd | fs 权限体系 + SessionManager 读取面 | ✅ 已完成 |
| M2d | @core/worktrees | worktrees、git/status、git/diff | git 操作 | ✅ 已完成 |
| M2e | @core/skills + @core/packages | skills、skills/check/update/install/search、plugins | DefaultResourceLoader、DefaultPackageManager | ✅ 已完成 |
| M2f | @core/sessions（过渡版）+ @core/session-store | sessions 全套只读、project-trust、app-update、push、tools、subagents 全套 | SessionManager 读取面 | ✅ 已完成 |

- **前置决策**：`@core/settings` 的存储路径从 `.robopi/settings.json` **切换到 `~/.pi/agent/settings.json`**（与 pi 生态一致），地基的 settings 插件升级为读 pi 配置。
- **验收**：① 对应测试全绿；② **差分 API 测试**（`scripts/diff-api.mjs`：同一请求同时打 pi-web 与 RoboPi-web，对比 JSON，允许白名单字段差异）——这是 M2 的核心验收工具。
- **风险点**：provider-listing（双认证 provider 去重逻辑）、model-scope（SDK 委托）等细节逻辑要原样搬，不做"顺手重构"。

### M3：会话核心迁移（1–2 周，风险：高，唯一硬骨头）

- **范围**：`@core/sessions`（迁移 rpc-manager 2043 行）+ `@core/pi-bridge`（AgentSession 工厂、扩展绑定、工具合并）+ `@core/session-store`（session-reader 652 行）+ agent 全部路由（new/[id]/events/running）。
- **必须保住的 pi 语义**（逐条验收）：
  1. fork 后立即销毁 wrapper（防 parentSession 链污染）；
  2. 10 分钟 idle 超时 + 并发 start 共享锁（`__piStartLocks` 语义迁入服务）；
  3. Chat-only 边界重建 wrapper（toolNames 空数组）；
  4. SSE：run id 单调性、prompt_done/compaction_start 双事件兼容、30 秒宽限窗复用；
  5. 扩展 UI 协议（bindExtensions + PlainTextTheme + custom_ui_input）；
  6. ToolCall 字段归一化（normalizeToolCalls 两个调用点）。
- **验收**：会话全流程手工验证（创建/消息/SSE/fork/分支导航/压缩/扩展 UI）+ 迁移上游测试 + 差分测试（本轮差分允许少量字段差异，逐一记录）。
- **启用隔离测试目录**（§3 决策）。

### M4：前端迁移（2–3 周，风险：中）

- **M4a 只读 UI**（1 周）：SessionSidebar（会话树）、FileExplorer、FileViewer、TabBar、SettingsPanel、ModelsConfig、PluginsConfig、SkillsConfig、AgentsConfig、i18n 语言包 —— 全部依赖 M2 的路由，先于聊天可用。
- **M4b 聊天 UI**（1.5–2 周）：ChatWindow、MessageView、ChatInput、BranchNavigator、ChatMinimap、MarkdownBody（含 mermaid/katex 渲染依赖）、useAgentSession、useAudio —— 依赖 M3。
- **形态**：先以 pi-web 原样组件搬入（保持行为一致），插件化改造放到 M5。
- **验收**：对照 pi-web 逐页面人工比对 + 现有前端测试迁移。

### M5：平台化收尾（3–5 天，风险：低）

- 把 M1 搬入的纯模块按业务域聚合进既有 Cordis 插件（@core/models/@core/auth/@core/files…），消灭过渡期的"直连 import"；
- 清理与 pi-web 的路径差异（如需），整理测试覆盖；
- 达到 ADR-0001 的目标架构（§3 三层图）。

### 里程碑汇总

| 里程碑 | 内容 | 工期 | 可交付物 |
|---|---|---|---|
| M1 | 纯逻辑底座 | 1–2 天 | lib 纯模块 + 测试全绿 |
| M2 | 管理路由（六步） | 1.5–2.5 周 | 只读/管理功能 + 差分测试工具 |
| M3 | 会话核心 | 1–2 周 | 可聊天的 RoboPi |
| M4 | 前端 | 2–3 周 | 完整 UI |
| M5 | 平台化 | 3–5 天 | 目标架构 |
| **合计** | | **6–9 周（单人）** | |

## 5. 依赖引入（M2 前置）

```bash
npm install @earendil-works/pi-coding-agent@0.84.3 @earendil-works/pi-agent-core@0.84.3 \
  @earendil-works/pi-ai@0.84.3 @earendil-works/pi-tui@0.84.3 ansi_up js-yaml proper-lockfile \
  undici web-push remark-frontmatter
# devDeps: @types/*、react-markdown、remark-gfm、rehype-*、mermaid、katex、react-syntax-highlighter…
```

并在 next.config.ts 追加 `serverExternalPackages`（参照 pi-web 配置）。

## 6. 上游同步策略

渐进迁移下两仓库长期并存，上游同步按模块分层：

| 层 | 同步方式 | 成本 |
|---|---|---|
| 纯模块（M1 搬入的） | 整文件覆盖（diff 后手动核对） | 低 |
| 薄壳路由（M2+） | 上游变更 → 3-way 合并到插件实现 | 中 |
| rpc-manager 迁移物 | 变更收敛到 @core/pi-bridge | 中（ADR-0001 D5） |

操作建议：
- 将 pi-web 添加为 git remote：`git remote add upstream ../pi-web`（或 GitHub URL）；
- 每次上游 release 跑一次同步巡检：`git diff --no-index` 对比同名文件清单（维护 `scripts/sync-check.mjs` 读两份路径映射）；
- 原则：**先同步上游，再改造成薄壳**，避免合并历史复杂化。

## 7. 风险与回滚

| 风险 | 等级 | 缓解 |
|---|---|---|
| M3 会话语义破坏（fork/SSE/锁） | 高 | 逐条验收清单（§4 M3）；隔离测试目录；回滚 = revert M3 commit，RoboPi-web 回到 M2 可用态 |
| M2 差分测试暴露 pi-web 隐式行为 | 中 | 白名单记录差异，不"顺手改"pi-web 行为 |
| 上游活跃迭代（v0.8.x 快）导致合并成本 | 中 | 定期巡检 + 纯模块覆盖式同步 |
| 共享数据目录并发写 | 中 | §3 约定 + M3 起隔离 sessionDir |
| 前端 25K 行搬移中的样式漂移 | 低 | CSS 变量体系已复刻；逐页面比对 |

## 8. 决策点（开工前确认）

1. `@core/settings` 切换至 `~/.pi/agent/settings.json`（M2 前置，已建议）✅/❌
2. M3 起隔离 sessionDir 测试目录（已建议）✅/❌
3. 迁移期是否同时维护 pi-web 仓库的本地 clone（用于差分测试）——建议保留 `~/Documents/Codes/pi-web` 不删除
4. M5 后默认数据目录指向（产品形态决策，可推迟）
