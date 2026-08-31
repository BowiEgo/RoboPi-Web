import { Context, Service } from "cordis";

/**
 * @core/hello —— 示例服务插件。
 *
 * 演示三件事：
 * 1. 定义并暴露一个 Cordis 服务（Service 子类 + Context 类型增强）；
 * 2. 通过 ctx.emit 广播自定义事件（robopi/greeting）；
 * 3. 通过 ctx.inject 声明对 @web/ui-host 的依赖，向导航栏注册入口。
 */

export const name = "@core/hello";

declare module "cordis" {
  interface Context {
    hello: HelloService;
  }
  // 泛型参数名必须与 cordis 的 Events 声明一致（接口合并要求 identical type parameters）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Events<C extends Context = Context> {
    /** 每次 greet() 被调用时触发 */
    "robopi/greeting"(caller: string): void;
  }
}

class HelloService extends Service {
  private calls = 0;

  constructor(ctx: Context) {
    // immediate = true：apply 期间即可通过 ctx.hello 访问
    super(ctx, "hello", true);
  }

  greet(caller: string): string {
    this.calls += 1;
    this.ctx.emit("robopi/greeting", caller);
    return `你好，${caller}！这是 RoboPi 第 ${this.calls} 次问候。`;
  }

  get stats() {
    return { calls: this.calls };
  }
}

export function apply(ctx: Context) {
  ctx.plugin(HelloService);

  // 事件订阅：日志落点（地基阶段打 console）
  ctx.on("robopi/greeting", (caller) => {
    ctx.logger.info("[demo] robopi/greeting from %s", caller);
  });

  // 依赖声明：@web/ui-host 可用后，向导航栏注册入口
  ctx.inject(["webui"], () => {
    ctx.webui.register("navrail", {
      id: "hello",
      label: "Hello 演示",
      icon: "👋",
      href: "#demo-hello",
      order: 20,
    });
  });
}
