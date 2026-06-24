// @ts-nocheck
import React, { useState } from "react";
import { Check, ChevronDown, Clock3, FlaskConical, Repeat2, RotateCcw, Shuffle, Sparkles, Wand2, X } from "lucide-react";
import type { CompanionSettings, IdleAnimConfig } from "../../../shared/events";
import { defaultSettings } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import { petAnimationAssets } from "../../utils/petAnimationAssets";
import { normalizeAnimationKey, normalizeAnimationKeys, petAnimationOptions, type PetAnimationKey } from "../../utils/petAnimations";

const stateAnimEntries: Array<{ key: string; labelKey: string; fallback: string; meta: string; defaultAnimation: PetAnimationKey }> = [
  { key: "running", labelKey: "animation.state.running", fallback: "正在运行", meta: "读取、编辑、执行、搜索、技能、子代理、错误", defaultAnimation: "running" },
  { key: "waiting_permission", labelKey: "animation.state.permission", fallback: "权限请求", meta: "权限等待、通知确认", defaultAnimation: "waiting_permission" },
  { key: "done", labelKey: "animation.state.done", fallback: "运行完成", meta: "任务完成、停止事件", defaultAnimation: "done" }
];

export function AnimationSection({ settings, updateSettings }: { settings: CompanionSettings; updateSettings: (settings: Partial<CompanionSettings>) => void }) {
  const { t } = useI18n();

  return (
    <div className="animation-page animation-workbench">
      <AnimationPanel icon={<Sparkles size={17} />} title={t("sections.idleAnimation", "待机动画")} meta="Aqua 动作库">
        <IdleAnimSettings config={settings.idleAnim ?? defaultSettings.idleAnim!} onChange={cfg => updateSettings({ idleAnim: cfg })} />
      </AnimationPanel>

      <div className="animation-page-secondary">
        <AnimationPanel icon={<Wand2 size={17} />} title={t("sections.actionMapping", "动作映射")}>
          <StateAnimSettings stateAnimations={settings.stateAnimations ?? {}} onChange={sa => updateSettings({ stateAnimations: sa })} />
        </AnimationPanel>

        <AnimationPanel icon={<FlaskConical size={17} />} title={t("sections.animationTest", "动画测试")}>
          <AnimationTestBlock />
        </AnimationPanel>
      </div>
    </div>
  );
}

