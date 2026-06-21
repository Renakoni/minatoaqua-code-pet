import type { ReactNode } from "react";

interface ProviderStatus {
  installed: boolean;
  configExists: boolean;
  hookCount: number;
  requiredCount: number;
  missingEvents: string[];
  commandMatches: boolean;
}

const providers: Record<string, { label: string; tagline: string; icon: string; hooks: ProviderStatus; forwarder: { expectedPath: string; exists: boolean } }> = {
  "claude-code": {
    label: "Claude Code",
    tagline: "默认启用，跟随 Claude Code 会话",
    icon: "◉",
    hooks: { installed: true, configExists: true, hookCount: 6, requiredCount: 6, missingEvents: [], commandMatches: true },
    forwarder: { expectedPath: "scripts/hook-forwarder.js", exists: true }
  },
  codex: {
    label: "OpenAI Codex",
    tagline: "新增：跟踪 Codex CLI 事件",
    icon: "✦",
    hooks: { installed: false, configExists: false, hookCount: 0, requiredCount: 6, missingEvents: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop"], commandMatches: false },
    forwarder: { expectedPath: "scripts/hook-forwarder.js", exists: true }
  }
};

export function SourcesPanel() {
  const ids = Object.keys(providers);
  return (
    <div className="sources-panel">
      <p className="note sources-note">安装 hooks 后，CLI 会自动将事件发送到 Aqua Code Pet。备份文件保存在 Claude / Codex 的配置目录。</p>
      {ids.map(id => {
        const info = providers[id];
        const status = info.hooks;
        const tone: "good" | "wait" | "bad" = status.installed ? "good" : status.configExists ? "wait" : "bad";
        return (
          <div key={id} className="source-card">
            <StatusCard
              icon={info.icon}
              label={id === "codex" ? <>{info.label} 状态<sup className="beta-badge">测试中</sup></> : `${info.label} 状态`}
              value={status.installed ? `已安装到 ${info.label}` : status.configExists ? "部分安装" : "未安装"}
              tone={tone}
            />

            <div className="hooks-detail">
              <span>已配置 {status.hookCount} / {status.requiredCount} 个事件</span>
              {status.missingEvents.length > 0 && <span className="hooks-missing">缺少: {status.missingEvents.join(", ")}</span>}
              {!status.commandMatches && status.configExists && <span className="hooks-mismatch">命令路径不匹配，建议修复</span>}
              {!info.forwarder.exists && <span className="hooks-mismatch">Forwarder 文件未找到</span>}
            </div>

            <div className="hooks-actions">
              <button>一键安装</button>
              <button>修复配置</button>
              <button className="danger">移除 Hooks</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusCard({ icon, label, value, tone }: { icon: string; label: ReactNode; value: string; tone: "good" | "bad" | "wait" | "neutral" }) {
  return (
    <article className={`status-card ${tone}`}>
      <b className="status-icon">{icon}</b>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
