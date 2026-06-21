// @ts-nocheck
import React from "react";

interface StepProps {
  number: string;
  title: string;
  text: string;
}

export function Step({ number, title, text }: StepProps) {
  return (
    <div className="step">
      <div className="step-number">{number}</div>
      <div className="step-content">
        <div className="step-title">{title}</div>
        <div className="step-text">{text}</div>
      </div>
    </div>
  );
}

interface MappingRowProps {
  row: { source: string; tool?: string; state: string; title: string };
}

export function MappingRow({ row }: MappingRowProps) {
  return (
    <div className="mapping-row">
      <span className="mapping-source">{row.source}</span>
      {row.tool && <span className="mapping-arrow">→</span>}
      {row.tool && <span className="mapping-tool">{row.tool}</span>}
      <span className="mapping-arrow">→</span>
      <span className="mapping-state">{row.state}</span>
      <span className="mapping-arrow">→</span>
      <span className="mapping-title">{row.title}</span>
    </div>
  );
}

