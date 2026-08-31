"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { MarkdownBody } from "./MarkdownBody";

/**
 * RoboPi 插件管理面板（SettingsPanel 的 "RoboPi 插件" section）。
 *
 * 布局（参考 ModelsConfig/SkillsConfig 视觉风格）：
 * - 左栏：已安装 / 插件市场 两个分组（FileExplorer 风格展开/折叠），点击插件选中
 * - 右栏：选中插件的 README.md（MarkdownBody 渲染；无 README 显示占位）
 */

interface InstalledPlugin {
  name: string;
  version: string;
  description?: string;
  source?: { url: string; ref?: string };
  origin?: "dev" | "installed";
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

/** FileExplorer 风格箭头（展开时旋转 90°） */
function CollapseArrow({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      stroke="var(--text-dim)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.1s" }}
    >
      <polyline points="3 2 7 5 3 8" />
    </svg>
  );
}

/** 左栏分组（可折叠 header + 列表项） */
function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: "6px 8px", background: "none", border: "none", cursor: "pointer",
          borderRadius: 4, fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: 0.4,
        }}
      >
        <CollapseArrow open={open} />
        <span>{title}</span>
        <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>({count})</span>
      </button>
      {open && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  );
}

export function RoboPiPluginsPanel() {
  const { t } = useI18n();
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [market, setMarket] = useState<MarketPlugin[]>([]);
  const [marketFile, setMarketFile] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [readme, setReadme] = useState<{ name: string; content: string | null } | null>(null);

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

  // 自动选中第一个插件
  useEffect(() => {
    if (!selected && installed.length > 0) {
      setSelected(installed[0].name);
    }
  }, [installed, selected]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetchJson<{ name: string; readme: string | null }>(`/api/robopi/plugins/readme?name=${encodeURIComponent(selected)}`)
      .then((data) => {
        if (!cancelled) setReadme({ name: data.name, content: data.readme });
      })
      .catch(() => {
        if (!cancelled) setReadme({ name: selected, content: null });
      });
    return () => { cancelled = true; };
  }, [selected]);

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
    container: {
      display: "flex", gap: 12, height: "100%", minHeight: 0,
    },
    left: {
      width: 260, flexShrink: 0, display: "flex", flexDirection: "column" as const, gap: 4,
      overflowY: "auto" as const, borderRight: "1px solid var(--border)", paddingRight: 8,
    },
    right: {
      flex: 1, minWidth: 0, overflowY: "auto" as const, padding: "0 4px",
    },
    item: {
      display: "flex", alignItems: "center" as const, justifyContent: "space-between" as const,
      gap: 8, width: "100%", padding: "5px 8px", border: "none", borderRadius: 6,
      background: "none", cursor: "pointer", textAlign: "left" as const,
      fontSize: 12.5, color: "var(--text)",
    },
    itemName: {
      overflow: "hidden", textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const, flex: 1,
    },
    badge: { fontSize: 10, color: "var(--text-dim)", flexShrink: 0 },
    devBadge: { fontSize: 10, color: "var(--accent)", flexShrink: 0 },
    button: {
      border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
      borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer", flexShrink: 0,
    } as React.CSSProperties,
    primaryButton: {
      border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff",
      borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer", flexShrink: 0,
    } as React.CSSProperties,
    empty: { fontSize: 12, color: "var(--text-dim)", padding: "4px 8px" },
    error: { fontSize: 12, color: "#ef4444", padding: "4px 8px" },
    readmePlaceholder: {
      fontSize: 12, color: "var(--text-dim)", padding: "12px", border: "1px dashed var(--border)",
      borderRadius: 8,
    },
    readmeTitle: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  };

  const isBusy = (key: string) => busy === key;
  const allPlugins = [...installed, ...market.filter((m) => !m.installed)];
  const selectedPlugin = allPlugins.find((p) => p.name === selected);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={style.container}>
        {/* ============ 左栏：分组列表 ============ */}
        <div style={style.left}>
          <Group title="已安装" count={installed.length}>
            {installed.length === 0 && <div style={style.empty}>无已安装插件</div>}
            {installed.map((p) => (
              <div key={p.name} style={{ marginBottom: 2 }}>
                <button
                  type="button"
                  onClick={() => setSelected(p.name)}
                  style={{
                    ...style.item,
                    background: selected === p.name ? "var(--bg-selected)" : "transparent",
                  }}
                >
                  <span style={style.itemName}>{p.name}</span>
                  {p.origin === "dev" ? (
                    <span style={style.devBadge}>🧪 dev</span>
                  ) : (
                    <span style={style.badge}>v{p.version}</span>
                  )}
                </button>
                <div style={{ display: "flex", gap: 4, paddingLeft: 18 }}>
                  {p.source && (
                    <button
                      style={style.button}
                      disabled={isBusy(`update:${p.name}`)}
                      onClick={() => run(`update:${p.name}`, "update", { name: p.name })}
                    >
                      {isBusy(`update:${p.name}`) ? "…" : "更新"}
                    </button>
                  )}
                  {p.source && (
                    <button
                      style={style.button}
                      disabled={isBusy(`remove:${p.name}`)}
                      onClick={() => run(`remove:${p.name}`, "remove", { name: p.name })}
                    >
                      {isBusy(`remove:${p.name}`) ? "…" : "移除"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Group>

          <Group title="插件市场" count={market.length}>
            {market.length === 0 && (
              <div style={style.empty}>
                市场为空。编辑 {marketFile || "market.json"} 添加条目，或设置环境变量 ROBOPI_PLUGIN_MARKET_URL 指向远程清单。
              </div>
            )}
            {market.map((p) => (
              <div key={p.name} style={{ marginBottom: 2 }}>
                <button
                  type="button"
                  onClick={() => setSelected(p.name)}
                  style={{
                    ...style.item,
                    background: selected === p.name ? "var(--bg-selected)" : "transparent",
                  }}
                >
                  <span style={style.itemName}>{p.name}</span>
                  {p.installed ? (
                    <span style={style.badge}>已装 v{p.installedVersion}</span>
                  ) : (
                    <span style={style.badge}>{p.ref ?? ""}</span>
                  )}
                </button>
                {!p.installed && (
                  <div style={{ paddingLeft: 18 }}>
                    <button
                      style={style.primaryButton}
                      disabled={isBusy(`install:${p.source}`)}
                      onClick={() => install(p.source, p.ref, p.dir)}
                    >
                      {isBusy(`install:${p.source}`) ? "安装中…" : "安装"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </Group>
        </div>

        {/* ============ 右栏：README 预览 ============ */}
        <div style={style.right}>
          {!selectedPlugin && <div style={style.readmePlaceholder}>从左侧选择一个插件查看说明</div>}
          {selectedPlugin && (
            <>
              <div style={style.readmeTitle}>
                {selectedPlugin.name}
                <span style={{ fontWeight: 400, color: "var(--text-dim)", marginLeft: 8 }}>
                  v{("version" in selectedPlugin && selectedPlugin.version) || ""}
                  {"origin" in selectedPlugin && selectedPlugin.origin === "dev" ? " · 🧪 开发中（plugins-dev）" : ""}
                </span>
              </div>
              {readme?.name === selected && readme.content ? (
                <MarkdownBody className="markdown-custom-message">{readme.content}</MarkdownBody>
              ) : (
                <div style={style.readmePlaceholder}>该插件没有 README.md（在插件目录添加 README.md 即可在此显示）</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ============ 底部提示 ============ */}
      <div style={{ ...style.empty, borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
        {error && <div style={style.error}>⚠️ {error}</div>}
        <div>提示：dev 模式下 plugins-dev 下的插件自动挂载（🧪 标记）；修改插件文件后 5 秒内自动热更新；本地/开发插件受保护，git 安装的可更新与移除。</div>
      </div>
    </div>
  );
}
