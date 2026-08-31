# 插件本地开发目录

此目录用于**在项目内开发、调试 RoboPi 插件**。每个子目录是一个独立的 git 项目（插件仓库），软链到插件目录后即改即热更。

## 目录

```
plugins-dev/
  workspace-stats/   # 纯 JS 插件示例（零构建，改文件即热更）
  tsx-workspace/     # TSX 插件示例（esbuild watch 构建 + 类型安全）
```

## 两种开发模式

| 模式 | 适用 | 热更新链条 |
|---|---|---|
| **纯 JS**（workspace-stats） | 简单插件 | 改 index.js → 浏览器 5 秒热更 |
| **TSX**（tsx-workspace） | 复杂插件、要类型安全 | 改 src/*.tsx → `npm run dev`（esbuild --watch=forever 自动编译）→ 浏览器 5 秒热更 |

### TSX 模式要点

```bash
cd plugins-dev/tsx-workspace
npm install          # 安装 esbuild
npm run dev          # watch 编译（注意：后台运行时用 --watch=forever，见 package.json）
npm run build        # 产物 dist/index.js（发布时提交）
# 类型检查（复用主项目 tsc）：
cd ../.. && node_modules/.bin/tsc -p plugins-dev/tsx-workspace/tsconfig.json
```

- JSX 编译为 `window.React.createElement`（tsconfig 的 jsxFactory），**不 bundle React**（避免双实例）
- `plugin-env.d.ts` 提供 `window.robopi`/`window.React`/全局 JSX 类型（React 19 移除了全局 JSX，已从 React.JSX 重导出）
- `import type * as React from "react"` 只做类型用，运行时从宿主取
- 发布：`dist/` 提交进仓库，市场安装无需构建

## 开发流程

```bash
# 1. 创建插件目录（或复制 workspace-stats 改名）
mkdir plugins-dev/my-plugin
# 编写 manifest.json + index.js

# 2. 初始化 git（本目录是独立仓库，将来 push 远程即可分发）
cd plugins-dev/my-plugin
git init && git add -A && git commit -m "init"

# 3. 软链到插件目录（改文件即热更，5 秒生效）
ln -s "$PWD" ~/.pi/agent/robopi/plugins/my-plugin

# 4. 打开 http://127.0.0.1:30142 开发调试
#    （修改 index.js 保存 → 页面自动刷新插件，无需重启）
```

## 发布流程

```bash
cd plugins-dev/my-plugin
git remote add origin git@github.com:you/my-plugin.git
git push -u origin main && git tag v1.0.0 && git push --tags
```

然后在 `~/.pi/agent/robopi/market.json` 收录：

```json
{ "plugins": [{ "name": "my-plugin", "description": "…", "source": "git:git@github.com:you/my-plugin.git", "ref": "v1.0.0" }] }
```

## 插件 API（window.robopi）

```js
robopi.registerSlot("sidebar-bottom", (api) => React 元素);          // 位置级
robopi.registerSlot("tabbar-right" | "chat-toolbar" | "settings-section", …);
robopi.registerComponent("ModelSelector", () => React 组件);          // 组件级覆盖
robopi.registerMessageRenderer("customType", (message, api) => …);    // 内容级
api.getStatus() / api.listSessions() / api.openSession(id)            // 宿主 API 桥
window.React  // 宿主暴露的 React 19（无需构建工具）
```

可用全局：`window.robopi`、`window.React`。样式用宿主 CSS 变量（`var(--bg)`、`var(--accent)` 等）。

## 注意事项

- `plugins-dev/` 目录已被主仓库 .gitignore 忽略（插件代码归属插件自己的 git 仓库）
- 软链目录名可随意（插件身份 = manifest.json 的 name），如想立即发布可让目录名 = name
- 本地开发目录（软链）不会被 `plugin.mjs remove` 删除（无 .git-source.json 元数据 = 受保护）
