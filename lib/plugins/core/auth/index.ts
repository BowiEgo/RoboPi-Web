import { Context, Service } from "cordis";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";
import { invalidateModelsCache } from "@/lib/models-cache";
import { buildApiKeyProviderList, buildOAuthProviderList } from "@/lib/provider-listing";
import { collectProviderListingInputs } from "@/lib/provider-listing-runtime";
import {
  removeStoredCredentialIfType,
  storeProviderCredential,
  type CredentialRemovalResult,
} from "@/lib/provider-credential-store";

/**
 * @core/auth —— 供应商认证服务（ADR-0004 M2b）。
 *
 * 包装 pi SDK 的 ModelRuntime/AuthStorage：
 * - listProviders：能力驱动的双列表（OAuth + API key，见 lib/provider-listing.ts #309）
 * - storeApiKey / removeCredential / logout：凭据管理
 * - loginOAuth + createLoginToken：OAuth/device-code 流（SSE 传输在路由层，
 *   令牌注册表状态在此服务内，取代 pi-web 路由里的 globalThis.__piLoginCallbacks）
 */

export const name = "@core/auth";

declare module "cordis" {
  interface Context {
    auth: AuthService;
  }
}

type LoginCallbacks = { resolve: (value: string) => void; reject: (error: Error) => void };

export interface OAuthLoginOptions {
  /** 处理认证提示；返回用户在提示上的输入。token 由 createLoginToken 预生成。 */
  onPrompt: (prompt: AuthPrompt, token: string) => Promise<string>;
  /** 接收认证事件（auth_url / device_code / progress） */
  onNotify: (event: AuthEvent) => void;
  /** 客户端断开信号（SSE 路由传入 req.signal） */
  signal?: AbortSignal;
}

class AuthService extends Service {
  /** 手动输入令牌注册表（原 globalThis.__piLoginCallbacks） */
  private loginCallbacks = new Map<string, LoginCallbacks>();

  constructor(ctx: Context) {
    super(ctx, "auth", true);
  }

  /** 供应商列表（能力驱动，OAuth 与 API-key 双列表） */
  async listProviders() {
    const modelRuntime = await ModelRuntime.create();
    const inputs = await collectProviderListingInputs(modelRuntime);
    return {
      providers: buildOAuthProviderList(inputs),
      oauthProviders: buildOAuthProviderList(inputs),
      apiKeyProviders: buildApiKeyProviderList(inputs),
    };
  }

  /** 存储 API key（走 provider 声明的 login 流程，直接持久化返回的凭据） */
  async storeApiKey(provider: string, apiKey: string, signal: AbortSignal): Promise<void> {
    const modelRuntime = await ModelRuntime.create();
    const apiKeyAuth = modelRuntime.getProvider(provider)?.auth.apiKey;
    if (!apiKeyAuth?.login) {
      throw new Error(`${provider} does not support API key login`);
    }
    let keySubmitted = false;
    const credential = await apiKeyAuth.login({
      signal,
      notify: () => {},
      prompt: async (prompt) => {
        if (prompt.type === "select") {
          const keyOption = prompt.options.find(
            (option) => option.id === "api-key" || option.id === "bearer-token",
          );
          if (keyOption) return keyOption.id;
          throw new Error(`${provider} requires interactive authentication setup`);
        }
        if (!keySubmitted && prompt.type === "secret") {
          keySubmitted = true;
          return apiKey.trim();
        }
        throw new Error(`${provider} requires additional authentication settings`);
      },
    });
    // ModelRuntime.login() 会做无界网络刷新；直接存返回的凭据，避免慢目录挂起保存请求
    await storeProviderCredential(provider, credential);
    invalidateModelsCache();
  }

  /** 移除指定类型的凭据（api_key / oauth） */
  async removeCredential(provider: string, type: "api_key" | "oauth"): Promise<CredentialRemovalResult> {
    return removeStoredCredentialIfType(provider, type);
  }

  /** OAuth 登出（仅对声明 oauth 的 provider） */
  async logout(provider: string): Promise<void> {
    const modelRuntime = await ModelRuntime.create();
    if (!modelRuntime.getProvider(provider)?.auth.oauth) {
      throw new ProviderError(`Unknown provider: ${provider}`, 400);
    }
    await modelRuntime.logout(provider);
    invalidateModelsCache();
  }

  /** 创建手动输入令牌（格式 <provider>-<ts>-<random>，供 SSE 下发、前端回传） */
  createLoginToken(provider: string): { token: string; promise: Promise<string> } {
    const token = `${provider}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const promise = new Promise<string>((resolve, reject) => {
      this.loginCallbacks.set(token, {
        resolve: (value) => {
          this.loginCallbacks.delete(token);
          resolve(value);
        },
        reject: (error) => {
          this.loginCallbacks.delete(token);
          reject(error);
        },
      });
    });
    return { token, promise };
  }

  /** 前端 POST 回传 code；false = 令牌不存在或已失效 */
  resolveLoginCode(token: string, code: string): boolean {
    const callbacks = this.loginCallbacks.get(token);
    if (!callbacks) return false;
    callbacks.resolve(code);
    return true;
  }

  /** 取消等待中的令牌（客户端断开/清理时调用） */
  cancelLoginToken(token: string): void {
    const callbacks = this.loginCallbacks.get(token);
    if (callbacks) {
      callbacks.reject(new Error("Login cancelled"));
      this.loginCallbacks.delete(token);
    }
  }

  /** 执行 OAuth 登录流程（prompt/notify 由路由层桥接 SSE） */
  async loginOAuth(provider: string, options: OAuthLoginOptions): Promise<void> {
    const modelRuntime = await ModelRuntime.create();
    if (!modelRuntime.getProvider(provider)?.auth.oauth) {
      throw new ProviderError(`Unknown provider: ${provider}`, 404);
    }
    await modelRuntime.login(provider, "oauth", {
      prompt: async (prompt: AuthPrompt) => {
        const token = this.createLoginToken(provider).token;
        return options.onPrompt(prompt, token);
      },
      notify: options.onNotify,
      signal: options.signal,
    });
    invalidateModelsCache();
  }
}

/** 带 HTTP 状态码的服务错误，路由层据此映射响应码 */
export class ProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function apply(ctx: Context) {
  ctx.plugin(AuthService);
}
