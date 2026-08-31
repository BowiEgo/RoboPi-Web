"use client";

import { useCallback, useEffect, useState } from "react";
import { NavRail } from "./NavRail";
import type { NavItem } from "@/lib/plugins/core/webui";

interface StatusResponse {
  app: { name: string; version: string };
  cordis: {
    pluginCount: number;
    plugins: { name: string; status: string; error?: string }[];
  };
  services: {
    hello: { calls: number };
    kvStore: { keys: string[] };
    settings: { defaultModel: { provider?: string; modelId?: string } | null };
    models: { configKeys: string[] };
    webui: { slots: Record<string, NavItem[]> };
  };
}

/** 地基状态页 —— 验证 浏览器 → API → Cordis 服务 → 插件 全链路 */
export function FoundationStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("RoboPi");
  const [helloMessage, setHelloMessage] = useState<string | null>(null);
  const [settingsData, setSettingsData] = useState<Record<string, unknown> | null>(null);
  const [settingKey, setSettingKey] = useState("greeting");
  const [settingValue, setSettingValue] = useState("你好，RoboPi");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/robopi/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus((await res.json()) as StatusResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const callHello = async () => {
    const res = await fetch("/api/robopi/hello", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { message: string; calls: number };
    setHelloMessage(data.message);
    void refresh();
  };

  const saveSetting = async () => {
    await fetch("/api/robopi/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: settingKey, value: settingValue }),
    });
    await loadSettings();
    void refresh();
  };

  const loadSettings = async () => {
    const res = await fetch("/api/robopi/settings", { cache: "no-store" });
    const data = (await res.json()) as { data: Record<string, unknown> };
    setSettingsData(data.data);
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const navItems = status?.services.webui.slots.navrail ?? [];

  return (
    <div className="rp-shell">
      <NavRail items={navItems} activeId="overview" />

      <main className="rp-main" id="overview">
        <header className="rp-header">
          <div>
            <h1 className="rp-title">RoboPi Web — Cordis 地基</h1>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
              基于 pi-web 项目结构与 Cordis 插件系统的 Agent 平台（P0 阶段）
            </p>
          </div>
          <div className="rp-row">
            <span className="rp-badge">v{status?.app.version ?? "dev"}</span>
            <span className="rp-badge">
              {status ? `Cordis 已加载 ${status.cordis.pluginCount} 个插件` : "连接中…"}
            </span>
          </div>
        </header>

        {error && (
          <div className="rp-card" style={{ borderColor: "var(--accent)" }}>
            <h2>⚠️ 状态探针失败</h2>
            <p>{error}</p>
            <button className="rp-btn primary" onClick={() => void refresh()}>
              重试
            </button>
          </div>
        )}

        {status && (
          <>
            {/* 插件列表 */}
            <section className="rp-card" id="demo-plugins">
              <h2>📦 已加载插件（ctx.registry）</h2>
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>插件</th>
                    <th>状态</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  {status.cordis.plugins.map((plugin) => (
                    <tr key={plugin.name}>
                      <td className="rp-mono">{plugin.name}</td>
                      <td>
                        <span className={`rp-status-dot ${plugin.status}`} />
                        {plugin.status}
                      </td>
                      <td style={{ color: "var(--text-dim)" }}>{plugin.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Hello 服务演示 */}
            <section className="rp-card" id="demo-hello">
              <h2>👋 @core/hello 服务演示</h2>
              <div className="rp-row">
                <input
                  className="rp-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="你的名字"
                />
                <button className="rp-btn primary" onClick={() => void callHello()}>
                  调用 hello.greet()
                </button>
                <span className="rp-badge">累计调用 {status.services.hello.calls} 次</span>
              </div>
              {helloMessage && <pre className="rp-log">{helloMessage}</pre>}
            </section>

            {/* Settings 服务演示 */}
            <section className="rp-card" id="demo-kvstore">
              <h2>🗄️ @core/kv-store 持久化演示（.robopi/settings.json）</h2>
              <div className="rp-row">
                <input
                  className="rp-input"
                  value={settingKey}
                  onChange={(e) => setSettingKey(e.target.value)}
                  placeholder="key"
                  style={{ width: 160 }}
                />
                <input
                  className="rp-input"
                  value={settingValue}
                  onChange={(e) => setSettingValue(e.target.value)}
                  placeholder="value"
                  style={{ width: 200 }}
                />
                <button className="rp-btn primary" onClick={() => void saveSetting()}>
                  写入
                </button>
                <button className="rp-btn" onClick={() => void loadSettings()}>
                  刷新
                </button>
              </div>
              {settingsData && (
                <pre className="rp-log">{JSON.stringify(settingsData, null, 2)}</pre>
              )}
            </section>

            {/* pi 设置状态 */}
            <section className="rp-card" id="demo-settings">
              <h2>⚙️ @core/settings（pi 数据层）</h2>
              <p>
                读写 <span className="rp-mono">~/.pi/agent/settings.json</span>（经 pi SDK SettingsManager）。
                默认模型：
                {status.services.settings.defaultModel
                  ? `${status.services.settings.defaultModel.provider ?? "?"} / ${status.services.settings.defaultModel.modelId}`
                  : "未设置"}
              </p>
              <p>
                @core/models 已接入 <span className="rp-mono">models.json</span>
                （键：{status.services.models.configKeys.join(", ") || "（空）"}），
                路由 <span className="rp-mono">/api/models-config</span> 已迁移为薄壳。
              </p>
            </section>

            {/* 架构说明 */}
            <section className="rp-card">
              <h2>🧭 本页验证的链路</h2>
              <p>
                <span className="rp-mono">NavRail</span> ←{" "}
                <span className="rp-mono">/api/robopi/status</span> ←{" "}
                <span className="rp-mono">ctx.webui</span>（@web/ui-host 的 navrail 插槽，由
                hello / settings / webui 三个插件注册）
              </p>
              <p>
                <span className="rp-mono">hello 表单</span> ←{" "}
                <span className="rp-mono">/api/robopi/hello</span> ←{" "}
                <span className="rp-mono">ctx.hello.greet()</span>（服务 + 事件广播）
              </p>
              <p>
                <span className="rp-mono">settings 表单</span> ←{" "}
                <span className="rp-mono">/api/robopi/settings</span> ←{" "}
                <span className="rp-mono">ctx.kvStore.set()</span>（RoboPi 自有 KV，JSON 原子持久化）
              </p>
              <p>
                <span className="rp-mono">pi 数据层</span> ←{" "}
                <span className="rp-mono">ctx.settings.manager</span>（pi SettingsManager，
                ~/.pi/agent/settings.json）· <span className="rp-mono">ctx.models</span>（models.json 读写 + 连通性测试）
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
