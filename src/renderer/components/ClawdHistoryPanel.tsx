import { useMemo, useState } from "react";
import { PetEvent } from "../../shared/events";

const filters = ["all", "tool", "permission-prompt", "completed", "idle", "running"] as const;

type Filter = typeof filters[number];

function tooltip(event: PetEvent) {
  return [event.event, event.tool, event.title, event.detail ?? event.message].filter(Boolean).join(" · ");
}

function localizeEvent(event: PetEvent) {
  if (event.event === "running") return { title: event.title ?? "收到新任务", message: event.message ?? event.detail ?? "正在分析你的输入。" };
  if (event.event === "idle") return { title: event.title ?? "会话开始", message: event.message ?? event.detail ?? "Aqua 已经进入陪跑状态。" };
  if (event.event === "completed") return { title: event.title ?? "处理完成", message: event.message ?? event.detail ?? "这一轮已经结束。" };
  if (event.event === "permission-prompt") return { title: event.title ?? "需要确认", message: event.message ?? event.detail ?? "Claude Code 正在等待你的许可。" };
  return { title: event.title ?? event.event, message: event.message ?? event.detail ?? "" };
}

export function HistoryPanel({ events }: { events: PetEvent[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "tool") return events.filter(event => event.tool);
    return events.filter(event => event.event === filter);
  }, [events, filter]);

  return (
    <div className="panel-group-card">
      <div className="panel-header">
        <h3 className="panel-title">Session History</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="ghost-btn">刷新</button>
          <button className="ghost-btn danger">Clear</button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="empty">No sessions</div>
      ) : (
        <div className="session-history-layout">
          <div className="session-list">
            <button className="session-list-item active">
              <strong>{events[0]?.title ?? "当前会话"}</strong>
              <span>Claude Code / Codex · {events.length} events</span>
              <small>{new Date(events[0]?.timestamp ?? Date.now()).toLocaleString()}</small>
            </button>
          </div>

          <div className="session-timeline-panel">
            <div className="session-detail-head">
              <div>
                <strong>{events[0]?.title ?? "当前会话"}</strong>
                <p>{events[0]?.id ?? "local-session"}</p>
              </div>
              <span className="session-status done">active</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {filters.map(item => (
                <button key={item} className="ghost-btn" style={filter === item ? { background: "rgba(234,187,88,0.2)", color: "var(--honey)" } : {}} onClick={() => setFilter(item)}>{item}</button>
              ))}
            </div>
            <div className="timeline-track">
              {filtered.map((event, index) => (
                <div key={event.id} className={`timeline-marker ${event.event}`} style={{ left: filtered.length === 1 ? "50%" : `${(index / Math.max(1, filtered.length - 1)) * 100}%` }} title={tooltip(event)}>
                  <span />
                </div>
              ))}
            </div>
            <div className="event-list" style={{ marginTop: 18 }}>
              {filtered.slice().reverse().map(event => {
                const display = localizeEvent(event);
                return (
                  <div key={event.id} className="event-row" title={tooltip(event)}>
                    <em>{event.event}</em>
                    <strong>{display.title}</strong>
                    <p>{display.message}</p>
                    <span>{event.tool ?? ""}</span>
                    <small>{new Date(event.timestamp).toLocaleTimeString()}</small>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
