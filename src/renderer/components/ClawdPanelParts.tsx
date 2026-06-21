import type { ReactNode } from "react";

interface PanelProps {
  id?: string;
  title: string;
  icon: ReactNode;
  wide?: boolean;
  children: ReactNode;
}

export function ClawdPanel({ id, title, icon, wide, children }: PanelProps) {
  return (
    <div className={`panel${wide ? " panel-wide" : ""}`} id={id}>
      <h2 className="panel-header"><span className="panel-icon">{icon}</span>{title}</h2>
      <div className="panel-body">{children}</div>
    </div>
  );
}

interface GroupCardProps {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}

export function GroupCard({ icon, title, children }: GroupCardProps) {
  return (
    <div className="panel-group-card">
      <h3 className="panel-title">{icon && <span className="panel-icon-sm">{icon}</span>}{title}</h3>
      {children}
    </div>
  );
}
