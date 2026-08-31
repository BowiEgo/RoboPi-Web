# 插件本地开发目录

此目录用于**在项目内开发、调试 RoboPi 插件**。每个子目录是一个独立的 git 项目（插件仓库），软链到插件目录后即改即热更。

## 目录

```
plugins-dev/
  workspace-stats/   # 示例插件（工作区统计）
```

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
