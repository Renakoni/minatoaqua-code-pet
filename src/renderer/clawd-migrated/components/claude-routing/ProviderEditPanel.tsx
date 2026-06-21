import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
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
        <button className="ccs-back-button" type="button" onClick={onClose}><ArrowLeft size={18} /></button>
        <div className="ccs-fullscreen-title">
          <h2>{mode === "edit" ? "编辑供应商" : "添加供应商"}</h2>
          <span>Claude Code Provider</span>
        </div>
      </header>

      <main className="ccs-fullscreen-body">
        <form id="claude-provider-form" className="ccs-provider-form" onSubmit={event => { event.preventDefault(); onSave(draft, mode === "edit" ? provider.id : undefined); }}>
          <section className="ccs-form-card">
            <div className="ccs-form-section-heading">
              <div>
                <h3>基础信息</h3>
                <p>供应商在列表中的显示名称、官网和分类。</p>
              </div>
            </div>
            <div className="ccs-form-grid two">
              <label>
                <span>供应商名称</span>
                <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Claude Official" />
              </label>
              <label>
                <span>分类</span>
                <select value={draft.category ?? "custom"} onChange={event => setDraft({ ...draft, category: event.target.value as ClaudeProvider["category"] })}>
                  <option value="official">official</option>
                  <option value="third_party">third_party</option>
                  <option value="custom">custom</option>
                </select>
              </label>
              <label>
                <span>官网 / 展示 URL</span>
                <input value={draft.websiteUrl ?? ""} onChange={event => setDraft({ ...draft, websiteUrl: event.target.value })} placeholder="https://provider.example.com" />
              </label>
              <label>
                <span>备注</span>
                <input value={draft.notes ?? ""} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="显示在供应商卡片下方" />
              </label>
            </div>
          </section>

          <section className="ccs-form-card">
            <div className="ccs-form-section-heading">
              <div>
                <h3>Claude Code 配置</h3>
                <p>写入新终端/切换预览使用的 Claude Code 环境变量。</p>
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
                <input value={model} onChange={event => updateEnv("ANTHROPIC_MODEL", event.target.value)} placeholder="可选，例如 claude-sonnet-4-6" />
              </label>
            </div>
          </section>

          <section className="ccs-form-card">
            <div className="ccs-form-section-heading">
              <div>
                <h3>高级路由</h3>
                <p>保持 cc-switch ProviderForm 的分组式配置入口。</p>
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
                <input value={draft.settingsConfig.prefix ?? ""} onChange={event => updateConfig("prefix", event.target.value)} placeholder="可选路由前缀" />
              </label>
              <label className="wide">
                <span>Excluded models</span>
                <textarea value={draft.settingsConfig.excludedModels ?? ""} onChange={event => updateConfig("excludedModels", event.target.value)} placeholder="每行一个模型规则" />
              </label>
            </div>
          </section>

          <section className="ccs-form-card">
            <div className="ccs-form-section-heading">
              <div>
                <h3>图标</h3>
                <p>列表左侧 provider icon 的名称和颜色。</p>
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
        <button className="ccs-panel-cancel" type="button" onClick={onClose}>取消</button>
        <button className="ccs-save-button" type="submit" form="claude-provider-form"><Save size={16} />保存</button>
      </footer>
    </div>
  );
}
