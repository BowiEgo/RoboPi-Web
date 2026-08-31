import type { BuiltinPluginEntry } from "@/lib/cordis/types";
import * as auth from "./core/auth";
import * as files from "./core/files";
import * as hello from "./core/hello";
import * as kvStore from "./core/kv-store";
import * as models from "./core/models";
import * as packages from "./core/packages";
import * as sessionStore from "./core/session-store";
import * as sessions from "./core/sessions";
import * as settings from "./core/settings";
import * as skills from "./core/skills";
import * as webui from "./core/webui";
import * as worktrees from "./core/worktrees";

/**
 * 内置插件清单 —— 加载顺序即依赖方向（webui 最先，供后续插件注入）。
 * inject：插件级依赖声明（对象形态注册时 Cordis 读取对象上的 inject 字段）。
 */
export const builtinPlugins: BuiltinPluginEntry[] = [
  { name: webui.name, apply: webui.apply },
  { name: settings.name, apply: settings.apply, inject: settings.inject },
  { name: models.name, apply: models.apply },
  { name: auth.name, apply: auth.apply },
  { name: sessionStore.name, apply: sessionStore.apply },
  { name: sessions.name, apply: sessions.apply },
  { name: files.name, apply: files.apply },
  { name: worktrees.name, apply: worktrees.apply, inject: worktrees.inject },
  { name: skills.name, apply: skills.apply, inject: skills.inject },
  { name: packages.name, apply: packages.apply },
  { name: kvStore.name, apply: kvStore.apply, inject: kvStore.inject },
  { name: hello.name, apply: hello.apply, inject: hello.inject },
];
