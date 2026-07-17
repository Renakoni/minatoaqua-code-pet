import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, ChevronRight, Eye, EyeOff, Gauge, Plus, Save } from "lucide-react";
import { useI18n } from "../../useI18n";
import type { ClaudeProviderTestResult } from "../../../shared/events";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconPicker } from "./IconPicker";
import { ProviderIcon } from "./ProviderIcon";
import { getIconMetadata } from "./icons/metadata";
import { addIconsToPresets } from "./iconInference";
import { claudeProviderPresets, type ClaudeProviderPreset } from "./presets";
import type { ClaudeProvider } from "./types";

const presetsWithIcons = addIconsToPresets(claudeProviderPresets);
const JsonConfigEditor = lazy(() => import("./JsonConfigEditor").then(module => ({ default: module.JsonConfigEditor })));

type SettingsConfig = ClaudeProvider["settingsConfig"];

const AUTH_FIELDS = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"] as const;
type AuthField = (typeof AUTH_FIELDS)[number];

const MODEL_ROLES = [
  { role: "Sonnet", envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL" },
  { role: "Opus", envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL" },
  { role: "Fable", envKey: "ANTHROPIC_DEFAULT_FABLE_MODEL" },
  { role: "Haiku", envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL" }
] as const;

function parseConfig(text: string): SettingsConfig | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as SettingsConfig : null;
  } catch {
    return null;
  }
}

function serializeConfig(config: SettingsConfig): string {
  return JSON.stringify(config, null, 2);
}

function envOf(config: SettingsConfig | null): Record<string, string> {
  const env = config?.env;
  return env && typeof env === "object" ? env as Record<string, string> : {};
}

function substituteTemplate(text: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`\${${key}}`).join(value),
    text
  );
}

function isValidHttpEndpoint(value: string) {
  if (/\$\{[^}]+\}/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

// The preset grid is the heaviest part of the form: ~60 buttons, each with a
// ProviderIcon that parses an inline SVG. cc-switch keeps this in its own
// ProviderPresetSelector with search/sort state held locally so typing in the
// provider fields never touches it. We mirror that: search/sort/filtering live
// here, and the component is memoized on { activeIndex, onSelect } — both stable
// while editing other fields — so a keystroke in API Key / Base URL / model
// inputs no longer reconciles the grid.
type PresetGridProps = {
  activeIndex: number | "custom";
  onSelect: (index: number | "custom") => void;
};

const PresetGrid = memo(function PresetGrid({ activeIndex, onSelect }: PresetGridProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [sorted, setSorted] = useState(false);

  const visiblePresets = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = presetsWithIcons.map((preset, index) => ({ preset, index }));
    if (query) list = list.filter(({ preset }) => preset.name.toLowerCase().includes(query));
    if (sorted) list = [...list].sort((a, b) => a.preset.name.localeCompare(b.preset.name, "zh-CN"));
    return list;
  }, [search, sorted]);

  return (
    <section className="ccs-form-card">
      <div className="ccs-preset-head">
        <span className="ccs-field-label">{t("routing.presetLabel", "预设供应商")}</span>
        <div className="ccs-preset-tools">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t("routing.presetSearch", "搜索预设…")}
            aria-label={t("routing.presetSearch", "搜索预设…")}
          />
          <button
            type="button"
            className={sorted ? "active" : ""}
            onClick={() => setSorted(current => !current)}
            title={t("routing.presetSort", "按名称排序")}
          >A-Z</button>
        </div>
      </div>
      <div className="ccs-preset-grid">
        <button
          type="button"
          className={`ccs-preset-item ${activeIndex === "custom" ? "active" : ""}`}
          onClick={() => onSelect("custom")}
        >{t("routing.presetCustom", "自定义")}</button>
        {visiblePresets.map(({ preset, index }) => (
          <button
            key={`${preset.name}-${index}`}
            type="button"
            className={`ccs-preset-item ${activeIndex === index ? "active" : ""}`}
            onClick={() => onSelect(index)}
            title={preset.websiteUrl}
          >
            <ProviderIcon icon={preset.icon} name={preset.name} color={preset.iconColor} size={16} />
            <span>{preset.name}</span>
            {preset.isPartner ? <em title={t("routing.presetPartner", "合作伙伴")}>★</em> : null}
          </button>
        ))}
      </div>
    </section>
  );
});

