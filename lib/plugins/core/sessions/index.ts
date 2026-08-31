import { Context, Service } from "cordis";
import {
  abortSubagent as abortSubagentImpl,
  destroyRpcSessionsForCwd as destroyRpcSessionsForCwdImpl,
  getCompletionNotificationSuppressedRpcSessionIds as getSuppressedIdsImpl,
  getRpcSession as getRpcSessionImpl,
  getRpcSessionInfos as getRpcSessionInfosImpl,
  getRunningRpcSessionIds as getRunningIdsImpl,
  getSubagentRun as getSubagentRunImpl,
  hasBusyRpcSessionForCwd as hasBusyImpl,
  setRpcSessionTools as setRpcSessionToolsImpl,
  startRpcSession as startRpcSessionImpl,
  steerSubagent as steerSubagentImpl,
  type AgentSessionWrapper,
  type RpcSessionStartOptions,
  type SetRpcSessionToolsResult,
} from "@/lib/rpc-manager";

/**
 * @core/sessions —— 会话运行时服务（M3 完整实现）。
 *
 * 委托 lib/rpc-manager.ts（pi-web 原样迁移的 2043 行会话运行时）：
 * - wrapper 注册表（globalThis.__piSessions，跨 HMR 存活）
 * - 会话创建（AgentSession 工厂 + 工具选择 + Chat-only 边界 + 模型范围）
 * - 并发 start 共享锁、10 分钟 idle 超时、fork 后立即销毁语义
 * - 子代理运行控制
 *
 * 路由层经 RpcSessionLike 形状访问；wrapper 的事件订阅经
 * wrapper.onEvent / subscribe 供 SSE 路由使用。
 */

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

  /** 运行时会话（无则 undefined，路由走文件读取路径） */
  getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
    return getRpcSessionImpl(sessionId);
  }

  /** 运行时会话信息列表 */
  getRpcSessionInfos() {
    return getRpcSessionInfosImpl();
  }

  /** 运行中会话 ids */
  getRunningRpcSessionIds(): string[] {
    return getRunningIdsImpl();
  }

  /** 通知抑制集合 */
  getCompletionNotificationSuppressedRpcSessionIds(): string[] {
    return getSuppressedIdsImpl();
  }

  /** 子代理运行查询 */
  getSubagentRun(sessionId: string) {
    return getSubagentRunImpl(sessionId);
  }

  /** 创建/恢复运行时会话（含并发共享锁；fork/clone 语义在 wrapper 内） */
  startRpcSession(
    sessionId: string,
    sessionFile: string,
    cwd: string | undefined,
    options: RpcSessionStartOptions = {},
  ): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
    return startRpcSessionImpl(sessionId, sessionFile, cwd, options);
  }

  /** 子代理 steer */
  steerSubagent(sessionId: string, message: string): Promise<void> {
    return steerSubagentImpl(sessionId, message);
  }

  /** 设置会话工具集（跨 Chat-only 边界时重建 wrapper） */
  setRpcSessionTools(
    sessionId: string,
    filePath: string | undefined,
    toolNames: string[] | undefined,
  ): Promise<SetRpcSessionToolsResult> {
    return setRpcSessionToolsImpl(sessionId, filePath, toolNames);
  }

  /** 子代理 abort */
  abortSubagent(sessionId: string): Promise<void> {
    return abortSubagentImpl(sessionId);
  }

  /** 销毁 cwd 相关运行时会话 */
  destroyRpcSessionsForCwd(cwd: string): Promise<number> {
    return destroyRpcSessionsForCwdImpl(cwd);
  }

  /** cwd 是否有忙会话 */
  hasBusyRpcSessionForCwd(cwd: string): boolean {
    return hasBusyImpl(cwd);
  }
}

export function apply(ctx: Context) {
  ctx.plugin(SessionsService);
}
