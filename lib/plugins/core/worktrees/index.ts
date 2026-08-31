import { existsSync } from "node:fs";
import { Context, Service } from "cordis";
import { getGitFileDiff, getGitStatus } from "@/lib/git-changes";
import {
  allowFileRoot,
  getAllowedFileRoots,
  isExistingFilePathAllowed,
  isFilePathAllowed,
} from "@/lib/file-access";
import { projectIdentityKey } from "@/lib/project-identity";
import {
  addWorktree,
  findCurrentWorktreePath,
  listWorktrees,
  removeWorktree,
  resolveProject,
} from "@/lib/worktree";

/**
 * @core/worktrees —— git worktree 与 git 状态服务（ADR-0004 M2d）。
 *
 * 统一承担：cwd 授权检查（与 /api/files 同一安全边界）+ worktree 操作 + git 状态/差异。
 * 路由层只做参数校验与状态码映射。
 */

export const name = "@core/worktrees";

declare module "cordis" {
  interface Context {
    worktrees: WorktreesService;
  }
}

export interface WorktreeListResult {
  projectRoot: string;
  projectKey: string;
  isGit: boolean;
  isTopLevel: boolean;
  currentWorktreePath: string | null;
  worktrees: Awaited<ReturnType<typeof listWorktrees>>;
}

class WorktreesService extends Service {
  constructor(ctx: Context) {
    super(ctx, "worktrees", true);
  }

  /** 授权检查：cwd 必须在允许根内（词法 + 符号链接解析）。返回错误消息或 null。 */
  async checkCwdAllowed(cwd: string): Promise<string | null> {
    // 统一实现位于 @core/files（唯一安全边界）
    return this.ctx.files.checkCwdAllowed(cwd);
  }

  /** 列出项目 worktrees（含当前 worktree 推断；worktree 路径自动加入允许根） */
  async list(cwd: string): Promise<WorktreeListResult> {
    const project = await resolveProject(cwd);
    let worktrees: Awaited<ReturnType<typeof listWorktrees>> = [];
    let currentWorktreePath: string | null = null;
    let isGit = true;
    try {
      // 已删除 worktree 的会话 cwd 回退到推断的项目根
      worktrees = await listWorktrees(existsSync(cwd) ? cwd : project.projectRoot);
      currentWorktreePath = findCurrentWorktreePath(worktrees, cwd);
    } catch {
      isGit = false;
    }
    // 列出的路径均为 git 验证过的 worktree；允许文件浏览器浏览（内存白名单不跨重启）
    for (const w of worktrees) allowFileRoot(w.path);
    return {
      projectRoot: project.projectRoot,
      projectKey: projectIdentityKey(project.projectRoot),
      isGit,
      isTopLevel: project.isTopLevel,
      currentWorktreePath,
      worktrees,
    };
  }

  /** 添加 worktree（分支不存在时自动创建） */
  async add(cwd: string, branch: string) {
    return addWorktree(cwd, branch);
  }

  /** 移除 worktree（脏 worktree 抛错，由路由映射 409） */
  async remove(cwd: string, path: string, force: boolean): Promise<void> {
    await removeWorktree(cwd, path, force);
  }

  /** git 状态 */
  async gitStatus(cwd: string) {
    return getGitStatus(cwd);
  }

  /** git 文件差异 */
  async gitFileDiff(cwd: string, filePath: string) {
    return getGitFileDiff(cwd, filePath);
  }
}

export function apply(ctx: Context) {
  ctx.plugin(WorktreesService);
}

export const inject = ["files"];