type ProviderEditPanelProps = {
  provider: ClaudeProvider;
  mode: "add" | "edit";
  visible?: boolean;
  hasCommonConfig?: boolean;
  onSave: (provider: ClaudeProvider, originalId?: string) => void;
  onClose: () => void;
  onTestEndpoint?: (baseUrl: string) => Promise<ClaudeProviderTestResult>;
};

type ProviderEditPanelContentProps = Omit<ProviderEditPanelProps, "visible">;

const ProviderEditPanelContent = memo(function ProviderEditPanelContent({
  provider,
  mode,
  hasCommonConfig,
  onSave,
  onClose,
  onTestEndpoint
}: ProviderEditPanelContentProps) {
  const { t } = useI18n();

  const [name, setName] = useState(provider.name);
  const [notes, setNotes] = useState(provider.notes ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(provider.websiteUrl ?? "");
  const [apiKeyUrl, setApiKeyUrl] = useState("");
  const [category, setCategory] = useState<string>(provider.category ?? "custom");
  const [iconColor, setIconColor] = useState(provider.iconColor ?? "");
  const [icon, setIcon] = useState(provider.icon);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [configText, setConfigText] = useState(serializeConfig(provider.settingsConfig ?? { env: {} }));
  const [apiFormat, setApiFormat] = useState<string>(String(provider.meta?.apiFormat ?? "anthropic"));
  const [apiKeyField, setApiKeyField] = useState<AuthField>(
    provider.meta?.apiKeyField === "ANTHROPIC_API_KEY" ? "ANTHROPIC_API_KEY" : "ANTHROPIC_AUTH_TOKEN"
  );
  const [customUserAgent, setCustomUserAgent] = useState(String(provider.meta?.customUserAgent ?? ""));
  const [commonConfigEnabled, setCommonConfigEnabled] = useState(provider.meta?.commonConfigEnabled === true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showRawConfig, setShowRawConfig] = useState(false);
  const [presetIndex, setPresetIndex] = useState<number | "custom">("custom");
  const [templateBase, setTemplateBase] = useState<string | null>(null);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [endpointCandidates, setEndpointCandidates] = useState<string[]>([]);
  const [endpointResults, setEndpointResults] = useState<Record<string, ClaudeProviderTestResult | "testing">>({});
  const [softIssues, setSoftIssues] = useState<string[] | null>(null);
  const [hardError, setHardError] = useState<string | null>(null);

  const activePreset: ClaudeProviderPreset | null = presetIndex === "custom" ? null : presetsWithIcons[presetIndex] ?? null;
  const parsedConfig = useMemo(() => parseConfig(configText), [configText]);
  const configInvalid = parsedConfig === null;
  const env = envOf(parsedConfig);
  const baseUrl = env.ANTHROPIC_BASE_URL ?? "";
  const apiKey = env[apiKeyField] ?? "";
  const isOfficial = category === "official";

  function updateConfig(mutate: (config: SettingsConfig) => void) {
    if (!parsedConfig) return;
    const next = JSON.parse(JSON.stringify(parsedConfig)) as SettingsConfig;
    mutate(next);
    setConfigText(serializeConfig(next));
  }

  function setEnvValue(key: string, value: string) {
    updateConfig(config => {
      const envBlock = (config.env && typeof config.env === "object" ? config.env : {}) as Record<string, string>;
      if (value) envBlock[key] = value;
      else delete envBlock[key];
      config.env = envBlock;
    });
  }

  function handleAuthFieldChange(nextField: AuthField) {
    if (nextField === apiKeyField) return;
    const currentKey = apiKey;
    updateConfig(config => {
      const envBlock = (config.env && typeof config.env === "object" ? config.env : {}) as Record<string, string>;
      delete envBlock[apiKeyField];
      if (currentKey) envBlock[nextField] = currentKey;
      config.env = envBlock;
    });
    setApiKeyField(nextField);
  }

  // Stable identity so the memoized PresetGrid doesn't re-render when unrelated
  // form fields change — it only closes over stable setters and module data.
  const applyPreset = useCallback((index: number | "custom") => {
    setPresetIndex(index);
    setEndpointResults({});
    if (index === "custom") {
      setTemplateBase(null);
      setTemplateValues({});
      setEndpointCandidates([]);
      return;
    }
    const preset = presetsWithIcons[index];
    if (!preset) return;
    setName(preset.name);
    setWebsiteUrl(preset.websiteUrl ?? "");
    setApiKeyUrl(preset.apiKeyUrl ?? "");
    setCategory(preset.category ?? (preset.isOfficial ? "official" : "third_party"));
    if (preset.iconColor) setIconColor(preset.iconColor);
    if (preset.icon) setIcon(preset.icon);
    setApiFormat(preset.apiFormat ?? "anthropic");
    setApiKeyField(preset.apiKeyField === "ANTHROPIC_API_KEY" ? "ANTHROPIC_API_KEY" : "ANTHROPIC_AUTH_TOKEN");
    setEndpointCandidates(preset.endpointCandidates ?? []);
    const baseText = serializeConfig(preset.settingsConfig ?? { env: {} });
    if (preset.templateValues && Object.keys(preset.templateValues).length > 0) {
      const defaults = Object.fromEntries(
        Object.entries(preset.templateValues).map(([key, config]) => [key, config.defaultValue ?? ""])
      );
      setTemplateBase(baseText);
      setTemplateValues(defaults);
      setConfigText(substituteTemplate(baseText, defaults));
    } else {
      setTemplateBase(null);
      setTemplateValues({});
      setConfigText(baseText);
    }
  }, []);

  function handleTemplateValue(key: string, value: string) {
    const nextValues = { ...templateValues, [key]: value };
    setTemplateValues(nextValues);
    if (templateBase) setConfigText(substituteTemplate(templateBase, nextValues));
  }

  async function testEndpoint(url: string) {
    if (!onTestEndpoint || !url) return;
    setEndpointResults(current => ({ ...current, [url]: "testing" }));
    const result = await onTestEndpoint(url);
    setEndpointResults(current => ({ ...current, [url]: result }));
  }

  function buildProviderRecord(): ClaudeProvider {
    const settingsConfig = parseConfig(configText) ?? { env: {} };
    const meta: ClaudeProvider["meta"] = { ...(provider.meta ?? {}) };
    if (apiFormat && apiFormat !== "anthropic") meta.apiFormat = apiFormat;
    else delete meta.apiFormat;
    if (apiKeyField !== "ANTHROPIC_AUTH_TOKEN") meta.apiKeyField = apiKeyField;
    else delete meta.apiKeyField;
    if (customUserAgent.trim()) meta.customUserAgent = customUserAgent.trim();
    else delete meta.customUserAgent;
    if (hasCommonConfig) meta.commonConfigEnabled = commonConfigEnabled;
    return {
      ...provider,
      id: mode === "edit" ? provider.id : "",
      name: name.trim(),
      notes: notes.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      category,
      icon,
      iconColor: iconColor || undefined,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
      settingsConfig
    };
  }

  function collectSoftIssues(): string[] {
    const issues: string[] = [];
    if (!isOfficial && !baseUrl.trim()) issues.push(t("routing.issueNoEndpoint", "未填写请求地址（ANTHROPIC_BASE_URL）"));
    if (!isOfficial && !apiKey.trim()) issues.push(t("routing.issueNoApiKey", "未填写 API Key"));
    const unfilled = Object.entries(templateValues).filter(([, value]) => !value.trim());
    if (templateBase && unfilled.length > 0) {
      issues.push(`${t("routing.issueTemplateUnfilled", "参数未填写")}: ${unfilled.map(([key]) => key).join(", ")}`);
    }
    return issues;
  }

  function submit(force = false) {
    setHardError(null);
    if (!name.trim()) {
      setHardError(t("routing.nameRequired", "请填写供应商名称"));
      return;
    }
    if (parseConfig(configText) === null) {
      setHardError(t("routing.configInvalid", "配置不是合法的 JSON 对象"));
      return;
    }
    if (baseUrl.trim() && !isValidHttpEndpoint(baseUrl.trim())) {
      setHardError(t("routing.endpointInvalid", "请求地址必须是有效的 HTTP(S) URL，且不能包含未填写的模板参数"));
      return;
    }
    if (!force) {
      const issues = collectSoftIssues();
      if (issues.length > 0) {
        setSoftIssues(issues);
        return;
      }
    }
    onSave(buildProviderRecord(), mode === "edit" ? provider.id : undefined);
  }

  const apiKeyPlaceholder = isOfficial
    ? t("routing.officialNoApiKey", "官方供应商无需 API Key，直接保存即可")
    : t("routing.apiKeyAutoFill", "只需要填这里，下方配置会自动填充");

  const endpointHint = apiFormat === "openai_chat"
    ? t("routing.endpointHintOpenaiChat", "💡 填写兼容 OpenAI Chat Completions 的服务端点地址，不要以斜杠结尾")
    : apiFormat === "openai_responses"
      ? t("routing.endpointHintOpenaiResponses", "💡 填写兼容 OpenAI Responses API 的服务端点地址，不要以斜杠结尾")
      : t("routing.endpointHintAnthropic", "💡 填写兼容 Claude API 的服务端点地址，不要以斜杠结尾");

  const advancedActive = apiFormat !== "anthropic"
    || apiKeyField !== "ANTHROPIC_AUTH_TOKEN"
    || Boolean(customUserAgent.trim())
    || MODEL_ROLES.some(({ envKey }) => Boolean(env[envKey]))
    || Boolean(env.ANTHROPIC_MODEL)
    || commonConfigEnabled;
  const [advancedOpen, setAdvancedOpen] = useState(advancedActive);

  // Portal to <body>: ancestors with backdrop-filter/transform would otherwise
  // trap position:fixed and the footer could scroll out of view.
  const formId = mode === "add" ? "claude-provider-add-form" : "claude-provider-edit-form";

  return (
    <>
      <header className="ccs-fullscreen-header">
        <button className="ccs-back-button" type="button" onClick={onClose} aria-label={t("common.back", "返回")} title={t("common.back", "返回")}><ArrowLeft size={18} /></button>
        <div className="ccs-fullscreen-title">
          <h2>{mode === "edit" ? t("routing.editProvider", "编辑供应商") : t("routing.addProvider", "添加供应商")}</h2>
          <span>Claude Code</span>
        </div>
      </header>

      <main className="ccs-fullscreen-body">
        <form
          id={formId}
          className="ccs-provider-form"
          onSubmit={event => { event.preventDefault(); submit(); }}
        >
          {mode === "add" ? (
            <PresetGrid activeIndex={presetIndex} onSelect={applyPreset} />
          ) : null}

          <section className="ccs-form-card">
            <div className="ccs-icon-block">
              <button
                type="button"
                onClick={() => setIconPickerOpen(true)}
                title={icon ? t("routing.iconClickToChange", "点击更换图标") : t("routing.iconClickToSelect", "点击选择图标")}
                aria-label={t("routing.iconPickerTitle", "选择图标")}
              >
                <ProviderIcon icon={icon} name={name || "Provider"} color={iconColor} size={48} />
              </button>
            </div>
            <div className="ccs-form-grid two">
              <label>
                <span>{t("routing.providerName", "供应商名称")}</span>
                <input value={name} onChange={event => setName(event.target.value)} placeholder={t("routing.namePlaceholder", "例如：Claude 官方")} />
              </label>
              <label>
                <span>{t("routing.notes", "备注")}</span>
                <input value={notes} onChange={event => setNotes(event.target.value)} placeholder={t("routing.notesPlaceholder", "例如：公司专用账号")} />
              </label>
            </div>
            <label>
              <span>{t("routing.websiteUrl", "官网链接")}</span>
              <input value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder={t("routing.websitePlaceholder", "https://example.com（可选）")} />
            </label>
          </section>

          {templateBase && activePreset?.templateValues ? (
            <section className="ccs-form-card">
              <div className="ccs-form-section-heading">
                <div>
                  <h3>{`${t("routing.templateConfig", "参数配置")} - ${activePreset.name} *`}</h3>
                </div>
              </div>
              <div className="ccs-form-grid two">
                {Object.entries(activePreset.templateValues).map(([key, config]) => (
                  <label key={key}>
                    <span>{config.label || key}</span>
                    <input
                      value={templateValues[key] ?? ""}
                      onChange={event => handleTemplateValue(key, event.target.value)}
                      placeholder={config.placeholder}
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          <section className="ccs-form-card">
            <div className="ccs-form-grid">
              <label>
                <span>API Key{isOfficial ? "" : " *"}</span>
                <div className="ccs-apikey-row">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    disabled={configInvalid}
                    onChange={event => setEnvValue(apiKeyField, event.target.value)}
                    placeholder={apiKeyPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {apiKey ? (
                    <button
                      type="button"
                      className="ccs-apikey-toggle"
                      onClick={() => setShowApiKey(current => !current)}
                      title={showApiKey ? t("routing.hideApiKey", "隐藏 API Key") : t("routing.showApiKey", "显示 API Key")}
                      aria-label={showApiKey ? t("routing.hideApiKey", "隐藏 API Key") : t("routing.showApiKey", "显示 API Key")}
                    >{showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  ) : null}
                </div>
                {(apiKeyUrl || websiteUrl) && !isOfficial ? (
                  <button
                    type="button"
                    className="ccs-getkey-link"
                    onClick={() => window.companion.openExternal(apiKeyUrl || websiteUrl)}
                  >{t("routing.getApiKey", "获取 API Key")}</button>
                ) : null}
              </label>

              <label>
                <span>{t("routing.apiEndpoint", "请求地址")}</span>
                <input
                  value={baseUrl}
                  disabled={configInvalid}
                  onChange={event => setEnvValue("ANTHROPIC_BASE_URL", event.target.value)}
                  placeholder="https://your-api-endpoint.com"
                  spellCheck={false}
                />
                <small className="ccs-field-hint">{endpointHint}</small>
              </label>

              {endpointCandidates.length > 0 ? (
                <div className="ccs-endpoint-candidates">
                  <span className="ccs-field-label">{t("routing.endpointCandidates", "可选线路")}</span>
                  {endpointCandidates.map(candidate => {
                    const result = endpointResults[candidate];
                    return (
                      <div key={candidate} className={`ccs-endpoint-row ${baseUrl === candidate ? "active" : ""}`}>
                        <button type="button" className="ccs-endpoint-url" onClick={() => setEnvValue("ANTHROPIC_BASE_URL", candidate)} title={candidate}>{candidate}</button>
                        <span className="ccs-endpoint-latency">
                          {result === "testing"
                            ? t("routing.testing", "测速中…")
                            : result
                              ? result.success ? `${result.responseTimeMs} ms` : t("routing.unreachable", "不可达")
                              : ""}
                        </span>
                        <button type="button" className="ccs-endpoint-test" onClick={() => void testEndpoint(candidate)} disabled={result === "testing"}>
                          <Gauge size={13} />{t("routing.speedTest", "测速")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>

          <section className="ccs-form-card">
            <button type="button" className="ccs-advanced-toggle" onClick={() => setAdvancedOpen(current => !current)} aria-expanded={advancedOpen}>
              {advancedOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <span>{t("routing.advancedOptions", "高级选项")}</span>
            </button>
            {advancedOpen ? (
              <div className="ccs-advanced-body">
                <div className="ccs-form-grid two">
                  <label>
                    <span>{t("routing.apiFormat", "API 格式")}</span>
                    <select value={apiFormat} onChange={event => setApiFormat(event.target.value)}>
                      <option value="anthropic">{t("routing.apiFormatAnthropic", "Anthropic Messages（原生）")}</option>
                      <option value="openai_chat">{t("routing.apiFormatOpenaiChat", "OpenAI Chat Completions（需网关转换）")}</option>
                      <option value="openai_responses">{t("routing.apiFormatOpenaiResponses", "OpenAI Responses API（需网关转换）")}</option>
                      <option value="gemini_native">{t("routing.apiFormatGemini", "Gemini Native generateContent（需网关转换）")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("routing.authField", "认证字段")}</span>
                    <select value={apiKeyField} onChange={event => handleAuthFieldChange(event.target.value as AuthField)}>
                      <option value="ANTHROPIC_AUTH_TOKEN">ANTHROPIC_AUTH_TOKEN（{t("routing.default", "默认")}）</option>
                      <option value="ANTHROPIC_API_KEY">ANTHROPIC_API_KEY</option>
                    </select>
                    <small className="ccs-field-hint">{t("routing.authFieldHint", "选择写入配置的认证环境变量名")}</small>
                  </label>
                </div>

                <div className="ccs-model-mapping">
                  <div className="ccs-model-mapping-head">
                    <span className="ccs-field-label">{t("routing.modelMapping", "模型映射")}</span>
                    <button
                      type="button"
                      className="ccs-model-quickset"
                      disabled={configInvalid}
                      onClick={() => {
                        const seed = MODEL_ROLES.map(({ envKey }) => env[envKey]).find(Boolean) || env.ANTHROPIC_MODEL || "";
                        if (!seed) return;
                        updateConfig(config => {
                          const envBlock = (config.env && typeof config.env === "object" ? config.env : {}) as Record<string, string>;
                          for (const { envKey } of MODEL_ROLES) {
                            if (!envBlock[envKey]) envBlock[envKey] = seed;
                          }
                          config.env = envBlock;
                        });
                      }}
                    >{t("routing.quickSetModels", "一键填充")}</button>
                  </div>
                  <div className="ccs-model-grid">
                    {MODEL_ROLES.map(({ role, envKey }) => (
                      <label key={envKey}>
                        <span>{role}</span>
                        <input
                          value={env[envKey] ?? ""}
                          disabled={configInvalid}
                          onChange={event => setEnvValue(envKey, event.target.value)}
                          placeholder={t("routing.modelPlaceholder", "实际请求模型，可留空")}
                          spellCheck={false}
                        />
                      </label>
                    ))}
                    <label>
                      <span>{t("routing.fallbackModel", "默认兜底模型")}</span>
                      <input
                        value={env.ANTHROPIC_MODEL ?? ""}
                        disabled={configInvalid}
                        onChange={event => setEnvValue("ANTHROPIC_MODEL", event.target.value)}
                        placeholder={t("routing.fallbackModelPlaceholder", "未命中角色映射时使用")}
                        spellCheck={false}
                      />
                    </label>
                  </div>
                  <small className="ccs-field-hint">{t("routing.modelMappingHint", "写入 ANTHROPIC_DEFAULT_*_MODEL / ANTHROPIC_MODEL 环境变量")}</small>
                </div>

                <div className="ccs-form-grid two">
                  <label>
                    <span>{t("routing.customUserAgent", "自定义 User-Agent")}</span>
                    <input value={customUserAgent} onChange={event => setCustomUserAgent(event.target.value)} placeholder={t("routing.optional", "可选")} spellCheck={false} />
                  </label>
                  {hasCommonConfig ? (
                    <label className="ccs-inline-check">
                      <span>{t("routing.commonConfig", "公共配置片段")}</span>
                      <span className="ccs-inline-check-row">
                        <input type="checkbox" checked={commonConfigEnabled} onChange={event => setCommonConfigEnabled(event.target.checked)} />
                        <em>{t("routing.commonConfigHint", "切换时合并 cc-switch 的公共配置")}</em>
                      </span>
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <section className="ccs-form-card">
            <div className="ccs-form-section-heading">
              <div>
                <h3>{t("routing.configLabel", "配置（settings.json）")}</h3>
                <p>{t("routing.configDesc", "切换到此供应商时写入 ~/.claude/settings.json 的完整内容")}</p>
              </div>
              <button
                type="button"
                className="ccs-config-visibility-toggle"
                onClick={() => setShowRawConfig(current => !current)}
                title={showRawConfig ? t("routing.hideConfig", "隐藏配置") : t("routing.showConfig", "显示配置")}
                aria-label={showRawConfig ? t("routing.hideConfig", "隐藏配置") : t("routing.showConfig", "显示配置")}
                aria-pressed={showRawConfig}
              >{showRawConfig ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
            {showRawConfig ? (
              <Suspense fallback={<div className="ccs-json-editor ccs-json-editor-loading" aria-hidden="true" />}>
                <JsonConfigEditor value={configText} onChange={setConfigText} ariaLabel={t("routing.configLabel", "配置（settings.json）")} />
              </Suspense>
            ) : null}
            {configInvalid ? <small className="ccs-field-error">{t("routing.configInvalid", "配置不是合法的 JSON 对象")}</small> : null}
          </section>
        </form>
      </main>

      <footer className="ccs-fullscreen-footer">
        {hardError ? <span className="ccs-form-error">{hardError}</span> : null}
        <button className="ccs-panel-cancel" type="button" onClick={onClose}>{t("common.cancel", "取消")}</button>
        <button className="ccs-save-button" type="submit" form={formId}>
          {mode === "edit" ? <Save size={16} /> : <Plus size={16} />}
          {mode === "edit" ? t("common.save", "保存") : t("common.add", "添加")}
        </button>
      </footer>

      {iconPickerOpen ? (
        <IconPicker
          value={icon}
          onSelect={nextIcon => {
            setIcon(nextIcon);
            setIconColor(getIconMetadata(nextIcon)?.defaultColor ?? "");
          }}
          onClose={() => setIconPickerOpen(false)}
        />
      ) : null}

      {softIssues ? (
        <ConfirmDialog
          title={t("routing.softValidationTitle", "配置存在以下问题")}
          cancelLabel={t("common.cancel", "取消")}
          confirmLabel={t("routing.saveAnyway", "仍要保存")}
          onCancel={() => setSoftIssues(null)}
          onConfirm={() => { setSoftIssues(null); submit(true); }}
        >
          <ul>
            {softIssues.map(issue => <li key={issue}>{issue}</li>)}
          </ul>
        </ConfirmDialog>
      ) : null}
    </>
  );
});

export const ProviderEditPanel = memo(function ProviderEditPanel({
  visible = true,
  ...contentProps
}: ProviderEditPanelProps) {
  // cc-switch parity: the panel fades/rises in instead of snapping on. We start
  // one frame behind the "shown" state (entered=false) so the very first paint
  // lands in the hidden state, then flip to shown on the next frame — that gives
  // the CSS opacity/transform transition a start value to animate from. The
  // prewarmed add panel is already mounted, so its fade never pays a mount cost.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  // `shown` drives only the visual fade (opacity/transform) — it dips false for
  // the one pre-enter frame so the edit panel animates in from hidden. a11y
  // visibility must track `visible` (the semantic state), not the animation
  // frame, or the panel would be aria-hidden for a frame and role queries /
  // screen readers would miss it.
  const shown = visible && entered;
  return createPortal(
    <div
      className={`ccs-fullscreen-panel${shown ? "" : " ccs-provider-editor-prewarm"}`}
      aria-hidden={visible ? undefined : true}
    >
      <ProviderEditPanelContent {...contentProps} />
    </div>,
    document.body
  );
});
