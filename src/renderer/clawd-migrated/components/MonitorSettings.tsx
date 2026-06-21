// @ts-nocheck
import React, { useEffect, useState } from "react";
import { useI18n } from "../useI18n";

export function MonitorSettings({ settings, updateSettings }: { settings: any; updateSettings: (s: any) => void }) {
  const { t } = useI18n();
  const [monitors, setMonitors] = useState<Array<{ id: string; name: string; isPrimary: boolean }>>([]);
  useEffect(() => {
    window.companion.getMonitors().then(setMonitors).catch(e => console.warn("[Monitor] Get monitors:", e));
  }, []);

  return (
    <div className="panel-group-card">
      <h3 className="panel-title">{t("settings.multiMonitor", "Multi-Monitor")}</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("settings.monitorId", "Display")}:</span>
        <select value={settings.displayMonitorId || ""}
          onChange={e => updateSettings({ displayMonitorId: e.target.value } as any)}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", color: "var(--ink)" }}>
          <option value="">{t("settings.currentMonitor", "Current Display")}</option>
          {monitors.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

