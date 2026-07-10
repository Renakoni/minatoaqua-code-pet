// @ts-nocheck
import React from "react";
import { Wrench } from "lucide-react";
import { useI18n } from "../../useI18n";
import { ClaudeRoutingPanel } from "../../components/claude-routing/ClaudeRoutingPanel";
import { HooksManager, type HookStatus } from "../../components/hooks/HooksManager";
import { deriveConnectionState } from "./connectionState";
import { timeAgo } from "../../utils/format";

type ConnectionRowState = "healthy" | "waiting" | "partial" | "repair" | "unavailable";

function ConnectionRow({ label, value, state }: { label: string; value: string; state: ConnectionRowState }) {
  return (
    <div className={`connection-row state-${state}`}>
      <span className="connection-row-dot" aria-hidden="true" />
      <span className="connection-row-label">{label}</span>
      <span className="connection-row-value" title={value}>{value}</span>
    </div>
  );
}

// The Overview connection area is a single surface that changes state over the
// product lifecycle: first-run onboarding (no hooks yet) -> the factual delivery
// chain workbench (installed). It never shows both, and never re-shows first-run
// onboarding for an installed-but-broken config (that gets a contextual Repair).
export function OverviewSection({
  settings,
  connection,
  now,
  hookStatus,
  onHookStatusChange,
  onHookInstallSuccess
}: {
  settings: any;
  updateSettings?: (settings: any) => void;
  connection: any;
  now: number;
  hookStatus: HookStatus | null;
  onHookStatusChange: (status: HookStatus) => void;
  onHookInstallSuccess: (status: HookStatus) => void;
}) {
  const { t } = useI18n();
  const format = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);

  const {
    requiredCount,
    configuredCount,
    configComplete,
    commandOk,
    forwarderOk,
    listening,
    healthy,
    firstRun,
    configState,
    commandState,
    forwarderState,
    listenerState,
    recentEventState
  } = deriveConnectionState(hookStatus, connection);

  return (
    <section className="overview-workbench">
      <ClaudeRoutingPanel />
      {connection.error ? <section className="connection-error"><Wrench size={18} />{connection.error}</section> : null}

      <section className="overview-connection">
        <header className="workbench-section-head">
          <div>
            <span>{t("settings.tabs.general", "总览")}</span>
            <h2>{t("sections.connectionDetails", "连接详情")}</h2>
          </div>
          {hookStatus && !firstRun ? (
            <span className={`overview-state-badge ${healthy ? "good" : listening ? "wait" : "bad"}`}>
              {healthy ? t("status.ready", "已就绪") : listening ? t("status.needsAttention", "需要处理") : t("status.notListening", "未监听")}
            </span>
          ) : null}
        </header>

        {hookStatus === null ? (
          <div className="connection-loading">{t("status.checking", "检查中…")}</div>
        ) : firstRun ? (
          <div className="connection-onboarding">
            <h3>{t("main.connectTitle", "连接 Claude Code")}</h3>
            <p>{t("connection.onboardingBody", "一键安装 hooks，Claude Code 就会把会话事件发送到桌宠。")}</p>
            <HooksManager compact hideSensitiveContent={settings.hideSensitiveContent === true} onStatusChange={onHookStatusChange} onInstallSuccess={onHookInstallSuccess} />
          </div>
        ) : (
          <>
            <div className="connection-rows">
              <ConnectionRow
                label={t("connection.hookConfig", "Hook 配置")}
                value={configComplete
                  ? format(t("connection.configuredAll", "{count} 个事件已配置"), { count: requiredCount })
                  : format(t("connection.configuredPartial", "已配置 {count}/{total}"), { count: configuredCount, total: requiredCount })}
                state={configState}
              />
              <ConnectionRow
                label={t("connection.hookCommand", "Hook 命令")}
                value={commandOk ? t("connection.commandCurrent", "指向当前 forwarder") : t("connection.commandMismatch", "路径或超时不匹配，需修复")}
                state={commandState}
              />
              <ConnectionRow
                label={t("connection.forwarder", "Forwarder 文件")}
                value={forwarderOk ? t("connection.available", "可用") : t("doctor.fileMissing", "文件不存在")}
                state={forwarderState}
              />
              <ConnectionRow
                label={t("status.localServer", "本地监听")}
                value={listening ? `127.0.0.1:${connection.port}` : t("status.notListening", "未监听")}
                state={listenerState}
              />
              <ConnectionRow
                label={t("status.recentEvent", "最近事件")}
                value={connection.lastEventAt ? timeAgo(connection.lastEventAt, now) : t("connection.waitingFirstEvent", "等待首个事件")}
                state={recentEventState}
              />
            </div>
            {!healthy ? (
              <HooksManager actionsOnly hideSensitiveContent={settings.hideSensitiveContent === true} onStatusChange={onHookStatusChange} onInstallSuccess={onHookInstallSuccess} />
            ) : null}
          </>
        )}
      </section>
    </section>
  );
}
