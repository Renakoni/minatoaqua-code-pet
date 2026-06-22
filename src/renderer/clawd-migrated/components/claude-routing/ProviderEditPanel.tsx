import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { useI18n } from "../../useI18n";
import type { ClaudeProvider } from "./types";

type StringConfigKey = Exclude<keyof ClaudeProvider["settingsConfig"], "env">;

export function ProviderEditPanel({
  provider,
  mode,
  onSave,
  onClose
}: {
  provider: ClaudeProvider;
  mode: "add" | "edit";
  onSave: (provider: ClaudeProvider, originalId?: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ClaudeProvider>(provider);
  const env = draft.settingsConfig.env ?? {};
  const baseUrl = env.ANTHROPIC_BASE_URL ?? "";
  const token = env.ANTHROPIC_AUTH_TOKEN ?? "";
  const model = env.ANTHROPIC_MODEL ?? "";

  const updateEnv = (key: "ANTHROPIC_BASE_URL" | "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_MODEL", value: string) => {
    setDraft(current => ({
      ...current,
      settingsConfig: {
        ...current.settingsConfig,
        env: { ...current.settingsConfig.env, [key]: value }
      }
    }));
  };

  const updateConfig = (key: StringConfigKey, value: string) => {
    setDraft(current => ({
      ...current,
      settingsConfig: { ...current.settingsConfig, [key]: value }
    }));
  };

  return (
    <div className="ccs-fullscreen-panel">
      <header className="ccs-fullscreen-header">
        <button className="ccs-back-button" type="button" onClick={onClose} aria-label={t("common.back", "Back")} title={t("common.back", "Back")}><ArrowLeft size={18} /></button>
        <div className="ccs-fullscreen-title">
          <h2>{mode === "edit" ? t("routing.editProvider", "Edit provider") : t("routing.addProvider", "Add provider")}</h2>
          <span>Claude Code Provider</span>
        </div>
      </header>

      <main className="ccs-fullscreen-body">
        <form id="claude-provider-form" className="ccs-provider-form" onSubmit={event => { event.preventDefault(); onSave(draft, mode === "edit" ? provider.id : undefined); }}>
          <section className="ccs-form-card">
            <div className="ccs-form-section-heading">
              <div>
                <h3>{t("routing.basicInfo", "Basic info")}</h3>
                <p>{t("routing.basicInfoDesc", "Display name, website, and category shown in the provider list.")}</p>
              </div>
            </div>
            <div className="ccs-form-grid two">
              <label>
                <span>{t("routing.providerName", "Provider name")}</span>
                <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Claude Official" />
              </label>
              <label>
                <span>{t("routing.category", "Category")}</span>
                <select value={draft.category ?? "custom"} onChange={event => setDraft({ ...draft, category: event.target.value as ClaudeProvider["category"] })}>
                  <option value="official">{t("routing.categoryOfficial", "Official")}</option>
                  <option value="third_party">{t("routing.categoryThirdParty", "Third-party")}</option>
                  <option value="custom">{t("routing.categoryCustom", "Custom")}</option>
                </select>
              </label>
              <label>
                <span>{t("routing.websiteUrl", "Website / display URL")}</span>
                <input value={draft.websiteUrl ?? ""} onChange={event => setDraft({ ...draft, websiteUrl: event.target.value })} placeholder="https://provider.example.com" />
              </label>
              <label>
                <span>{t("routing.notes", "Notes")}</span>
                <input value={draft.notes ?? ""} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder={t("routing.notesPlaceholder", "Shown below the provider card")} />
              </label>
            </div>
          </section>

          <section className="ccs-form-card">
            <div className="ccs-form-section-heading">
              <div>
                <h3>{t("routing.claudeConfig", "Claude Code config")}</h3>
                <p>{t("routing.claudeConfigDesc", "Environment variables used when opening a new terminal or switching route previews.")}</p>
              </div>
            </div>
            <div className="ccs-form-grid">
              <label>
                <span>ANTHROPIC_BASE_URL</span>
                <input value={baseUrl} onChange={event => updateEnv("ANTHROPIC_BASE_URL", event.target.value)} placeholder="https://api.anthropic.com" />
              </label>
              <label>
                <span>ANTHROPIC_AUTH_TOKEN</span>
                <input type="password" value={token} onChange={event => updateEnv("ANTHROPIC_AUTH_TOKEN", event.target.value)} placeholder="sk-ant-..." />
              </label>
              <label>
                <span>ANTHROPIC_MODEL</span>
                <input value={model} onChange={event => updateEnv("ANTHROPIC_MODEL", event.target.value)} placeholder={t("routing.modelPlaceholder", "Optional, e.g. claude-sonnet-4-6")} />
              </label>
            </div>
          </section>

          <section className="ccs-form-card">
            <div className="ccs-form-section-heading">
              <div>
                <h3>{t("routing.advancedRouting", "Advanced routing")}</h3>
                <p>{t("routing.advancedRoutingDesc", "Grouped configuration fields compatible with cc-switch ProviderForm.")}</p>
              </div>
            </div>
            <div className="ccs-form-grid two">
              <label>
                <span>Headers</span>
                <textarea value={draft.settingsConfig.headers ?? ""} onChange={event => updateConfig("headers", event.target.value)} placeholder={'{"X-Api-Key":"..."}'} />
              </label>
              <label>
                <span>Model aliases</span>
                <textarea value={draft.settingsConfig.modelAliases ?? ""} onChange={event => updateConfig("modelAliases", event.target.value)} placeholder="alias=upstream-model" />
              </label>
              <label>
                <span>Proxy URL</span>
                <input value={draft.settingsConfig.proxyUrl ?? ""} onChange={event => updateConfig("proxyUrl", event.target.value)} placeholder="http://127.0.0.1:7890" />
              </label>
              <label>
                <span>Prefix</span>
                <input value={draft.settingsConfig.prefix ?? ""} onChange={event => updateConfig("prefix", event.target.value)} placeholder={t("routing.prefixPlaceholder", "Optional route prefix")} />
              </label>
              <label className="wide">
                <span>Excluded models</span>
                <textarea value={draft.settingsConfig.excludedModels ?? ""} onChange={event => updateConfig("excludedModels", event.target.value)} placeholder={t("routing.excludedModelsPlaceholder", "One model rule per line")} />
              </label>
            </div>
          </section>

          <section className="ccs-form-card">
            <div className="ccs-form-section-heading">
              <div>
                <h3>{t("routing.icon", "Icon")}</h3>
                <p>{t("routing.iconDesc", "Name and color for the provider icon shown on the left side of the list.")}</p>
              </div>
            </div>
            <div className="ccs-form-grid two compact">
              <label>
                <span>Icon</span>
                <input value={draft.icon ?? ""} onChange={event => setDraft({ ...draft, icon: event.target.value })} placeholder="anthropic / openai / custom" />
              </label>
              <label>
                <span>Icon color</span>
                <input value={draft.iconColor ?? ""} onChange={event => setDraft({ ...draft, iconColor: event.target.value })} placeholder="#f97316" />
              </label>
            </div>
          </section>
        </form>
      </main>

      <footer className="ccs-fullscreen-footer">
        <button className="ccs-panel-cancel" type="button" onClick={onClose}>{t("common.cancel", "Cancel")}</button>
        <button className="ccs-save-button" type="submit" form="claude-provider-form"><Save size={16} />{t("common.save", "Save")}</button>
      </footer>
    </div>
  );
}
