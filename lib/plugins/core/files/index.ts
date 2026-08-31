import { Context, Service } from "cordis";
import {
  allowFileRoot as allowFileRootImpl,
  getAllowedFileRoots as getAllowedFileRootsImpl,
  isExistingFilePathAllowed as isExistingFilePathAllowedImpl,
  isFilePathAllowed as isFilePathAllowedImpl,
} from "@/lib/file-access";
import { isWindowsAbsolutePath } from "@/lib/paths";

/**
 * @core/files —— 文件访问权限服务（ADR-0004 M2c）。
 *
 * 包装 lib/file-access.ts 的安全边界（允许根集合 + 词法/符号链接校验）。
 * 该模块是唯一安全边界实现（isPathWithinRoots），所有文件/工作树路由必须经此授权。
 */

export const name = "@core/files";

declare module "cordis" {
  interface Context {
    files: FilesService;
  }
}

class FilesService extends Service {
  constructor(ctx: Context) {
    super(ctx, "files", true);
  }

  /** 允许的根集合（会话 cwd + 项目根 + ~/pi-cwd-* + 显式添加的根；5s TTL） */
  async getAllowedFileRoots(): Promise<Set<string>> {
    return getAllowedFileRootsImpl();
  }

  /** 词法授权（不触碰文件系统） */
  isFilePathAllowed(target: string, allowedRoots: Set<string>): boolean {
    return isFilePathAllowedImpl(target, allowedRoots);
  }

  /** 符号链接解析后的授权 */
  isExistingFilePathAllowed(target: string, allowedRoots: Set<string>): boolean {
    return isExistingFilePathAllowedImpl(target, allowedRoots);
  }

  /** 显式加入允许根（cwd 选择、default-cwd、worktree 创建时调用） */
  allowFileRoot(root: string): void {
    allowFileRootImpl(root);
  }

  isWindowsAbsolutePath(target: string): boolean {
    return isWindowsAbsolutePath(target);
  }
}

export function apply(ctx: Context) {
  ctx.plugin(FilesService);
}
