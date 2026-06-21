import { PetEvent } from "../../shared/events";

export interface AppStats {
  totalSessions: number;
  totalRuntime: number;
  errorCount: number;
  toolUsage: Record<string, number>;
  dailyStats: Record<string, { events: number; toolCalls: number; sessions: number }>;
  permissionApproved: number;
  permissionDenied: number;
  hourlyActivity: number[];
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatHourRange(hour: number): string {
  const label = String(hour).padStart(2, "0");
  return `${label}:00-${label}:59`;
}

export function buildStats(events: PetEvent[], startedAt: number): AppStats {
  const today = new Date().toISOString().slice(0, 10);
  const toolUsage = events.reduce<Record<string, number>>((acc, event) => {
    if (event.tool) acc[event.tool] = (acc[event.tool] ?? 0) + 1;
    return acc;
  }, {});
  const hourlyActivity = Array.from({ length: 24 }, () => 0);
  events.forEach(event => { hourlyActivity[new Date(event.timestamp).getHours()] += 1; });

  return {
    totalSessions: events.length > 0 ? 1 : 0,
    totalRuntime: Date.now() - startedAt,
    errorCount: 0,
    toolUsage,
    dailyStats: {
      [today]: {
        events: events.length,
        toolCalls: events.filter(event => event.tool).length,
        sessions: events.length > 0 ? 1 : 0
      }
    },
    permissionApproved: 0,
    permissionDenied: events.filter(event => event.event === "permission-prompt").length,
    hourlyActivity
  };
}

export function StatsPanel({ stats }: { stats: AppStats }) {
  const sortedTools = Object.entries(stats.toolUsage ?? {}).sort((a, b) => b[1] - a[1]);
  const topHours = stats.hourlyActivity ? [...stats.hourlyActivity.map((value, hour) => ({ hour, count: value }))].sort((a, b) => b.count - a.count).slice(0, 3) : [];
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = stats.dailyStats?.[today];
  const totalToolCalls = Object.values(stats.toolUsage ?? {}).reduce((sum, count) => sum + count, 0);
  const days = Object.keys(stats.dailyStats ?? {}).length;
  const avgDaily = days > 0 ? Math.round(totalToolCalls / days) : 0;
  const permTotal = (stats.permissionApproved ?? 0) + (stats.permissionDenied ?? 0);
  const permRate = permTotal > 0 ? Math.round((stats.permissionApproved / permTotal) * 100) : 0;

  return (
    <div className="stats-deep">
      <div className="stats-grid">
        <div className="stat-item"><span className="stat-value">{stats.totalSessions ?? 0}</span><span className="stat-label">总会话数</span></div>
        <div className="stat-item"><span className="stat-value">{totalToolCalls}</span><span className="stat-label">总工具调用</span></div>
        <div className="stat-item"><span className="stat-value">{stats.errorCount ?? 0}</span><span className="stat-label">错误次数</span></div>
        <div className="stat-item"><span className="stat-value">{formatDuration(stats.totalRuntime ?? 0)}</span><span className="stat-label">累计运行</span></div>
        <div className="stat-item"><span className="stat-value">{days}</span><span className="stat-label">活跃天数</span></div>
        <div className="stat-item"><span className="stat-value">{avgDaily}</span><span className="stat-label">日均调用</span></div>
      </div>
      <div className="panel-divider" />
      <h3 className="panel-subtitle">今日概览</h3>
      <div className="stats-grid">
        <div className="stat-item"><span className="stat-value">{todayStats?.events ?? 0}</span><span className="stat-label">事件</span></div>
        <div className="stat-item"><span className="stat-value">{todayStats?.toolCalls ?? 0}</span><span className="stat-label">工具调用</span></div>
        <div className="stat-item"><span className="stat-value">{todayStats?.sessions ?? 0}</span><span className="stat-label">会话</span></div>
      </div>
      {sortedTools.length > 0 && (
        <>
          <div className="panel-divider" />
          <h3 className="panel-subtitle">工具使用排行</h3>
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
          <h3 className="panel-subtitle">权限请求</h3>
          <div className="stats-grid">
            <div className="stat-item"><span className="stat-value">{permTotal}</span><span className="stat-label">总请求</span></div>
            <div className="stat-item"><span className="stat-value" style={{ color: "var(--mint)" }}>{stats.permissionApproved ?? 0}</span><span className="stat-label">已批准</span></div>
            <div className="stat-item"><span className="stat-value" style={{ color: "var(--coral)" }}>{stats.permissionDenied ?? 0}</span><span className="stat-label">已拒绝</span></div>
            <div className="stat-item"><span className="stat-value">{permRate}%</span><span className="stat-label">批准率</span></div>
          </div>
        </>
      )}
      {topHours.length > 0 && topHours.some(hour => hour.count > 0) && (
        <>
          <div className="panel-divider" />
          <h3 className="panel-subtitle">最活跃时段</h3>
          <div className="stats-grid">
            {topHours.filter(hour => hour.count > 0).map(hour => (
              <div key={hour.hour} className="stat-item">
                <span className="stat-value">{formatHourRange(hour.hour)}</span>
                <span className="stat-label">{hour.count} 次</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