function AnimationPanel({ icon, title, meta, children }: { icon?: React.ReactNode; title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="animation-panel">
      <header className="animation-panel-header">
        <div className="animation-panel-title">
          {icon ? <span className="animation-panel-icon">{icon}</span> : null}
          <h3>{title}</h3>
        </div>
        {meta ? <span className="animation-panel-meta">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}

function IdleAnimSettings({ config, onChange }: { config: IdleAnimConfig; onChange: (cfg: IdleAnimConfig) => void }) {
  const { t } = useI18n();
  const selectedSprites = normalizeAnimationKeys(config.selectedSprites, petAnimationOptions.map(option => option.key));

  function toggleSprite(key: PetAnimationKey) {
    const next = selectedSprites.includes(key)
      ? selectedSprites.filter(sprite => sprite !== key)
      : [...selectedSprites, key];
    onChange({ ...config, selectedSprites: next });
  }

  return (
    <div className="idle-anim-settings">
      <section className="animation-master-row">
        <div className="animation-master-copy">
          <strong>{t("data.enableIdleRandom", "启用待机随机动画")}</strong>
          <span>{config.enabled ? t("animation.randomEnabled", "从动画池中轮换播放") : t("animation.randomDisabled", "保持固定待机表现")}</span>
        </div>
        <SwitchButton checked={config.enabled} onChange={enabled => onChange({ ...config, enabled })} label={t("data.enableIdleRandom", "启用待机随机动画")} />
      </section>

      <div className="animation-summary-row">
        <AnimationStat label={t("animation.pool", "动画池")} value={`${selectedSprites.length}/${petAnimationOptions.length}`} />
        <AnimationStat icon={<Clock3 size={14} />} label={t("data.playInterval", "播放间隔")} value={formatRange(config.intervalMin, config.intervalMax, value => `${value}s`)} />
        <AnimationStat icon={<Repeat2 size={14} />} label={t("data.repeatCount", "每次播放")} value={formatRange(config.repeatMin, config.repeatMax, value => `${value}x`)} />
      </div>

      <section className="animation-section-block">
        <SectionHead title={t("data.optionalPool", "可选动画池")} meta={t("animation.selectedCount", "已选 {count}").replace("{count}", String(selectedSprites.length))} />
        <div className="idle-sprite-grid">
          {petAnimationOptions.map(option => (
            <SpriteOptionButton
              key={option.key}
              spriteKey={option.key}
              label={spriteLabel(t, option.key)}
              selected={selectedSprites.includes(option.key)}
              onClick={() => toggleSprite(option.key)}
            />
          ))}
        </div>
      </section>

      <section className="animation-section-block animation-ranges">
        <RangeSlider
          label={t("data.playInterval", "播放间隔")}
          min={5}
          max={120}
          step={5}
          low={config.intervalMin}
          high={config.intervalMax}
          format={value => `${value} ${t("common.seconds", "秒")}`}
          onChange={(low, high) => onChange({ ...config, intervalMin: low, intervalMax: high })}
        />
        <RangeSlider
          label={t("data.repeatCount", "每次播放次数")}
          min={1}
          max={5}
          step={1}
          low={config.repeatMin}
          high={config.repeatMax}
          format={value => `${value} ${t("common.times", "次")}`}
          onChange={(low, high) => onChange({ ...config, repeatMin: low, repeatMax: high })}
        />
      </section>
    </div>
  );
}

function StateAnimSettings({ stateAnimations, onChange }: { stateAnimations: Record<string, string>; onChange: (sa: Record<string, string>) => void }) {
  const { t } = useI18n();
  const formatText = (template: string, values: Record<string, string | number>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
  const [openKey, setOpenKey] = useState<string | null>(null);

  function selectSprite(state: string, sprite: string) {
    onChange({ ...stateAnimations, [state]: normalizeAnimationKey(sprite, "running") });
    setOpenKey(null);
  }

  function resetState(state: string) {
    const next = { ...stateAnimations };
    delete next[state];
    onChange(next);
    setOpenKey(null);
  }

  const openEntry = openKey ? stateAnimEntries.find(entry => entry.key === openKey) : null;

  return (
    <div className="state-anim-settings">
      <div className="state-anim-list">
        {stateAnimEntries.map(entry => {
          const currentSprite = normalizeAnimationKey(stateAnimations[entry.key], entry.defaultAnimation);
          const isOpen = openKey === entry.key;
          return (
            <div key={entry.key} className="state-anim-row">
              <div className="state-anim-meta">
                <strong>{t(entry.labelKey, entry.fallback)}</strong>
                <span>{entry.meta}</span>
              </div>
              <AssignmentButton
                spriteKey={currentSprite}
                label={spriteLabel(t, currentSprite)}
                open={isOpen}
                onClick={() => setOpenKey(isOpen ? null : entry.key)}
              />
            </div>
          );
        })}
      </div>
      {openKey && openEntry && (
        <SpritePicker
          title={formatText(t("data.chooseActionAnimation", "选择「{name}」的动画"), { name: t(openEntry.labelKey, openEntry.fallback) })}
          currentSprite={normalizeAnimationKey(stateAnimations[openKey], openEntry.defaultAnimation)}
          onSelect={sprite => selectSprite(openKey, sprite)}
          onReset={() => resetState(openKey)}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}

function AnimationTestBlock() {
  const { t } = useI18n();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  function previewAnimation(key: PetAnimationKey) {
    setActiveKey(key);
    void window.companion.previewPetAnimation(key);
  }

  function stopPreview() {
    setActiveKey(null);
    void window.companion.previewPetAnimation("__clear_preview");
  }

  return (
    <div className="animation-test-settings">
      <section className="animation-section-block">
        <SectionHead title={t("animation.testBlock", "点击测试姿势")} meta={t("animation.temporaryPreview", "临时预览")} />
        <div className="idle-sprite-grid animation-test-grid">
          {petAnimationOptions.map(option => (
            <SpriteOptionButton
              key={option.key}
              spriteKey={option.key}
              label={spriteLabel(t, option.key)}
              selected={activeKey === option.key}
              onClick={() => previewAnimation(option.key)}
            />
          ))}
        </div>
        <div className="animation-test-actions">
          <button type="button" className="animation-test-stop" onClick={stopPreview} disabled={!activeKey}>{t("animation.stopTest", "停止测试")}</button>
        </div>
      </section>
    </div>
  );
}

function SwitchButton({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" className={`animation-switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span className="animation-switch-track"><span className="animation-switch-knob" /></span>
    </button>
  );
}

function AnimationStat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="animation-stat">
      {icon ? <span className="animation-stat-icon">{icon}</span> : null}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <header className="animation-section-head">
      <h3 className="panel-subtitle">{title}</h3>
      {meta ? <span>{meta}</span> : null}
    </header>
  );
}

function AssignmentButton({ spriteKey, label, open, onClick }: { spriteKey: string; label: string; open: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`animation-assignment-button ${open ? "open" : ""}`} onClick={onClick} title={label}>
      <SpriteFigure spriteKey={spriteKey} />
      <span>{label}</span>
      <ChevronDown size={15} />
    </button>
  );
}

function SpritePicker({ title, currentSprite, includeRandom, onSelect, onReset, onClose }: {
  title: string;
  currentSprite: string;
  includeRandom?: boolean;
  onSelect: (sprite: string) => void;
  onReset?: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const normalizedCurrent = currentSprite === "random" ? "random" : normalizeAnimationKey(currentSprite, "running");

  return (
    <div className="state-anim-picker">
      <div className="state-anim-picker-title">
        <span>{title}</span>
        <button type="button" className="state-anim-picker-close" onClick={onClose} aria-label={t("common.close", "关闭")}><X size={16} /></button>
      </div>
      <div className="state-anim-picker-grid">
        {includeRandom ? (
          <SpriteOptionButton
            spriteKey="random"
            label={t("common.random", "随机")}
            selected={normalizedCurrent === "random"}
            onClick={() => onSelect("random")}
          />
        ) : null}
        {petAnimationOptions.map(option => (
          <SpriteOptionButton
            key={option.key}
            spriteKey={option.key}
            label={spriteLabel(t, option.key)}
            selected={normalizedCurrent === option.key}
            onClick={() => onSelect(option.key)}
          />
        ))}
        {onReset ? (
          <button type="button" className="idle-sprite-preview reset" onClick={onReset}>
            <span className="sprite-reset-mark"><RotateCcw size={18} /></span>
            <span className="idle-sprite-label">{t("common.resetDefault", "重置默认")}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SpriteOptionButton({ spriteKey, label, selected, onClick }: { spriteKey: string; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`idle-sprite-preview ${selected ? "checked" : ""}`} onClick={onClick} aria-pressed={selected} title={label}>
      <SpriteFigure spriteKey={spriteKey} />
      <span className="idle-sprite-label">{label}</span>
      {selected ? <span className="sprite-selected-mark"><Check size={12} /></span> : null}
    </button>
  );
}

function SpriteFigure({ spriteKey }: { spriteKey: string }) {
  if (spriteKey === "random") {
    return (
      <span className="sprite-preview-box random">
        <Shuffle size={22} />
      </span>
    );
  }

  const key = normalizeAnimationKey(spriteKey, "running");

  return (
    <span className="sprite-preview-box">
      <img className="sprite-preview-image" src={petAnimationAssets[key]} alt="" draggable={false} />
    </span>
  );
}

function RangeSlider({ label, min, max, step, low, high, format, onChange }: {
  label: string; min: number; max: number; step: number;
  low: number; high: number; format: (value: number) => string;
  onChange: (low: number, high: number) => void;
}) {
  const range = max - min;
  const leftPercent = ((low - min) / range) * 100;
  const rightPercent = ((high - min) / range) * 100;

  return (
    <label className="range-slider-row">
      <span className="range-slider-copy">
        <span>{label}</span>
        <b>{format(low)} - {format(high)}</b>
      </span>
      <div className="range-track" style={{ "--range-left": `${leftPercent}%`, "--range-width": `${rightPercent - leftPercent}%` } as React.CSSProperties}>
        <div className="range-fill" />
        <input
          type="range" min={min} max={max} step={step} value={low}
          onChange={event => { const value = Number(event.target.value); if (value <= high) onChange(value, high); }}
        />
        <input
          type="range" min={min} max={max} step={step} value={high}
          onChange={event => { const value = Number(event.target.value); if (value >= low) onChange(low, value); }}
        />
      </div>
    </label>
  );
}

function spriteLabel(t: (key: string, fallback?: string) => string, key: string) {
  if (key === "random") return t("common.random", "随机");
  const normalized = normalizeAnimationKey(key, "running");
  const option = petAnimationOptions.find(item => item.key === normalized);
  return option ? t(option.labelKey, option.fallback) : key;
}

function formatRange(low: number, high: number, format: (value: number) => string) {
  return `${format(low)} - ${format(high)}`;
}
