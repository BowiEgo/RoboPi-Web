"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";

/**
 * RoboPi 插件管理面板（SettingsPanel 的 "RoboPi 插件" section）。
 *
 * - 已安装插件：名称/版本/来源/更新/移除（git 安装的可移除，本地受保护）
 * - 插件市场：从 market.json（或 ROBOPI_PLUGIN_MARKET_URL）列出可安装插件，一键安装
 * - 本地路径安装：输入 git URL / 本地路径直接安装
 */

interface InstalledPlugin {
  name: string;
  version: string;
  description?: string;
  source?: { url: string; ref?: string };
}

interface MarketPlugin {
  name: string;
  description?: string;
  source: string;
  ref?: string;
  dir?: string;
  installed: boolean;
  installedVersion?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export function RoboPiPluginsPanel() {
  const { t } = useI18n();
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [market, setMarket] = useState<MarketPlugin[]>([]);
  const [marketFile, setMarketFile] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installInput, setInstallInput] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [list, marketData] = await Promise.all([
        fetchJson<{ plugins: InstalledPlugin[] }>("/api/robopi/plugins"),
        fetchJson<{ plugins: MarketPlugin[]; marketFile: string }>("/api/robopi/plugins/market"),
      ]);
      setInstalled(list.plugins);
      setMarket(marketData.plugins);
      setMarketFile(marketData.marketFile);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (label: string, action: string, body: Record<string, unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fetchJson("/api/robopi/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const install = (source: string, ref?: string, dir?: string) =>
    run(`install:${source}`, "install", { source, ref, dir });

  const style = {
    section: { display: "flex", flexDirection: "column" as const, gap: 12, padding: "0 4px" },
    groupTitle: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: 0.4 },
    card: {
      display: "flex", alignItems: "center" as const, justifyContent: "space-between" as const,
      gap: 10, padding: "8px 12px", borderRadius: 8,
      border: "1px solid var(--border)", background: "var(--bg)",
    },
    name: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
    meta: { fontSize: 11, color: "var(--text-dim)", marginTop: 2 },
    button: {
      border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
      borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", flexShrink: 0,
    } as React.CSSProperties,
    primaryButton: {
      border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff",
      borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", flexShrink: 0,
    } as React.CSSProperties,
    input: {
      flex: 1, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
      borderRadius: 6, padding: "5px 10px", fontSize: 12, outline: "none",
    },
    error: { fontSize: 12, color: "#ef4444", padding: "4px 8px" },
    empty: { fontSize: 12, color: "var(--text-dim)", padding: "8px 0" },
  };

  const isBusy = (key: string) => busy === key;

  return (
    <div style={style.section}>
      <div style={style.groupTitle}>已安装（{installed.length}）</div>
      {installed.length === 0 && <div style={style.empty}>没有已安装的插件。放入 ~/.pi/agent/pi-web/plugins/ 或从下方市场安装。</div>}
      {installed.map((p) => (
        <div key={p.name} style={style.card}>
          <div style={{ minWidth: 0 }}>
            <div style={style.name}>{p.name} <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>v{p.version}</span></div>
            <div style={style.meta}>
              {p.source ? `git: ${p.source.url}${p.source.ref ? ` @${p.source.ref}` : ""}` : "本地插件（受保护）"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {p.source && (
              <button style={style.button} disabled={isBusy(`update:${p.name}`)} onClick={() => run(`update:${p.name}`, "update", { name: p.name })}>
                {isBusy(`update:${p.name}`) ? "…" : "更新"}
              </button>
            )}
            {p.source && (
              <button style={style.button} disabled={isBusy(`remove:${p.name}`)} onClick={() => run(`remove:${p.name}`, "remove", { name: p.name })}>
                {isBusy(`remove:${p.name}`) ? "…" : "移除"}
              </button>
            )}
          </div>
        </div>
      ))}

      <div style={{ ...style.groupTitle, marginTop: 8 }}>插件市场（{market.length}）</div>
      {market.length === 0 && (
        <div style={style.empty}>
          市场为空。编辑 {marketFile || "market.json"} 添加条目，或设置环境变量 ROBOPI_PLUGIN_MARKET_URL 指向远程清单。
          参考格式：{"{ \"plugins\": [{ \"name\": \"x\", \"source\": \"git:https://...\", \"ref\": \"v1.0.0\" }] }"}
        </div>
      )}
      {market.map((p) => (
        <div key={p.name} style={style.card}>
          <div style={{ minWidth: 0 }}>
            <div style={style.name}>{p.name}{p.installed && <span style={{ color: "var(--accent)", marginLeft: 6 }}>已装 v{p.installedVersion}</span>}</div>
            <div style={style.meta}>{p.description ?? p.source}</div>
          </div>
          {!p.installed && (
            <button style={style.primaryButton} disabled={isBusy(`install:${p.source}`)} onClick={() => install(p.source, p.ref, p.dir)}>
              {isBusy(`install:${p.source}`) ? "安装中…" : "安装"}
            </button>
          )}
        </div>
      ))}

      <div style={{ ...style.groupTitle, marginTop: 8 }}>手动安装</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={style.input}
          value={installInput}
          onChange={(e) => setInstallInput(e.target.value)}
          placeholder="git URL / 本地路径（如 git:https://github.com/user/repo）"
        />
        <button
          style={style.primaryButton}
          disabled={!installInput.trim() || isBusy(`install:${installInput}`)}
          onClick={() => install(installInput.trim())}
        >
          {isBusy(`install:${installInput}`) ? "…" : "安装"}
        </button>
      </div>

      {error && <div style={style.error}>⚠️ {error}</div>}
      <div style={style.empty}>提示：修改插件文件后 5 秒内自动热更新，无需重启。</div>
    </div>
  );
}
