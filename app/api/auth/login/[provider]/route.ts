import { NextResponse } from "next/server";
import type { AuthPrompt } from "@earendil-works/pi-ai";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

/**
 * GET  /api/auth/login/[provider] —— OAuth/device-code SSE 流
 * POST /api/auth/login/[provider] —— 前端回传手动输入 code（token + code）
 *
 * SSE 传输在路由层；令牌注册表与登录流程在 @core/auth 服务
 * （原 pi-web 路由里的 globalThis.__piLoginCallbacks 迁入服务）。
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const { token, code } = (await req.json()) as { token?: string; code?: string };

  if (!token || !code) {
    return NextResponse.json({ error: "token and code required" }, { status: 400 });
  }
  // 校验令牌归属（格式 <provider>-<ts>-<random>）
  if (!token.startsWith(`${provider}-`)) {
    return NextResponse.json({ error: "Token does not match provider" }, { status: 400 });
  }

  const ctx = await getRoot();
  if (!ctx.auth.resolveLoginCode(token, code)) {
    return NextResponse.json({ error: "No pending login for token" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, provider });
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const ctx = await getRoot();
      let pendingManualRequest: { token: string; promise: Promise<string> } | undefined;
      const activeTokens = new Set<string>();

      const cleanup = () => {
        for (const token of activeTokens) {
          ctx.auth.cancelLoginToken(token);
        }
        activeTokens.clear();
      };
      abort.signal.addEventListener("abort", cleanup);

      try {
        await ctx.auth.loginOAuth(provider, {
          onPrompt: async (prompt: AuthPrompt) => {
            // manual_code 与 auth_url 复用同一 pending 请求；其余提示各建新令牌
            if (prompt.type === "manual_code" && pendingManualRequest) {
              return pendingManualRequest.promise;
            }
            const { token, promise } = ctx.auth.createLoginToken(provider);
            activeTokens.add(token);
            const request = { token, promise };
            if (prompt.type === "manual_code") {
              pendingManualRequest = request;
              request.promise
                .finally(() => {
                  if (pendingManualRequest === request) pendingManualRequest = undefined;
                })
                .catch(() => {});
            }
            if (prompt.type === "select") {
              send(controller, {
                type: "select_request",
                message: prompt.message,
                options: prompt.options,
                token,
              });
            } else {
              send(controller, {
                type: "prompt_request",
                message: prompt.message,
                placeholder: prompt.placeholder ?? null,
                token,
              });
            }
            return promise;
          },
          onNotify: (event) => {
            if (event.type === "auth_url") {
              // auth_url 事件复用/创建 pending 令牌（浏览器跳转后回传 code）
              if (!pendingManualRequest) {
                const { token, promise } = ctx.auth.createLoginToken(provider);
                pendingManualRequest = { token, promise };
                pendingManualRequest.promise
                  .finally(() => { pendingManualRequest = undefined; })
                  .catch(() => {});
              }
              send(controller, {
                type: "auth",
                url: event.url,
                instructions: event.instructions ?? null,
                token: pendingManualRequest.token,
              });
            } else if (event.type === "device_code") {
              send(controller, {
                type: "device_code",
                userCode: event.userCode,
                verificationUri: event.verificationUri,
                intervalSeconds: event.intervalSeconds ?? null,
                expiresInSeconds: event.expiresInSeconds ?? null,
              });
            } else {
              send(controller, { type: "progress", message: event.message });
            }
          },
          signal: abort.signal,
        });

        send(controller, { type: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send(controller, msg === "Login cancelled" ? { type: "cancelled" } : { type: "error", message: msg });
      } finally {
        cleanup();
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
