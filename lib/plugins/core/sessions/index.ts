import { Context, Service } from "cordis";
import type { SessionManager } from "@earendil-works/pi-coding-agent";

/**
 * @core/sessions —— 会话运行时服务（过渡版，M3 前）。
 *
 * M2f 阶段只提供"运行时状态查询"的空实现：RoboPi 尚无 in-process
 * AgentSession（那属于 M3 的 @core/sessions 完整实现），因此：
 * - 运行时会话列表 / running ids / 通知抑制集合 → 空
 * - getRpcSession → undefined（路由自然走文件级路径，与 pi-web 行为一致）
 * - startRpcSession / steerSubagent / abortSubagent → 明确报错（避免静默失败）
 *
 * RpcSessionLike 是路由层所需的最小形状（M3 的 AgentSessionWrapper 天然满足）；
 * M3 落地时仅需替换本服务的实现，路由层零改动。
 */

/** 路由层依赖的 wrapper 最小形状（对齐 pi-web rpc-manager 的 AgentSessionWrapper） */
export interface RpcSessionLike {
  isAlive(): boolean;
  isRunning(): boolean;
  readonly sessionFile: string;
  readonly inner: { sessionManager: SessionManager; setSessionName(name: string): void };
  waitUntilReady(): Promise<void>;
  setSessionName(name: string): void;
  send(command: unknown): Promise<unknown>;
  shutdown(): Promise<void>;
}

export const name = "@core/sessions";

declare module "cordis" {
  interface Context {
    sessions: SessionsService;
  }
}

class SessionsService extends Service {
  constructor(ctx: Context) {
    super(ctx, "sessions", true);
  }

  // ---- M3 前的空实现（运行时状态查询） ----

  /** 运行时会话（M3 前恒 undefined → 路由走文件读取路径） */
  getRpcSession(_id: string): RpcSessionLike | undefined {
    return undefined;
  }

  /** 运行时会话信息列表（M3 前为空） */
  getRpcSessionInfos(): never[] {
    return [];
  }

  /** 运行中会话 ids（M3 前为空） */
  getRunningRpcSessionIds(): string[] {
    return [];
  }

  /** 通知抑制集合（M3 前为空） */
  getCompletionNotificationSuppressedRpcSessionIds(): string[] {
    return [];
  }

  /** 子代理运行查询（M3 前无） */
  getSubagentRun(_id: string): unknown {
    return undefined;
  }

  // ---- 需 M3 的能力：明确报错而非静默 ----

  startRpcSession(_id: string, _filePath: string, _toolNames?: unknown): Promise<{ session: RpcSessionLike; realSessionId: string }> {
    return Promise.reject(
      new Error("startRpcSession is not available until M3 (session runtime)"),
    );
  }

  steerSubagent(_id: string, _message?: unknown): Promise<void> {
    return Promise.reject(
      new Error("steerSubagent is not available until M3 (session runtime)"),
    );
  }

  abortSubagent(_id: string): Promise<void> {
    return Promise.reject(
      new Error("abortSubagent is not available until M3 (session runtime)"),
    );
  }

  /** 销毁 cwd 相关运行时会话（M3 前 no-op） */
  destroyRpcSessionsForCwd(_cwd: string): void {}

  /** cwd 是否有忙会话（M3 前恒 false） */
  hasBusyRpcSessionForCwd(_cwd: string): boolean {
    return false;
  }
}

export function apply(ctx: Context) {
  ctx.plugin(SessionsService);
}
