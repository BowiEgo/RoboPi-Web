import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Service } from "cordis";
import { completeSimple, type AssistantMessage } from "@earendil-works/pi-ai/compat";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { readModelsConfig, writeModelsConfig } from "@/lib/models-config-store";

/**
 * @core/models —— 模型配置服务（ADR-0004 M2a）。
 *
 * 包装 models.json 读写（models-config-store）与模型连通性测试（ModelRuntime）。
 * 路由层只做参数校验与序列化。
 */

export const name = "@core/models";

declare module "cordis" {
  interface Context {
    models: ModelsService;
  }
}

export interface ModelTestResult {
  ok: boolean;
  error?: string;
  latencyMs?: number;
  status?: number;
  responseText?: string;
}

const TEST_TIMEOUT_MS = 20_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

class ModelsService extends Service {
  constructor(ctx: Context) {
    super(ctx, "models", true);
  }

  /** 读取 ~/.pi/agent/models.json（不存在返回 { providers: {} }） */
  readConfig(): Record<string, unknown> {
    return readModelsConfig();
  }

  /** 规范化并原子写入 models.json，同时失效缓存 */
  writeConfig(data: Record<string, unknown>): void {
    writeModelsConfig(data);
  }

  /**
   * 模型连通性测试：在临时目录构造 ModelRuntime，发起一次最小请求。
   * 完全复刻 pi-web app/api/models-config/test/route.ts 的行为。
   */
  async testModel(input: {
    providerName: string;
    provider: Record<string, unknown>;
    model: Record<string, unknown>;
  }): Promise<ModelTestResult> {
    const { providerName, provider, model } = input;
    const modelId = typeof model.id === "string" ? model.id.trim() : "";
    if (!providerName) return { ok: false, error: "providerName is required" };
    if (!modelId) return { ok: false, error: "Model ID is required" };

    let tempDir: string | undefined;
    try {
      tempDir = mkdtempSync(join(tmpdir(), "robopi-model-test-"));
      const modelsPath = join(tempDir, "models.json");
      writeFileSync(modelsPath, JSON.stringify({
        providers: {
          [providerName]: {
            ...provider,
            models: [{ ...model, id: modelId }],
          },
        },
      }, null, 2), "utf8");

      const modelRuntime = await ModelRuntime.create({ modelsPath });
      const loadError = modelRuntime.getError();
      if (loadError) return { ok: false, error: loadError };

      const runtimeModel = modelRuntime.getModel(providerName, modelId);
      if (!runtimeModel) return { ok: false, error: `Model not found: ${providerName}/${modelId}` };

      const resolved = await modelRuntime.getAuth(runtimeModel);
      if (!resolved?.auth.apiKey) {
        return { ok: false, error: `No API key found for "${providerName}"` };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
      let status: number | undefined;
      const startedAt = Date.now();

      try {
        const message = await completeSimple(runtimeModel, {
          messages: [{
            role: "user",
            content: "Reply with OK only.",
            timestamp: Date.now(),
          }],
        }, {
          apiKey: resolved.auth.apiKey,
          headers: resolved.auth.headers,
          maxTokens: 16,
          timeoutMs: TEST_TIMEOUT_MS,
          maxRetries: 0,
          cacheRetention: "none",
          signal: controller.signal,
          onResponse: (response) => { status = response.status; },
        });

        const latencyMs = Date.now() - startedAt;
        if (message.stopReason === "error" || message.stopReason === "aborted") {
          return {
            ok: false,
            error: message.errorMessage ?? (controller.signal.aborted ? "Test timed out" : "Model returned an error"),
            latencyMs,
            status,
          };
        }
        return {
          ok: true,
          latencyMs,
          status,
          responseText: getAssistantText(message).slice(0, 300),
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    } finally {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export function apply(ctx: Context) {
  ctx.plugin(ModelsService);
}
