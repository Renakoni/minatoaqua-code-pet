// @ts-nocheck
import React from "react";

interface StatusCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  meta?: string;
  tone?: string;
}

export function StatusCard({ icon, label, value, meta, tone }: StatusCardProps) {
  return (
    <div className={`status-card${tone ? ` tone-${tone}` : ""}`}>
      <div className="status-card-icon">{icon}</div>
      <div className="status-card-body">
        <div className="status-card-label">{label}</div>
        <div className="status-card-value">{value}</div>
        {meta && <div className="status-card-meta">{meta}</div>}
      </div>
    </div>
  );
}

interface ConnectionPillProps {
  connected: boolean;
  label?: string;
}

export function ConnectionPill({ connected, label }: ConnectionPillProps) {
  return (
    <div className={`connection-pill ${connected ? "connected" : "disconnected"}`}>
      <span className="connection-dot" />
      <span className="connection-label">{label ?? (connected ? "Connected" : "Disconnected")}</span>
    </div>
  );
}

interface ConnectionDetailProps {
  label: string;
  value: string;
}

export function ConnectionDetail({ label, value }: ConnectionDetailProps) {
  return (
    <div className="connection-detail">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

