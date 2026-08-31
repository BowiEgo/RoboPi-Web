import type { BuiltinPluginEntry } from "@/lib/cordis/types";
import * as auth from "./core/auth";
import * as files from "./core/files";
import * as hello from "./core/hello";
import * as kvStore from "./core/kv-store";
import * as models from "./core/models";
import * as sessionStore from "./core/session-store";
import * as settings from "./core/settings";
import * as webui from "./core/webui";
import * as worktrees from "./core/worktrees";

/**
 * 内置插件清单 —— 加载顺序即依赖方向（webui 最先，供后续插件注入）。
 */
export const builtinPlugins: BuiltinPluginEntry[] = [
  { name: webui.name, apply: webui.apply },
  { name: settings.name, apply: settings.apply },
  { name: models.name, apply: models.apply },
  { name: auth.name, apply: auth.apply },
  { name: sessionStore.name, apply: sessionStore.apply },
  { name: files.name, apply: files.apply },
  { name: worktrees.name, apply: worktrees.apply },
  { name: kvStore.name, apply: kvStore.apply },
  { name: hello.name, apply: hello.apply },
];
