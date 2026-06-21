// @ts-nocheck
import React, { useEffect, useState } from "react";
import type { EventHistoryEntry } from "../../shared/events";
import { useI18n } from "../useI18n";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function TimelinePanel() {
  const { t } = useI18n();
  const [events, setEvents] = useState<EventHistoryEntry[]>([]);

  useEffect(() => {
    window.companion.getEventHistory().then(setEvents).catch(e => console.warn("[Timeline] Get events:", e));
    const unsub = window.companion.onEvent(() => {
      window.companion.getEventHistory().then(setEvents).catch(e => console.warn("[Timeline] Refresh:", e));
    });
    return unsub;
  }, []);

  const sessions = events.filter(e => e.event.event === "session_start");
  const sessionTimeline = sessions.map(s => {
    const sessionEvents = events.filter(e => e.event.sessionId === s.event.sessionId && e.timestamp >= s.timestamp);
    const endEvent = sessionEvents.find(e => e.event.event === "done" || e.event.event === "error");
    return { session: s, count: sessionEvents.length, endTime: endEvent?.timestamp ?? Date.now() };
  });

  return (
    <div className="panel-group-card">
      <h3 className="panel-title">{t("timeline.title", "Session Timeline")}</h3>
      {sessionTimeline.length === 0 ? (
        <div className="empty">{t("timeline.empty", "No session data")}</div>
      ) : (
        <div className="event-list">
          {sessionTimeline.slice(-10).reverse().map((s, i) => (
            <div key={s.session.id} className="event-row" style={{ gridTemplateColumns: "1fr 60px 72px" }}>
              <strong>{s.session.event.title || t("timeline.session", "Session") + " " + (i + 1)}</strong>
              <span>{formatDuration(s.endTime - s.session.timestamp)}</span>
              <em>{s.count} {t("timeline.events", "events")}</em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

