import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Context, Service } from "cordis";

/**
 * @core/settings —— 全局设置存储服务。
 *
 * 提供简单的键值持久化（JSON 文件，原子写入），
 * 后续从 pi-web 迁移 settings.json / models.json 读写时以此为基底。
 */

export const name = "@core/settings";

declare module "cordis" {
  interface Context {
    settings: SettingsService;
  }
}

export interface SettingsConfig {
  /** 设置文件路径，默认 <cwd>/.robopi/settings.json */
  file?: string;
}

class SettingsService extends Service {
  private data: Record<string, unknown> = {};
  private readonly file: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(ctx: Context, config: SettingsConfig = {}) {
    super(ctx, "settings", true);
    this.file = config.file ?? join(process.cwd(), ".robopi", "settings.json");
    this.load();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.file, "utf8");
      this.data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.data = {};
    }
  }

  get<T = unknown>(key: string, fallback?: T): T | undefined {
    return key in this.data ? (this.data[key] as T) : fallback;
  }

  getAll(): Record<string, unknown> {
    return { ...this.data };
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
    // 串行化写入，避免并发路由请求竞态
    this.writeChain = this.writeChain.then(() => this.persist());
    return this.writeChain;
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    renameSync(tmp, this.file);
  }
}

export function apply(ctx: Context, config: SettingsConfig = {}) {
  ctx.plugin(SettingsService, config);

  // 依赖声明：向导航栏注册入口
  ctx.inject(["webui"], () => {
    ctx.webui.register("navrail", {
      id: "settings",
      label: "设置存储",
      icon: "⚙️",
      href: "#demo-settings",
      order: 30,
    });
  });
}
