"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { ConfigButton } from "./SettingsUi";
import { MarkdownBody } from "./MarkdownBody";

/**
 * RoboPi 插件管理面板（SettingsPanel 的 "RoboPi 插件" section）。
 *
 * 布局与 ModelsConfig/SkillsConfig 等设置页保持一致（settings.css 的
 * config-button 体系 + 列表行分隔线风格）：
 * - 左栏：已安装 / 插件市场 两个分组（FileExplorer 风格箭头折叠），
 *   列表行为 panel 风格（borderBottom 分隔），点击选中 → 右栏预览
 * - 右栏：选中插件的 README.md（MarkdownBody 渲染）
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

/** 左栏分组（可折叠 header + panel 风格列表） */
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
          padding: "8px 6px", background: "none", border: "none", cursor: "pointer",
          borderRadius: 4, fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
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
      display: "flex", gap: 16, height: "100%", minHeight: 0,
    },
    left: {
      width: 280, flexShrink: 0, display: "flex", flexDirection: "column" as const, gap: 4,
      overflowY: "auto" as const, borderRight: "1px solid var(--border)", paddingRight: 12,
    },
    right: {
      flex: 1, minWidth: 0, overflowY: "auto" as const, padding: "0 4px",
    },
    // panel 风格列表行（与 SkillsConfig 列表一致：分隔线 + 主次文本）
    row: {
      padding: "10px 8px",
      borderBottom: "1px solid var(--border)",
      borderRadius: 6,
      cursor: "pointer",
    },
    rowName: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
    rowMeta: { fontSize: 11, color: "var(--text-dim)", marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const },
    devBadge: { color: "var(--accent)" },
    empty: { fontSize: 12, color: "var(--text-dim)", padding: "8px 6px" },
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
        {/* ============ 左栏：分组列表（panel 风格） ============ */}
        <div style={style.left}>
          <Group title="已安装" count={installed.length}>
            {installed.length === 0 && <div style={style.empty}>无已安装插件</div>}
            {installed.map((p) => (
              <div
                key={p.name}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(p.name)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(p.name); }}
                style={{
                  ...style.row,
                  background: selected === p.name ? "var(--bg-selected)" : "transparent",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={style.rowName}>
                  {p.name}
                  {p.origin === "dev" && <span style={{ ...style.devBadge, marginLeft: 6, fontSize: 10 }}>🧪 dev</span>}
                  <span style={{ fontWeight: 400, color: "var(--text-dim)", marginLeft: 6, fontSize: 11 }}>v{p.version}</span>
                </div>
                <div style={style.rowMeta}>
                  {p.origin === "dev"
                    ? "本地开发目录（自动挂载）"
                    : p.source
                      ? `git: ${p.source.url}${p.source.ref ? ` @${p.source.ref}` : ""}`
                      : "本地插件（受保护）"}
                </div>
                {p.source && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <ConfigButton size="small" disabled={isBusy(`update:${p.name}`)} onClick={() => run(`update:${p.name}`, "update", { name: p.name })}>
                      {isBusy(`update:${p.name}`) ? "…" : "更新"}
                    </ConfigButton>
                    <ConfigButton size="small" disabled={isBusy(`remove:${p.name}`)} onClick={() => run(`remove:${p.name}`, "remove", { name: p.name })}>
                      {isBusy(`remove:${p.name}`) ? "…" : "移除"}
                    </ConfigButton>
                  </div>
                )}
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
              <div
                key={p.name}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(p.name)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(p.name); }}
                style={{
                  ...style.row,
                  background: selected === p.name ? "var(--bg-selected)" : "transparent",
                }}
              >
                <div style={style.rowName}>
                  {p.name}
                  {p.installed && (
                    <span style={{ fontWeight: 400, color: "var(--text-dim)", marginLeft: 6, fontSize: 11 }}>
                      已装 v{p.installedVersion}
                    </span>
                  )}
                </div>
                <div style={style.rowMeta}>{p.description ?? p.source}</div>
                {!p.installed && (
                  <div style={{ marginTop: 6 }}>
                    <ConfigButton
                      variant="primary"
                      size="small"
                      disabled={isBusy(`install:${p.source}`)}
                      onClick={() => install(p.source, p.ref, p.dir)}
                    >
                      {isBusy(`install:${p.source}`) ? "安装中…" : "安装"}
                    </ConfigButton>
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
                  {"version" in selectedPlugin && selectedPlugin.version ? `v${selectedPlugin.version}` : ""}
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
