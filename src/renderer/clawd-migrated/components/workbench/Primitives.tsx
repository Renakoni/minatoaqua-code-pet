// @ts-nocheck
import React from "react";
import { Eye, EyeOff } from "lucide-react";
import type { CompanionSettings, PrivacyMode } from "../../../shared/events";
import { useI18n } from "../../useI18n";

export function GroupCard({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="group-card">
      <header className="group-card-header">{icon}<h3>{title}</h3></header>
      {children}
    </div>
  );
}

export function StatusCard({ icon, label, value, meta, tone }: { icon: React.ReactNode; label: string; value: string; meta?: string; tone: "good" | "bad" | "wait" | "neutral" }) {
  return <article className={`status-card ${tone}`}>{icon}<span>{label}</span><strong>{value}</strong>{meta ? <small>{meta}</small> : null}</article>;
}

export function ConnectionDetail({ label, value }: { label: string; value: string }) {
  return <article className="connection-detail"><span>{label}</span><strong>{value}</strong></article>;
}

export function SettingsInfoRow({ label, value }: { label: string; value: string }) {
  return <div className="settings-info-row"><span>{label}</span><strong>{value}</strong></div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Toggle({ label, checked, onChange }: { label: React.ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      {checked ? <Eye size={17} /> : <EyeOff size={17} />}
      <span>{label}</span>
      <i />
    </button>
  );
}

export function Slider({ label, min, max, step, value, format, onChange }: { label: string; min: number; max: number; step: number; value: number; format: (value: number) => string; onChange: (value: number) => void }) {
  const fillPercent = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--slider-fill": `${fillPercent}%` } as React.CSSProperties}
        onChange={event => onChange(Number(event.target.value))}
      />
      <b>{format(value)}</b>
    </label>
  );
}

export function Segmented({ value, onChange }: { value: PrivacyMode; onChange: (value: PrivacyMode) => void }) {
  const { t } = useI18n();
  const items: Array<{ value: PrivacyMode; label: string }> = [
    { value: "safe", label: t("connection.privacySafe", "安全") },
    { value: "standard", label: t("connection.privacyStandard", "标准") },
    { value: "detailed", label: t("connection.privacyDetailed", "详细") }
  ];
  return <div className="segmented">{items.map(item => <button key={item.value} className={value === item.value ? "active" : ""} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

export function ThemeSegmented({ value, onChange }: { value: CompanionSettings["theme"]; onChange: (value: CompanionSettings["theme"]) => void }) {
  const { t } = useI18n();
  const items: Array<{ value: CompanionSettings["theme"]; label: string; icon: string }> = [
    { value: "light", label: t("settings.themeLight", "浅色"), icon: "☀" },
    { value: "system", label: t("settings.themeSystem", "桌宠"), icon: "✦" },
    { value: "dark", label: t("settings.themeDark", "夜间"), icon: "☾" }
  ];
  const activeIndex = Math.max(0, items.findIndex(item => item.value === value));

  return (
    <div className={`theme-switch theme-switch-${value}`} style={{ "--theme-index": activeIndex } as React.CSSProperties}>
      <div className="theme-switch-liquid" />
      {items.map(item => (
        <button
          key={item.value}
          className={`theme-switch-option ${value === item.value ? "active" : ""}`}
          onClick={() => onChange(item.value)}
          type="button"
        >
          <span className="theme-switch-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function LanguageSegmented({ value, onChange }: { value: CompanionSettings["language"]; onChange: (value: CompanionSettings["language"]) => void }) {
  const items: Array<{ value: CompanionSettings["language"]; label: string; icon: string }> = [
    { value: "zh", label: "中文", icon: "中" },
    { value: "en", label: "English", icon: "EN" }
  ];
  const activeIndex = Math.max(0, items.findIndex(item => item.value === value));
  return (
    <div className={`theme-switch language-switch language-switch-${value}`} style={{ "--theme-index": activeIndex } as React.CSSProperties}>
      <div className="theme-switch-liquid" />
      {items.map(item => (
        <button key={item.value} className={`theme-switch-option ${value === item.value ? "active" : ""}`} type="button" onClick={() => onChange(item.value)}>
          <span className="theme-switch-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
