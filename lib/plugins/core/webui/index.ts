import { Context, Service } from "cordis";

/**
 * @web/ui-host —— Web UI 插件宿主服务（地基版）。
 *
 * 维护浏览器端组件的"插槽注册表"。当前实现导航栏插槽（navrail），
 * 后续按 docs/0002 扩展 sidebar / tabbar / settings 等插槽，
 * 并支持插件向浏览器下发可渲染的组件描述。
 */

export const name = "@web/ui-host";

declare module "cordis" {
  interface Context {
    webui: WebUiService;
  }
}

/** 已定义的 UI 插槽 */
export type WebUiSlot = "navrail" | "sidebar" | "tabbar";

export interface NavItem {
  /** 唯一 id */
  id: string;
  /** 显示文本 */
  label: string;
  /** 点击跳转（锚点或 URL） */
  href?: string;
  /** 图标（地基阶段用 emoji） */
  icon?: string;
  /** 排序权重，升序 */
  order?: number;
}

const ALL_SLOTS: WebUiSlot[] = ["navrail", "sidebar", "tabbar"];

class WebUiService extends Service {
  private items = new Map<WebUiSlot, Map<string, NavItem>>();

  constructor(ctx: Context) {
    super(ctx, "webui", true);
    for (const slot of ALL_SLOTS) {
      this.items.set(slot, new Map());
    }
    // 宿主自身注册一个入口，作为 navrail 的默认项（构造时注册，避免插件作用域内自引用）
    this.register("navrail", {
      id: "overview",
      label: "总览",
      icon: "🏠",
      href: "#overview",
      order: 10,
    });
  }

  /** 向插槽注册一项；返回注销函数（供插件 dispose 时调用） */
  register(slot: WebUiSlot, item: NavItem): () => void {
    const map = this.items.get(slot);
    if (!map) throw new Error(`unknown webui slot: ${slot}`);
    map.set(item.id, item);
    return () => {
      map.delete(item.id);
    };
  }

  /** 读取插槽内容（已按 order 排序） */
  getSlot(slot: WebUiSlot): NavItem[] {
    return [...(this.items.get(slot)?.values() ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
  }

  getSnapshot(): Record<WebUiSlot, NavItem[]> {
    return {
      navrail: this.getSlot("navrail"),
      sidebar: this.getSlot("sidebar"),
      tabbar: this.getSlot("tabbar"),
    };
  }
}

export function apply(ctx: Context) {
  ctx.plugin(WebUiService);
}
