// @ts-nocheck
import React from "react";
import type { AppStats } from "../../shared/events";
import { useI18n } from "../useI18n";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function localDateKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHourRange(hour: number): string {
  const label = String(hour).padStart(2, "0");
  return `${label}:00-${label}:59`;
}

function formatCount(value: number, locale: string): string {
  return Math.round(value || 0).toLocaleString(locale);
}

export function StatsPanel({ stats }: { stats: AppStats }) {
  const { t, locale } = useI18n();
  const numberLocale = locale === "zh" ? "zh-CN" : "en-US";
  const sortedTools = Object.entries(stats.toolUsage ?? {}).sort((a, b) => b[1] - a[1]);
  const topHours = stats.hourlyActivity
    ? [...stats.hourlyActivity.map((value, hour) => ({ hour, count: value }))]
      .filter(hour => hour.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
    : [];
  const today = localDateKey();
  const todayStats = stats.dailyStats?.[today];
  const totalToolCalls = Object.values(stats.toolUsage ?? {}).reduce((sum, count) => sum + count, 0);
  const days = Object.keys(stats.dailyStats ?? {}).length;
  const avgDaily = days > 0 ? Math.round(totalToolCalls / days) : 0;
  const summaryRows = [
    { label: t("stats.totalSessions", "总会话数"), value: formatCount(stats.totalSessions ?? 0, numberLocale) },
    { label: t("stats.totalToolCalls", "总工具调用"), value: formatCount(totalToolCalls, numberLocale) },
    { label: t("stats.errors", "错误次数"), value: formatCount(stats.errorCount ?? 0, numberLocale) },
    { label: t("stats.dailyAvg", "日均调用"), value: formatCount(avgDaily, numberLocale) }
  ];
  const todayRows = [
    { label: t("stats.todayEvents", "事件"), value: formatCount(todayStats?.events ?? 0, numberLocale) },
    { label: t("stats.todayToolCalls", "工具调用"), value: formatCount(todayStats?.toolCalls ?? 0, numberLocale) },
    { label: t("stats.todaySessions", "会话"), value: formatCount(todayStats?.sessions ?? 0, numberLocale) }
  ];

  return (
    <div className="stats-workbench">
      <section className="stats-overview-surface">
        <div className="stats-runtime-lead">
          <span>{t("stats.totalRuntime", "累计运行")}</span>
          <strong>{formatDuration(stats.totalRuntime ?? 0)}</strong>
          <small>{days > 0 ? `${formatCount(days, numberLocale)} ${t("stats.activeDays", "活跃天数")}` : t("stats.noData", "无数据")}</small>
        </div>
        <div className="stats-summary-strip">
          {summaryRows.map(row => (
            <article key={row.label} className="stats-metric">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="stats-digest-panel">
        <div className="stats-digest-column">
          <header>
            <h3>{t("stats.todayOverview", "今日概览")}</h3>
            <time>{today}</time>
          </header>
          <div className="stats-line-list">
            {todayRows.map(row => (
              <div key={row.label} className="stats-line-row">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="stats-digest-column">
          <header>
            <h3>{t("stats.activeHours", "最活跃时段")}</h3>
            <span>Top3</span>
          </header>
          <div className="stats-line-list">
            {topHours.length > 0 ? topHours.map(hour => (
              <div key={hour.hour} className="stats-line-row">
                <span>{formatHourRange(hour.hour)}</span>
                <strong>{formatCount(hour.count, numberLocale)} {t("stats.times", "次")}</strong>
              </div>
            )) : <p className="note">{t("stats.noData", "无数据")}</p>}
          </div>
        </div>

      </section>

      {sortedTools.length > 0 && (
        <section className="stats-table-section">
          <header>
            <h3>{t("stats.toolRanking", "工具使用排行")}</h3>
            <span>{sortedTools.length}</span>
          </header>
          <div className="tool-rank-list">
            {sortedTools.map(([tool, count], index) => (
              <div key={tool} className="tool-rank-row">
                <span className="tool-rank-pos">{index + 1}</span>
                <span className="tool-rank-name">{tool}</span>
                <div className="tool-rank-bar">
                  <div className="tool-rank-fill" style={{ width: `${(count / (sortedTools[0]?.[1] ?? 1)) * 100}%` }} />
                </div>
                <span className="tool-rank-count">{formatCount(count, numberLocale)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

