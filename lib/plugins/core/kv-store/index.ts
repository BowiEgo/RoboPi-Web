import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Context, Schema, Service } from "cordis";

/**
 * @core/kv-store —— RoboPi 自有键值存储（演示/实验用）。
 *
 * 简单键值持久化（JSON 文件，原子写入），数据存 .robopi/settings.json，
 * 与 pi 的 ~/.pi/agent/settings.json 隔离。pi 配置读写见 @core/settings。
 */

export const name = "@core/kv-store";

declare module "cordis" {
  interface Context {
    kvStore: KvStoreService;
  }
}

export interface KvStoreConfig {
  /** 存储文件路径，默认 <cwd>/.robopi/settings.json */
  file?: string;
}

/** 配置 Schema：插件加载时自动校验（Cordis 原生机制） */
export const Config = Schema.object({
  file: Schema.string().description("存储文件路径（默认 .robopi/settings.json）"),
});

class KvStoreService extends Service {
  private data: Record<string, unknown> = {};
  private readonly file: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(ctx: Context, config: KvStoreConfig = {}) {
    super(ctx, "kvStore", true);
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

export function apply(ctx: Context, config: KvStoreConfig = {}) {
  ctx.plugin(KvStoreService, config);

  // 依赖声明（插件级 inject）：向导航栏注册入口
  ctx.webui.register("navrail", {
    id: "kv-store",
    label: "KV 存储",
    icon: "🗄️",
    href: "#demo-kvstore",
    order: 40,
  });
}

export const inject = ["webui"];
