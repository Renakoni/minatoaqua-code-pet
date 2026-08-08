// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "../../useI18n";

const COLLAPSED_ROWS = 8;

function RankColumn({ title, rows, expanded, zh }: { title: string; rows: any[]; expanded: boolean; zh: boolean }) {
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  const max = rows[0]?.count ?? 0;
  return (
    <div className="usage-rank-column">
      <header>
        <h3 className="panel-subtitle">{title}</h3>
        <span>{rows.length}</span>
      </header>
      {rows.length === 0 ? <p className="note">{zh ? "无数据" : "No data"}</p> : (
        <ol className="usage-rank-list">
          {visible.map(row => (
            <li key={row.name} className="usage-rank-row" title={`${row.name}: ${row.count}`}>
              <span className="usage-rank-name">{row.name}</span>
              <span className="usage-rank-bar" aria-hidden="true"><i style={{ width: `${max > 0 ? Math.max(4, (row.count / max) * 100) : 0}%` }} /></span>
              <b>{row.count.toLocaleString()}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function UsageRankingsPanel({ hideSensitiveContent = false }: { hideSensitiveContent?: boolean }) {
  const { t, locale } = useI18n();
  const zh = locale === "zh";
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scopeKey, setScopeKey] = useState("all");
  const [expanded, setExpanded] = useState(false);

  const load = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.companion.getUsageRankings(force);
      setSnapshot(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(false); }, []);

  const scope = useMemo(() => {
    if (!snapshot) return null;
    if (scopeKey === "all") return snapshot.global;
    return snapshot.projects?.find(project => project.projectKey === scopeKey) ?? snapshot.global;
  }, [snapshot, scopeKey]);

  const summary = snapshot && scope
    ? zh ? `${(scope.totalToolUses ?? 0).toLocaleString()} 次工具调用` : `${(scope.totalToolUses ?? 0).toLocaleString()} tool invocations`
    : zh ? "正在从会话日志统计…" : "Counting from session logs…";

  const hasMore = scope ? [scope.tools, scope.skills, scope.agents].some(rows => (rows?.length ?? 0) > COLLAPSED_ROWS) : false;

  return (
    <div className="usage-rankings-panel">
      <div className="usage-rankings-head">
        <p className="note">{error ? `${zh ? "加载失败" : "Failed to load"}: ${error}` : summary}</p>
        <div className="usage-rankings-controls">
          {!hideSensitiveContent && (snapshot?.projects?.length ?? 0) > 0 ? (
            <label className="usage-scope-select">
              <select value={scopeKey} onChange={event => setScopeKey(event.target.value)} aria-label={zh ? "统计范围" : "Ranking scope"}>
                <option value="all">{zh ? "全部项目" : "All projects"}</option>
                {snapshot.projects.map(project => (
                  <option key={project.projectKey} value={project.projectKey}>{project.projectName}</option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
          ) : null}
          <button className="ghost-btn" onClick={() => void load(true)} disabled={loading}>{loading ? (zh ? "扫描中…" : "Scanning…") : t("common.refresh", "刷新")}</button>
        </div>
      </div>

      {scope ? (
        <div className="usage-rank-columns">
          <RankColumn title={zh ? "工具" : "Tools"} rows={scope.tools ?? []} expanded={expanded} zh={zh} />
          <RankColumn title={zh ? "Skills / 命令" : "Skills / Commands"} rows={scope.skills ?? []} expanded={expanded} zh={zh} />
          <RankColumn title={zh ? "子代理" : "Subagents"} rows={scope.agents ?? []} expanded={expanded} zh={zh} />
        </div>
      ) : null}

      {hasMore || expanded ? (
        <button className="ghost-btn token-more-btn" onClick={() => setExpanded(value => !value)}>
          {expanded ? t("stats.collapse", "收起") : t("stats.showMore", "查看更多")}
        </button>
      ) : null}
    </div>
  );
}
