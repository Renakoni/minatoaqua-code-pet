import React, { useEffect, useMemo, useState } from "react";
import { Code2, Package, PlugZap, RefreshCw, Search, Server } from "lucide-react";
import type { CompanionSettings } from "../../../shared/events";
import { useI18n } from "../../useI18n";

type ResourceTab = "skills" | "plugins" | "mcp";

type ClaudeResourceItem = {
  id: string;
  kind: "skill" | "plugin" | "mcp";
  name: string;
  description?: string;
  path?: string;
  enabled?: boolean;
  source: "claude" | "claude-json" | "unknown";
  detail?: string;
};

type ClaudeResourcesSnapshot = {
  summary: { skills: number; plugins: number; mcp: number };
  skills: ClaudeResourceItem[];
  plugins: ClaudeResourceItem[];
  mcp: ClaudeResourceItem[];
  scannedAt: number;
  paths: { claudeDir: string; claudeJson: string };
};

const emptySnapshot: ClaudeResourcesSnapshot = {
  summary: { skills: 0, plugins: 0, mcp: 0 },
  skills: [],
  plugins: [],
  mcp: [],
  scannedAt: 0,
  paths: { claudeDir: "~/.claude", claudeJson: "~/.claude.json" }
};

export function PluginsPage(_: { settings: CompanionSettings; updateSettings: (s: Partial<CompanionSettings>) => void }) {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [activeTab, setActiveTab] = useState<ResourceTab>("skills");
  const [query, setQuery] = useState("");
  const [snapshot, setSnapshot] = useState<ClaudeResourcesSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScanNote, setShowScanNote] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const next = await window.companion.getClaudeResources();
      setSnapshot((next as ClaudeResourcesSnapshot | null | undefined) ?? emptySnapshot);
      setShowScanNote(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!showScanNote) return undefined;
    const timer = window.setTimeout(() => setShowScanNote(false), 5000);
    return () => window.clearTimeout(timer);
  }, [showScanNote, snapshot.scannedAt]);

  const tabs = [
    { id: "skills" as const, label: "Skills", caption: zh ? "当前加载" : "Loaded", icon: Code2, count: snapshot.summary.skills },
    { id: "plugins" as const, label: "Plugins", caption: zh ? "安装记录" : "Installed", icon: Package, count: snapshot.summary.plugins },
    { id: "mcp" as const, label: "MCP", caption: zh ? "连接配置" : "Configured", icon: Server, count: snapshot.summary.mcp }
  ];
  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label ?? activeTab;

  const items = snapshot[activeTab] ?? [];
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(item => [item.name, item.description, item.path, item.detail, item.source].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [items, query]);

  useEffect(() => {
    setQuery("");
  }, [activeTab]);

  return (
    <div className="claude-resources-page claude-resources-page-dark">
      <nav className="claude-resource-subtabs compact">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} className={`claude-resource-subtab ${activeTab === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}>
              <Icon size={16} />
              <span><b>{tab.label}</b><em>{tab.caption}</em></span>
              <small>{tab.count}</small>
            </button>
          );
        })}
        <button className="claude-resource-subtab claude-resource-refresh-tab" onClick={() => void refresh()} disabled={loading} aria-label={zh ? "重新扫描" : "Refresh"} title={zh ? "重新扫描" : "Refresh"}>
          <RefreshCw size={17} />
        </button>
      </nav>

      <section className="claude-resource-list-toolbar">
        <div className="claude-resource-search dark">
          <Search size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? `搜索 ${activeTabLabel}` : `Search ${activeTabLabel}`} />
        </div>
        <span>{formatCount(filteredItems.length, items.length, zh)}</span>
      </section>

      {error ? <section className="connection-error"><PlugZap size={18} />{error}</section> : null}

      <section className="claude-resource-table" aria-busy={loading}>
        {loading ? (
          <div className="claude-resource-empty">{zh ? "正在扫描本地 Claude Code 资源..." : "Scanning local Claude Code resources..."}</div>
        ) : filteredItems.length === 0 ? (
          <div className="claude-resource-empty">{emptyText(activeTab, zh)}</div>
        ) : (
          <>
            <div className="claude-resource-table-head">
              <span>{zh ? "资源" : "Resource"}</span>
              <span>{zh ? "来源" : "Source"}</span>
              <span>{zh ? "状态" : "Status"}</span>
            </div>
            {filteredItems.map(item => {
              return (
                <article key={item.id} className="claude-resource-row">
                  <div className="claude-resource-row-main">
                    <div className="claude-resource-name-line">
                      <strong>{item.name}</strong>
                    </div>
                    <p>{item.description ?? item.detail ?? fallbackDescription(item.kind, zh)}</p>
                    {item.path ? <code title={item.path}>{compactPath(item.path)}</code> : null}
                  </div>
                  <div className="claude-resource-row-origin">
                    <span>{originEyebrow(item, zh)}</span>
                    <strong>{originLabel(item, zh)}</strong>
                  </div>
                  <div className={`claude-resource-status ${statusTone(item)}`}>
                    <span>{statusLabel(item, zh)}</span>
                  </div>
                </article>
              );
            })}
          </>
        )}
      </section>

      {showScanNote ? (
        <p className="note claude-resource-path-note dark">
          {zh ? "只读扫描" : "Read-only scan"} · {snapshot.paths.claudeDir} · {snapshot.paths.claudeJson}
          {snapshot.scannedAt ? ` · ${new Date(snapshot.scannedAt).toLocaleTimeString()}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function originEyebrow(item: ClaudeResourceItem, zh: boolean) {
  if (item.kind === "skill" && item.detail?.startsWith("plugin:")) return zh ? "插件" : "Plugin";
  if (item.kind === "skill") return zh ? "目录" : "Directory";
  if (item.kind === "plugin") return zh ? "注册表" : "Registry";
  return zh ? "配置" : "Config";
}

function originLabel(item: ClaudeResourceItem, zh: boolean) {
  if (item.kind === "skill" && item.detail?.startsWith("plugin:")) return item.detail.replace(/^plugin:\s*/, "");
  if (item.kind === "skill") return zh ? "用户目录" : "User skill";
  if (item.kind === "plugin") return item.detail ?? (zh ? "已安装插件" : "Installed plugin");
  return item.source === "claude-json" ? ".claude.json" : item.source;
}

function statusTone(item: ClaudeResourceItem) {
  if (item.kind === "plugin" && item.enabled !== true) return "idle";
  return "active";
}

function statusLabel(item: ClaudeResourceItem, zh: boolean) {
  if (item.kind === "skill") return zh ? "已加载" : "Loaded";
  if (item.kind === "plugin") return item.enabled === true ? (zh ? "已启用" : "Enabled") : (zh ? "已安装" : "Installed");
  return zh ? "已配置" : "Configured";
}

function compactPath(path: string) {
  return path.replace(/^([A-Z]:)?\\Users\\[^\\]+/i, "~").replace(/\\/g, "/");
}

function formatCount(filtered: number, total: number, zh: boolean) {
  if (filtered === total) return zh ? `${total} 项` : `${total} items`;
  return zh ? `${filtered} / ${total} 项` : `${filtered} / ${total} items`;
}

function fallbackDescription(kind: ClaudeResourceItem["kind"], zh: boolean) {
  if (kind === "skill") return zh ? "Claude Code Skill" : "Claude Code Skill";
  if (kind === "plugin") return zh ? "Claude Code Plugin" : "Claude Code Plugin";
  return zh ? "Claude Code MCP Server" : "Claude Code MCP Server";
}

function emptyText(tab: ResourceTab, zh: boolean) {
  if (tab === "skills") return zh ? "没有在当前 Claude Code 环境中发现 Skills。" : "No skills found in the current Claude Code environment.";
  if (tab === "plugins") return zh ? "没有在 ~/.claude/plugins 中发现 Plugins。" : "No plugins found in ~/.claude/plugins.";
  return zh ? "没有在 ~/.claude.json 中发现 mcpServers。" : "No mcpServers found in ~/.claude.json.";
}
