// @ts-nocheck
import React from "react";

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <div className="field-control">{children}</div>
    </div>
  );
}

