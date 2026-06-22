// @ts-nocheck
import React, { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import type { CompanionSettings, IdleAnimConfig, PetState } from "../../../shared/events";
import { defaultSettings } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import { GroupCard, Toggle } from "../../components/workbench/Primitives";
import { idleBubbleGifClass } from "../../utils/sprites";

const idleSpriteOptions: Array<{ key: string; label: string; w: number; h: number }> = [
  { key: "idle", label: "idle_bubble", w: 168, h: 160 },
  { key: "thinking", label: "thinking_speech", w: 168, h: 209 },
  { key: "tool_read", label: "headset_focus", w: 168, h: 145 },
  { key: "tool_edit", label: "working_hardhat", w: 168, h: 133 },
  { key: "waiting_permission", label: "permission_prompt", w: 168, h: 100 },
  { key: "done", label: "celebrate_bunny", w: 168, h: 208 },
  { key: "error", label: "error_dead", w: 168, h: 182 },
  { key: "skill", label: "idea_bulb", w: 480, h: 480 },
  { key: "agent", label: "welding_work", w: 480, h: 480 }
];

export function AnimationSection({ settings, updateSettings }: { settings: CompanionSettings; updateSettings: (settings: Partial<CompanionSettings>) => void }) {
  const { t } = useI18n();

  return (
    <>
      <GroupCard icon={<Sparkles size={18} />} title={t("sections.idleAnimation", "待机动画")}>
        <IdleAnimSettings config={settings.idleAnim ?? defaultSettings.idleAnim!} onChange={cfg => updateSettings({ idleAnim: cfg })} settings={settings} updateSettings={updateSettings} />
      </GroupCard>

      <GroupCard icon={<Wand2 size={18} />} title={t("sections.actionMapping", "动作映射")}>
        <StateAnimSettings stateAnimations={settings.stateAnimations ?? {}} onChange={sa => updateSettings({ stateAnimations: sa })} />
      </GroupCard>
    </>
  );
}

function IdleAnimSettings({ config, onChange, settings, updateSettings }: { config: IdleAnimConfig; onChange: (cfg: IdleAnimConfig) => void; settings: CompanionSettings; updateSettings: (s: Partial<CompanionSettings>) => void }) {
  const { t } = useI18n();
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  function toggleSprite(key: string) {
    const next = config.selectedSprites.includes(key)
      ? config.selectedSprites.filter(s => s !== key)
      : [...config.selectedSprites, key];
    onChange({ ...config, selectedSprites: next });
  }

  const formatText = (template: string, values: Record<string, string | number>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
  const companionLabels = [
    t("data.mainClawd", "主 Clawd"),
    formatText(t("data.smallClawd", "小 Clawd {index}"), { index: 1 }),
    formatText(t("data.smallClawd", "小 Clawd {index}"), { index: 2 }),
    formatText(t("data.smallClawd", "小 Clawd {index}"), { index: 3 })
  ];
  const companionAnimValues = [
    (settings as any).mainClawdIdleAnimation ?? "random",
    settings.companionIdleAnimations?.[0] ?? "thinking",
    settings.companionIdleAnimations?.[1] ?? "thinking",
    settings.companionIdleAnimations?.[2] ?? "thinking"
  ];

  function setCompanionAnim(index: number, value: string) {
    if (index === 0) {
      updateSettings({ mainClawdIdleAnimation: value } as any);
    } else {
      const next = [...(settings.companionIdleAnimations ?? ["thinking", "thinking", "thinking"])];
      next[index - 1] = value;
      updateSettings({ companionIdleAnimations: next });
    }
  }

  return (
    <div className="idle-anim-settings">
      <Toggle label={t("data.enableIdleRandom", "启用待机随机动画")} checked={config.enabled} onChange={enabled => onChange({ ...config, enabled })} />
      <div className="panel-divider" />
      <h3 className="panel-subtitle">{t("data.optionalPool", "可选动画池")}</h3>
      <div className="idle-sprite-grid">
        {idleSpriteOptions.map(opt => (
          <button
            key={opt.key}
            className={`idle-sprite-preview ${config.selectedSprites.includes(opt.key) ? "checked" : ""}`}
            onClick={() => toggleSprite(opt.key)}
          >
            <div className="sprite-preview-box">
              <span
                className={`clawd-sprite clawd-sprite-${opt.key} clawd-gif-${idleBubbleGifClass[opt.key] ?? opt.key}`}
                style={{ transform: `scale(${72 / Math.max(opt.w, opt.h)})` }}
              />
            </div>
            <span className="idle-sprite-label">{opt.label}</span>
          </button>
        ))}
      </div>
      <div className="panel-divider" />
      <RangeSlider
        label={t("data.playInterval", "播放间隔")}
        min={5}
        max={120}
        step={5}
        low={config.intervalMin}
        high={config.intervalMax}
        format={v => `${v} ${t("common.seconds", "秒")}`}
        onChange={(low, high) => onChange({ ...config, intervalMin: low, intervalMax: high })}
      />
      <div className="panel-divider" />
      <RangeSlider
        label={t("data.repeatCount", "每次播放次数")}
        min={1}
        max={5}
        step={1}
        low={config.repeatMin}
        high={config.repeatMax}
        format={v => `${v} ${t("common.times", "次")}`}
        onChange={(low, high) => onChange({ ...config, repeatMin: low, repeatMax: high })}
      />
      <div className="panel-divider" />
      <h3 className="panel-subtitle">{t("data.clawdIdleAnimations", "各 Clawd 待机动画")}</h3>
      <p className="note">{t("data.idleAnimationNote", "选择「随机」时使用上方动画池配置循环播放；选择固定动画则始终重复播放该 GIF，替代默认的静态 PNG。")}</p>
      <div className="state-anim-grid">
        {companionLabels.map((label, i) => {
          const currentValue = companionAnimValues[i];
          const isOpen = openPicker === i;
          return (
            <div key={i} className="state-anim-col">
              <span className="state-anim-col-label">{label}</span>
              <button
                className={`idle-sprite-preview ${isOpen ? "checked" : ""}`}
                onClick={() => setOpenPicker(isOpen ? null : i)}
              >
                <div className="sprite-preview-box">
                  {currentValue === "random" ? (
                    <span style={{ fontSize: 18, fontWeight: 800, color: "var(--muted)" }}>?</span>
                  ) : (
                    <span
                      className={`clawd-sprite clawd-sprite-${currentValue} clawd-gif-${idleBubbleGifClass[currentValue] ?? currentValue}`}
                      style={{ transform: `scale(${72 / Math.max(168, 168)})` }}
                    />
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
      {openPicker !== null && (
        <div className="state-anim-picker">
          <span className="state-anim-picker-title">
            {formatText(t("data.chooseIdleAnimation", "选择「{name}」的待机动画"), { name: companionLabels[openPicker] })}
            <button className="state-anim-picker-close" onClick={() => setOpenPicker(null)}>×</button>
          </span>
          <div className="state-anim-picker-grid">
            <button
              className={`idle-sprite-preview ${companionAnimValues[openPicker] === "random" ? "checked" : ""}`}
              onClick={() => { setCompanionAnim(openPicker, "random"); setOpenPicker(null); }}
            >
              <div className="sprite-preview-box">
                <span style={{ fontSize: 22, fontWeight: 800, color: "var(--muted)" }}>?</span>
              </div>
              <span className="idle-sprite-label">{t("common.random", "随机")}</span>
            </button>
            {idleSpriteOptions.map(opt => (
              <button
                key={opt.key}
                className={`idle-sprite-preview ${companionAnimValues[openPicker] === opt.key ? "checked" : ""}`}
                onClick={() => { setCompanionAnim(openPicker, opt.key); setOpenPicker(null); }}
              >
                <div className="sprite-preview-box">
                  <span
                    className={`clawd-sprite clawd-sprite-${opt.key} clawd-gif-${idleBubbleGifClass[opt.key] ?? opt.key}`}
                    style={{ transform: `scale(${72 / Math.max(opt.w, opt.h)})` }}
                  />
                </div>
                <span className="idle-sprite-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const stateAnimEntries: Array<{ state: PetState; labelKey: string; fallback: string; defaultSprite: string }> = [
  { state: "thinking", labelKey: "data.thinkingMessage", fallback: "思考 / 新消息", defaultSprite: "thinking" },
  { state: "tool_read", labelKey: "data.readFile", fallback: "读取文件", defaultSprite: "thinking" },
  { state: "tool_edit", labelKey: "data.editFile", fallback: "编辑文件", defaultSprite: "tool_edit" },
  { state: "tool_bash", labelKey: "data.runCommand", fallback: "执行命令", defaultSprite: "tool_read" },
  { state: "tool_search", labelKey: "data.searchDocs", fallback: "搜索资料", defaultSprite: "thinking" },
  { state: "tool_mcp", labelKey: "data.mcpTool", fallback: "MCP 工具", defaultSprite: "thinking" },
  { state: "skill", labelKey: "pet.skill", fallback: "技能", defaultSprite: "skill" },
  { state: "task", labelKey: "pet.task", fallback: "任务", defaultSprite: "task" },
  { state: "agent", labelKey: "data.subAgent", fallback: "子代理", defaultSprite: "agent" },
  { state: "waiting_permission", labelKey: "data.waitingConfirm", fallback: "等待确认", defaultSprite: "waiting_permission" },
  { state: "done", labelKey: "data.processDone", fallback: "处理完成", defaultSprite: "done" },
  { state: "error", labelKey: "pet.error", fallback: "错误", defaultSprite: "error" }
];

function StateAnimSettings({ stateAnimations, onChange }: { stateAnimations: Record<string, string>; onChange: (sa: Record<string, string>) => void }) {
  const { t } = useI18n();
  const formatText = (template: string, values: Record<string, string | number>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
  const [openKey, setOpenKey] = useState<string | null>(null);

  function selectSprite(state: string, sprite: string) {
    onChange({ ...stateAnimations, [state]: sprite });
    setOpenKey(null);
  }

  function resetState(state: string) {
    const next = { ...stateAnimations };
    delete next[state];
    onChange(next);
    setOpenKey(null);
  }

  return (
    <div className="state-anim-settings">
      <p className="note" style={{ marginTop: 0 }}>{t("data.actionPickerHint", "点击预览框展开选择器，再次点击其他动作自动收起。")}</p>
      <div className="state-anim-grid">
        {stateAnimEntries.map(entry => {
          const currentSprite = stateAnimations[entry.state] ?? entry.defaultSprite;
          const isOpen = openKey === entry.state;
          const opt = idleSpriteOptions.find(o => o.key === currentSprite);
          const spriteW = opt?.w ?? 168;
          const spriteH = opt?.h ?? 168;
          return (
            <div key={entry.state} className="state-anim-col">
              <span className="state-anim-col-label">{t(entry.labelKey, entry.fallback)}</span>
              <button
                className={`idle-sprite-preview ${isOpen ? "checked" : ""}`}
                onClick={() => setOpenKey(isOpen ? null : entry.state)}
              >
                <div className="sprite-preview-box">
                  <span
                    className={`clawd-sprite clawd-sprite-${currentSprite} clawd-gif-${idleBubbleGifClass[currentSprite] ?? currentSprite}`}
                    style={{ transform: `scale(${72 / Math.max(spriteW, spriteH)})` }}
                  />
                </div>
              </button>
            </div>
          );
        })}
      </div>
      {openKey && (
        <div className="state-anim-picker">
          <span className="state-anim-picker-title">
            {formatText(t("data.chooseActionAnimation", "选择「{name}」的动画"), { name: (() => { const entry = stateAnimEntries.find(e => e.state === openKey); return entry ? t(entry.labelKey, entry.fallback) : ""; })() })}
            <button className="state-anim-picker-close" onClick={() => setOpenKey(null)}>×</button>
          </span>
          <div className="state-anim-picker-grid">
            {idleSpriteOptions.map(opt => {
              const currentSprite = stateAnimations[openKey!] ?? stateAnimEntries.find(e => e.state === openKey!)!.defaultSprite;
              return (
                <button
                  key={opt.key}
                  className={`idle-sprite-preview ${currentSprite === opt.key ? "checked" : ""}`}
                  onClick={() => selectSprite(openKey!, opt.key)}
                >
                  <div className="sprite-preview-box">
                    <span
                      className={`clawd-sprite clawd-sprite-${opt.key} clawd-gif-${idleBubbleGifClass[opt.key] ?? opt.key}`}
                      style={{ transform: `scale(${72 / Math.max(opt.w, opt.h)})` }}
                    />
                  </div>
                  <span className="idle-sprite-label">{opt.label}</span>
                </button>
              );
            })}
            <button className="idle-sprite-preview reset" onClick={() => resetState(openKey!)}>
              <span className="idle-sprite-label">{t("common.resetDefault", "重置默认")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RangeSlider({ label, min, max, step, low, high, format, onChange }: {
  label: string; min: number; max: number; step: number;
  low: number; high: number; format: (v: number) => string;
  onChange: (low: number, high: number) => void;
}) {
  const range = max - min;
  const leftPercent = ((low - min) / range) * 100;
  const rightPercent = ((high - min) / range) * 100;

  return (
    <label className="range-slider-row">
      <span>{label}</span>
      <div className="range-track">
        <div className="range-fill" style={{ left: `${leftPercent}%`, width: `${rightPercent - leftPercent}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={low}
          onChange={e => { const v = Number(e.target.value); if (v <= high) onChange(v, high); }}
        />
        <input
          type="range" min={min} max={max} step={step} value={high}
          onChange={e => { const v = Number(e.target.value); if (v >= low) onChange(low, v); }}
        />
      </div>
      <b>{format(low)} — {format(high)}</b>
    </label>
  );
}
