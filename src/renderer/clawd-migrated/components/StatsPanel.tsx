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

export function StatsPanel({ stats }: { stats: AppStats }) {
  const { t } = useI18n();
  const sortedTools = Object.entries(stats.toolUsage ?? {}).sort((a, b) => b[1] - a[1]);
  const topHours = stats.hourlyActivity ? [...stats.hourlyActivity.map((value, hour) => ({ hour, count: value }))].sort((a, b) => b.count - a.count).slice(0, 3) : [];
  const today = localDateKey();
  const todayStats = stats.dailyStats?.[today];
  const totalToolCalls = Object.values(stats.toolUsage ?? {}).reduce((sum, count) => sum + count, 0);
  const days = Object.keys(stats.dailyStats ?? {}).length;
  const avgDaily = days > 0 ? Math.round(totalToolCalls / days) : 0;
  const permTotal = (stats.permissionApproved ?? 0) + (stats.permissionDenied ?? 0);
  const permRate = permTotal > 0 ? Math.round((stats.permissionApproved / permTotal) * 100) : 0;

  return (
    <div className="stats-deep">
      <div className="stats-grid">
        <div className="stat-item"><span className="stat-value">{stats.totalSessions ?? 0}</span><span className="stat-label">{t("stats.totalSessions", "总会话数")}</span></div>
        <div className="stat-item"><span className="stat-value">{totalToolCalls}</span><span className="stat-label">{t("stats.totalToolCalls", "总工具调用")}</span></div>
        <div className="stat-item"><span className="stat-value">{stats.errorCount ?? 0}</span><span className="stat-label">{t("stats.errors", "错误次数")}</span></div>
        <div className="stat-item"><span className="stat-value">{formatDuration(stats.totalRuntime ?? 0)}</span><span className="stat-label">{t("stats.totalRuntime", "累计运行")}</span></div>
        <div className="stat-item"><span className="stat-value">{days}</span><span className="stat-label">{t("stats.activeDays", "活跃天数")}</span></div>
        <div className="stat-item"><span className="stat-value">{avgDaily}</span><span className="stat-label">{t("stats.dailyAvg", "日均调用")}</span></div>
      </div>
      <div className="panel-divider" />
      <h3 className="panel-subtitle">{t("stats.todayOverview", "今日概览")}</h3>
      <div className="stats-grid">
        <div className="stat-item"><span className="stat-value">{todayStats?.events ?? 0}</span><span className="stat-label">{t("stats.todayEvents", "事件")}</span></div>
        <div className="stat-item"><span className="stat-value">{todayStats?.toolCalls ?? 0}</span><span className="stat-label">{t("stats.todayToolCalls", "工具调用")}</span></div>
        <div className="stat-item"><span className="stat-value">{todayStats?.sessions ?? 0}</span><span className="stat-label">{t("stats.todaySessions", "会话")}</span></div>
      </div>
      {sortedTools.length > 0 && (
        <>
          <div className="panel-divider" />
          <h3 className="panel-subtitle">{t("stats.toolRanking", "工具使用排行")}</h3>
          <div className="tool-rank-list">
            {sortedTools.map(([tool, count], index) => (
              <div key={tool} className="tool-rank-row">
                <span className="tool-rank-pos">{index + 1}</span>
                <span className="tool-rank-name">{tool}</span>
                <div className="tool-rank-bar">
                  <div className="tool-rank-fill" style={{ width: `${(count / (sortedTools[0]?.[1] ?? 1)) * 100}%` }} />
                </div>
                <span className="tool-rank-count">{count}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {permTotal > 0 && (
        <>
          <div className="panel-divider" />
          <h3 className="panel-subtitle">{t("stats.permissionRequests", "权限请求")}</h3>
          <div className="stats-grid">
            <div className="stat-item"><span className="stat-value">{permTotal}</span><span className="stat-label">{t("stats.totalRequests", "总请求")}</span></div>
            <div className="stat-item"><span className="stat-value" style={{ color: "var(--mint)" }}>{stats.permissionApproved ?? 0}</span><span className="stat-label">{t("stats.approved", "已批准")}</span></div>
            <div className="stat-item"><span className="stat-value" style={{ color: "var(--coral)" }}>{stats.permissionDenied ?? 0}</span><span className="stat-label">{t("stats.denied", "已拒绝")}</span></div>
            <div className="stat-item"><span className="stat-value">{permRate}%</span><span className="stat-label">{t("stats.approvalRate", "批准率")}</span></div>
          </div>
        </>
      )}
      {topHours.length > 0 && topHours.some(hour => hour.count > 0) && (
        <>
          <div className="panel-divider" />
          <h3 className="panel-subtitle">{t("stats.activeHours", "最活跃时段")}</h3>
          <div className="stats-grid">
            {topHours.filter(hour => hour.count > 0).map(hour => (
              <div key={hour.hour} className="stat-item">
                <span className="stat-value">{String(hour.hour).padStart(2, "0")}:00</span>
                <span className="stat-label">{hour.count} {t("stats.times", "次")}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

