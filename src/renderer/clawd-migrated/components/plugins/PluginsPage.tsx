// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Box, PlugZap, RefreshCw, Search, Server, Sparkles } from "lucide-react";
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
      setSnapshot(next ?? emptySnapshot);
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
    { id: "skills" as const, label: "Skills", icon: Sparkles, count: snapshot.summary.skills },
    { id: "plugins" as const, label: "Plugins", icon: Box, count: snapshot.summary.plugins },
    { id: "mcp" as const, label: "MCP", icon: Server, count: snapshot.summary.mcp }
  ];

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
              <span>{tab.label}</span>
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
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? `搜索 ${activeTab}...` : `Search ${activeTab}...`} />
        </div>
        <span>{filteredItems.length}/{items.length}</span>
      </section>

      {error ? <section className="connection-error"><PlugZap size={18} />{error}</section> : null}

      <section className="claude-resource-table" aria-busy={loading}>
        {loading ? (
          <div className="claude-resource-empty">{zh ? "正在扫描本地 Claude Code 资源..." : "Scanning local Claude Code resources..."}</div>
        ) : filteredItems.length === 0 ? (
          <div className="claude-resource-empty">{emptyText(activeTab, zh)}</div>
        ) : filteredItems.map(item => (
          <article key={item.id} className="claude-resource-row">
            <div className="claude-resource-row-main">
              <div className="claude-resource-name-line">
                <strong>{item.name}</strong>
                <span>{zh ? "本地" : "Local"}</span>
              </div>
              <p>{item.description ?? item.detail ?? fallbackDescription(item.kind, zh)}</p>
            </div>
            <div className="claude-resource-row-meta">
              <ResourceMark label="Claude" tone="claude" />
              <ResourceMark label={item.kind.toUpperCase()} tone="kind" />
              <ResourceMark label={item.enabled === false ? (zh ? "关闭" : "Off") : (zh ? "启用" : "On")} tone={item.enabled === false ? "off" : "on"} />
            </div>
          </article>
        ))}
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

function ResourceMark({ label, tone }: { label: string; tone: "claude" | "kind" | "on" | "off" }) {
  return <span className={`claude-resource-mark ${tone}`}>{label}</span>;
}

function fallbackDescription(kind: ClaudeResourceItem["kind"], zh: boolean) {
  if (kind === "skill") return zh ? "Claude Code Skill" : "Claude Code Skill";
  if (kind === "plugin") return zh ? "Claude Code Plugin" : "Claude Code Plugin";
  return zh ? "Claude Code MCP Server" : "Claude Code MCP Server";
}

function emptyText(tab: ResourceTab, zh: boolean) {
  if (tab === "skills") return zh ? "没有在 ~/.claude/skills 中发现 Skills。" : "No skills found in ~/.claude/skills.";
  if (tab === "plugins") return zh ? "没有在 ~/.claude/plugins 中发现 Plugins。" : "No plugins found in ~/.claude/plugins.";
  return zh ? "没有在 ~/.claude.json 中发现 mcpServers。" : "No mcpServers found in ~/.claude.json.";
}
