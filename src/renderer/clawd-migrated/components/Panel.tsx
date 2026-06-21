// @ts-nocheck
import React from "react";

interface PanelProps {
  id?: string;
  title: string;
  icon: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}

export function Panel({ id, title, icon, wide, children }: PanelProps) {
  return (
    <div className={`panel${wide ? " panel-wide" : ""}`} id={id}>
      <h2 className="panel-header"><span className="panel-icon">{icon}</span>{title}</h2>
      <div className="panel-body">{children}</div>
    </div>
  );
}

interface GroupCardProps {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

export function GroupCard({ icon, title, children }: GroupCardProps) {
  return (
    <div className="panel-group-card">
      <h3 className="panel-title">{icon && <span className="panel-icon-sm">{icon}</span>}{title}</h3>
      {children}
    </div>
  );
}

