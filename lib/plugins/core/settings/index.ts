import { Context, Service } from "cordis";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

/**
 * @core/settings —— pi 设置数据层（ADR-0004 M2a 决策 1）。
 *
 * 包装 pi SDK 的 SettingsManager，读写 ~/.pi/agent/settings.json（及项目
 * .pi/settings.json），与 pi 生态完全一致。所有需要配置的服务经此访问。
 */

export const name = "@core/settings";

declare module "cordis" {
  interface Context {
    settings: SettingsService;
  }
}

export interface SettingsConfig {
  /** 工作目录（决定项目设置与信任状态），默认 process.cwd() */
  cwd?: string;
  /** agent 目录，默认 pi SDK 的 getAgentDir() */
  agentDir?: string;
}

class SettingsService extends Service {
  readonly manager: SettingsManager;

  constructor(ctx: Context, config: SettingsConfig = {}) {
    super(ctx, "settings", true);
    this.manager = SettingsManager.create(config.cwd ?? process.cwd(), config.agentDir);
  }

  getDefaultModel(): { provider?: string; modelId?: string } | null {
    const provider = this.manager.getDefaultProvider();
    const modelId = this.manager.getDefaultModel();
    return provider || modelId ? { provider, modelId } : null;
  }

  getGlobalSettings() {
    return this.manager.getGlobalSettings();
  }

  getProjectSettings() {
    return this.manager.getProjectSettings();
  }
}

export function apply(ctx: Context, config: SettingsConfig = {}) {
  ctx.plugin(SettingsService, config);

  ctx.inject(["webui"], () => {
    ctx.webui.register("navrail", {
      id: "settings",
      label: "pi 设置",
      icon: "⚙️",
      href: "#demo-settings",
      order: 30,
    });
  });
}
