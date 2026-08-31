import { Context, Service } from "cordis";
import {
  buildSessionContext,
  cacheSessionPath,
  getSessionEntries,
  invalidateSessionListCache,
  invalidateSessionPathCache,
  listAllSessions,
  readSessionHeader,
  resolveSessionIdByPath,
  resolveSessionPath,
  sliceActiveBranch,
} from "@/lib/session-reader";
import type {
  SessionContext,
  SessionEntry,
  SessionHeader,
  SessionInfo,
} from "@/lib/types";

/**
 * @core/session-store —— 会话存储读取服务（ADR-0004 M2f 前置，随 M2c 提前落地）。
 *
 * 包装 lib/session-reader.ts（pi SDK SessionManager 读取面）：
 * 会话列表（含项目分组）、上下文构建、分支切片、路径缓存。
 * M3 的 @core/sessions 将在此之上叠加写入/运行时能力。
 */

export const name = "@core/session-store";

declare module "cordis" {
  interface Context {
    sessionStore: SessionStoreService;
  }
}

class SessionStoreService extends Service {
  constructor(ctx: Context) {
    super(ctx, "sessionStore", true);
  }

  /** 全部会话（含 worktree 项目分组信息） */
  async listAllSessions(options: { force?: boolean } = {}): Promise<SessionInfo[]> {
    return listAllSessions(options);
  }

  /** 失效会话列表缓存（新会话/删除后调用） */
  invalidateListCache(): void {
    invalidateSessionListCache();
  }

  /** sessionId → 文件路径 */
  async resolveSessionPath(sessionId: string): Promise<string | null> {
    return resolveSessionPath(sessionId);
  }

  /** 文件路径 → sessionId（含缓存写入） */
  async resolveSessionIdByPath(filePath: string): Promise<string | undefined> {
    return resolveSessionIdByPath(filePath);
  }

  cacheSessionPath(sessionId: string, filePath: string): void {
    cacheSessionPath(sessionId, filePath);
  }

  invalidatePathCache(sessionId: string): void {
    invalidateSessionPathCache(sessionId);
  }

  /** 读取会话头部 */
  readSessionHeader(filePath: string): SessionHeader | null {
    return readSessionHeader(filePath);
  }

  /** 读取全部条目（归一化工具调用字段） */
  getSessionEntries(filePath: string): SessionEntry[] {
    return getSessionEntries(filePath);
  }

  /** 构建会话上下文（entries → 父链/入口映射；tail>0 时先做分支切片） */
  buildSessionContext(
    entries: SessionEntry[],
    leafId?: string | null,
    options: { tail?: number; excludeLeaf?: boolean } = {},
  ): SessionContext {
    return buildSessionContext(entries, leafId, options);
  }

  /** 按分支切片（分页用） */
  sliceActiveBranch(entries: SessionEntry[], leafId: string | null, tail: number, excludeLeaf = false): SessionEntry[] {
    return sliceActiveBranch(entries, leafId, tail, excludeLeaf);
  }
}

export function apply(ctx: Context) {
  ctx.plugin(SessionStoreService);
}
