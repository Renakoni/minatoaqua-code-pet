// @ts-nocheck
import React from "react";

interface ToggleProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Accessible name for the switch when `label` is empty/decorative (e.g. the row
   *  already shows the name elsewhere). A wrapping <label> does not name a
   *  div[role="switch"], so screen readers need an explicit name here. */
  ariaLabel?: string;
}

export function Toggle({ label, checked, onChange, ariaLabel }: ToggleProps) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <div
        className={`toggle ${checked ? "on" : "off"}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
      >
        <div className="toggle-knob" />
      </div>
    </label>
  );
}

