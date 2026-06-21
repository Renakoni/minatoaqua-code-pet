// @ts-nocheck
import React from "react";
import { useI18n } from "../useI18n";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function SessionStatsDashboard({ stats }: { stats: any }) {
  const { t } = useI18n();
  const totalToolCalls = Object.values(stats.toolUsage ?? {}).reduce((a: number, b: any) => a + b, 0) as number;
  const days = Object.keys(stats.dailyStats ?? {}).length;
  const avgDaily = days > 0 ? Math.round(totalToolCalls / days) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = stats.dailyStats?.[today];

  return (
    <div className="panel-group-card">
      <h3 className="panel-title">{t("stats.sessionStats", "Session Stats")}</h3>
      <div className="stats-grid">
        <div className="stat-item"><span className="stat-value">{stats.totalSessions ?? 0}</span><span className="stat-label">{t("stats.totalSessions", "Total Sessions")}</span></div>
        <div className="stat-item"><span className="stat-value">{totalToolCalls}</span><span className="stat-label">{t("stats.totalToolCalls", "Total Tool Calls")}</span></div>
        <div className="stat-item"><span className="stat-value">{stats.errorCount ?? 0}</span><span className="stat-label">{t("stats.errors", "Errors")}</span></div>
        <div className="stat-item"><span className="stat-value">{formatDuration(stats.totalRuntime ?? 0)}</span><span className="stat-label">{t("stats.totalRuntime", "Total Runtime")}</span></div>
        <div className="stat-item"><span className="stat-value">{days}</span><span className="stat-label">{t("stats.activeDays", "Active Days")}</span></div>
        <div className="stat-item"><span className="stat-value">{avgDaily}</span><span className="stat-label">{t("stats.dailyAvg", "Daily Avg")}</span></div>
      </div>
      <div className="panel-divider" />
      <h3 className="panel-subtitle">{t("stats.todayOverview", "Today")}</h3>
      <div className="stats-grid">
        <div className="stat-item"><span className="stat-value">{todayStats?.events ?? 0}</span><span className="stat-label">{t("stats.todayEvents", "Events")}</span></div>
        <div className="stat-item"><span className="stat-value">{todayStats?.toolCalls ?? 0}</span><span className="stat-label">{t("stats.todayToolCalls", "Tool Calls")}</span></div>
        <div className="stat-item"><span className="stat-value">{todayStats?.sessions ?? 0}</span><span className="stat-label">{t("stats.todaySessions", "Sessions")}</span></div>
      </div>
    </div>
  );
}

