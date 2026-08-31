# 上游同步手册（ADR-0005）

> 状态：已采纳（sync-check.mjs 已实现）
> 日期：2026-08-31

## 1. 目标

RoboPi Web 基于 pi-web（v0.8.11+，MIT）整文件迁移，长期跟随上游。本文定义同步策略与操作流程，保证"插件化改造不阻塞上游更新"。

## 2. 文件分类（同步策略的基础）

| 类别 | 说明 | 同步方式 |
|---|---|---|
| **A 整搬未改** | lib/ 下 99 个模块、hooks/、大部分 components、未薄壳路由（files/export/entries 等） | 整文件覆盖，零冲突 |
| **B 改造点** | 薄壳路由（30 个）、UI 挂载点（AppShell/ChatWindow/MessageView/ChatInput/SettingsPanel）、品牌化文件（layout/manifest/offline） | 3-way 手动合并，模式固定 |
| **C 独有** | lib/cordis/、lib/plugins/、lib/plugin-*、app/api/robopi/、插件体系组件、scripts/、docs/、examples/ | 与上游无关，不参与同步 |

分类清单维护在 `scripts/sync-check.mjs`（B_CLASS 集合 + C_PREFIXES 前缀）。

## 3. 同步流程（每轮上游发版）

### 3.1 巡检

```bash
node scripts/sync-check.mjs            # 只报告
node scripts/sync-check.mjs --apply    # A 类直接覆盖
node scripts/sync-check.mjs --upstream ../pi-web   # 指定上游路径
```

输出：A 类变更清单 / B 类待合并清单 / 上游新增文件 / pi SDK 依赖版本对比。

### 3.2 A 类：整文件覆盖

```bash
node scripts/sync-check.mjs --apply
# 上游新增的 lib 模块/测试自动进入工作区（git status 可见）
```

### 3.3 B 类：3-way 合并（固定模式）

**薄壳路由**（app/api 下）：

```
上游变更了什么 → 我们要同步什么
─────────────────────────────────────────
参数校验/错误码变化 → 改路由壳（薄壳本身与上游结构一致，直接比对）
返回结构变化       → 改服务方法（lib/plugins/core/* 里的逻辑）
新增业务逻辑       → 搬进服务，路由保持薄
```

**UI 挂载点**（AppShell 等 5 个）：

```
上游更新布局 → 3-way 合并后重新放回 <PluginSlot>/<ComponentRegistry> 挂载点
              （用 grep 定位，每处几行）
```

**品牌化文件**（layout/manifest/offline）：

```
合并后重新把 "RoboPi Web" 替换回来（sed）
```

### 3.4 验证（三层防线）

```bash
npm test                              # ① 553 项行为契约（上游测试随文件搬入）
node scripts/diff-api.mjs             # ② API 差分（需起 pi-web dev server 30141）
node scripts/verify-plugins.mjs       # ③ 插件端到端（Playwright，需起 RoboPi 30142）
# 手动抽查页面（挂载点渲染正常）
```

### 3.5 依赖对齐

```bash
# sync-check 会报告 SDK 版本差异；上游升级 SDK 时跟随：
npm install @earendil-works/pi-coding-agent@<上游版本> ...  # 永远跟着上游锁版走
```

### 3.6 提交

```bash
git add -A && git commit -m "sync: 同步 pi-web vX.Y.Z（sync-check + 手动合并 B 类 N 个）"
```

## 4. 每轮成本

| 类别 | 工作量 |
|---|---|
| A 类 | 5 分钟（--apply + 测试） |
| B 类薄壳路由 | 30-60 分钟（按上游改动面） |
| B 类 UI 挂载点 | 10 分钟/个 |
| 验证 | 15 分钟 |

## 5. 纪律要求

1. **A 类文件永远不改**——发现必须改的场景（bug 修复），先评估是否上游也有的问题（同步回去），本地改动会把它变成 B 类。
2. **B 类只做"薄壳/挂载点"式小改**——业务逻辑一律进服务（lib/plugins），禁止在路由里堆逻辑。
3. **C 类不碰上游文件**——新功能以插件/独立文件形式落地。
4. 上游新增路由：进入"待迁移"队列（sync-check 的新增文件清单），按 ADR-0004 的薄壳模式迁移。
