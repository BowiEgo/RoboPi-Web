"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  ConfigButton,
  ConfigDetailStack,
  ConfigPanelShell,
  ConfigSidebar,
  ConfigSidebarGroupLabel,
  ConfigSidebarItem,
  ConfigSidebarList,
  ConfigSidebarText,
  ConfigSplitView,
} from "./SettingsUi";
import { MarkdownBody } from "./MarkdownBody";

/**
 * RoboPi 插件管理面板（SettingsPanel 的 "RoboPi 插件" section）。
 *
 * 布局与 ModelsConfig 一致（ConfigPanelShell / ConfigSplitView / ConfigSidebar /
 * ConfigSidebarList / ConfigSidebarItem / ConfigDetailStack）：
 * - 左栏：已安装 / 插件市场 分组（可折叠，箭头保留 FileExplorer 风格）
 * - 右栏：选中插件的操作区（安装/更新/移除）+ README.md（MarkdownBody 渲染）
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

/** 可折叠分组标签（样式对齐 ConfigSidebarGroupLabel，箭头 FileExplorer 风格） */
function CollapsibleGroupLabel({
  title,
  count,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="config-sidebar-group-label"
      style={{
        display: "flex", alignItems: "center", gap: 4, width: "100%",
        background: "none", border: "none", cursor: "pointer",
      }}
    >
      <svg
        width="9" height="9" viewBox="0 0 10 10" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.1s" }}
      >
        <polyline points="3 2 7 5 3 8" />
      </svg>
      <span>{title}</span>
      <span style={{ fontWeight: 400 }}>({count})</span>
    </button>
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
  const [installedOpen, setInstalledOpen] = useState(true);
  const [marketOpen, setMarketOpen] = useState(true);

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

  const style = {
    detail: {
      padding: 16, minHeight: 0, overflowY: "auto" as const,
    },
    detailTitle: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
    detailMeta: { fontSize: 11, color: "var(--text-dim)", marginBottom: 10 },
    actions: { display: "flex", gap: 6, marginBottom: 12 },
    empty: { fontSize: 12, color: "var(--text-dim)", padding: "4px 8px" },
    error: { fontSize: 12, color: "#ef4444", padding: "4px 8px" },
    readmePlaceholder: {
      fontSize: 12, color: "var(--text-dim)", padding: 12, border: "1px dashed var(--border)",
      borderRadius: 8,
    },
  };

  const isBusy = (key: string) => busy === key;

  const allPlugins = [...installed, ...market.filter((m) => !m.installed)];
  const selectedPlugin = allPlugins.find((p) => p.name === selected);
  const selectedInstalled = installed.find((p) => p.name === selected);
  const selectedMarket = market.find((p) => p.name === selected);
  const selectedSource = selectedInstalled?.source;

  return (
    <ConfigPanelShell embedded title={t("robopi.title")} subtitle="~/.pi/agent/robopi" onClose={() => {}}>
      <ConfigSplitView>
        {/* ============ 左栏：分组列表 ============ */}
        <ConfigSidebar>
          <ConfigSidebarList>
            <CollapsibleGroupLabel
              title={t("robopi.installed")}
              count={installed.length}
              open={installedOpen}
              onToggle={() => setInstalledOpen((v) => !v)}
            />
            {installedOpen && installed.length === 0 && (
              <div style={style.empty}>{t("robopi.installedEmpty")}</div>
            )}
            {installedOpen && installed.map((p) => (
              <ConfigSidebarItem
                key={p.name}
                active={selected === p.name}
                onClick={() => setSelected(p.name)}
              >
                <ConfigSidebarText className="is-grow">{p.name}</ConfigSidebarText>
                {p.origin === "dev" ? (
                  <span style={{ fontSize: 10, color: "var(--accent)" }}>{t("robopi.devBadge")}</span>
                ) : (
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>v{p.version}</span>
                )}
              </ConfigSidebarItem>
            ))}

            <div style={{ height: 8 }} />

            <CollapsibleGroupLabel
              title={t("robopi.market")}
              count={market.length}
              open={marketOpen}
              onToggle={() => setMarketOpen((v) => !v)}
            />
            {marketOpen && market.length === 0 && (
              <div style={style.empty}>
                {t("robopi.marketEmpty", { file: marketFile || "market.json" })}
              </div>
            )}
            {marketOpen && market.map((p) => (
              <ConfigSidebarItem
                key={p.name}
                active={selected === p.name}
                onClick={() => setSelected(p.name)}
              >
                <ConfigSidebarText className="is-grow">{p.name}</ConfigSidebarText>
                {p.installed ? (
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{t("robopi.installedVersion", { version: p.installedVersion ?? "" })}</span>
                ) : (
                  <span style={{ fontSize: 10, color: "var(--accent)" }}>{p.ref ?? t("robopi.installable")}</span>
                )}
              </ConfigSidebarItem>
            ))}
          </ConfigSidebarList>
        </ConfigSidebar>

        {/* ============ 右栏：操作区 + README ============ */}
        <ConfigDetailStack>
          <div style={style.detail}>
            {!selectedPlugin && <div style={style.readmePlaceholder}>{t("robopi.selectHint")}</div>}

            {selectedPlugin && (
              <>
                <div style={style.detailTitle}>
                  {selectedPlugin.name}
                  {selectedInstalled?.origin === "dev" && (
                    <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 8 }}>{t("robopi.devInProgress")}</span>
                  )}
                </div>
                <div style={style.detailMeta}>
                  {"version" in selectedPlugin && selectedPlugin.version
                    ? `v${selectedPlugin.version}`
                    : selectedMarket?.ref
                      ? `@${selectedMarket.ref}`
                      : ""}
                  {selectedInstalled?.origin === "dev"
                    ? ` · ${t("robopi.localDevDir")}`
                    : selectedSource
                      ? ` · ${t("robopi.gitSource", { url: selectedSource.url })}${selectedSource.ref ? ` @${selectedSource.ref}` : ""}`
                      : ` · ${t("robopi.localProtected")}`}
                </div>

                {/* 操作区（与 ModelsConfig 一致：操作在详情侧） */}
                <div style={style.actions}>
                  {selectedInstalled && !selectedInstalled.origin && selectedSource && (
                    <>
                      <ConfigButton size="small" disabled={isBusy(`update:${selected}`)} onClick={() => run(`update:${selected}`, "update", { name: selected })}>
                        {isBusy(`update:${selected}`) ? "…" : t("robopi.update")}
                      </ConfigButton>
                      <ConfigButton size="small" disabled={isBusy(`remove:${selected}`)} onClick={() => run(`remove:${selected}`, "remove", { name: selected })}>
                        {isBusy(`remove:${selected}`) ? "…" : t("robopi.remove")}
                      </ConfigButton>
                    </>
                  )}
                  {selectedMarket && !selectedMarket.installed && (
                    <ConfigButton
                      variant="primary"
                      size="small"
                      disabled={isBusy(`install:${selectedMarket.source}`)}
                      onClick={() => run(`install:${selectedMarket.source}`, "install", { source: selectedMarket.source, ref: selectedMarket.ref, dir: selectedMarket.dir })}
                    >
                      {isBusy(`install:${selectedMarket.source}`) ? t("robopi.installing") : t("robopi.install")}
                    </ConfigButton>
                  )}
                </div>

                {readme?.name === selected && readme.content ? (
                  <MarkdownBody className="markdown-custom-message">{readme.content}</MarkdownBody>
                ) : (
                  <div style={style.readmePlaceholder}>{t("robopi.noReadme")}</div>
                )}
              </>
            )}
          </div>
        </ConfigDetailStack>
      </ConfigSplitView>

      {/* 底部提示 */}
      <div style={{ ...style.empty, borderTop: "1px solid var(--border)", padding: "8px 12px" }}>
        {error && <div style={style.error}>⚠️ {error}</div>}
        <div>{t("robopi.footerHint")}</div>
      </div>
    </ConfigPanelShell>
  );
}
