// @ts-nocheck
import React from "react";
import { Wrench, RefreshCw } from "lucide-react";
import { useI18n } from "../../useI18n";
import { ClaudeRoutingPanel } from "../../components/claude-routing/ClaudeRoutingPanel";
import { HooksManager, type HookStatus } from "../../components/hooks/HooksManager";
import { hookOutcomeMessage, type HookOperationOutcome } from "../../components/hooks/hookOutcome";
import { deriveConnectionState } from "./connectionState";
import { redactSensitiveText } from "../../../../shared/privacy";
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
// product lifecycle. The states are mutually exclusive (loading / check-error /
// not-configured onboarding / factual workbench) and it never re-shows first-run
// onboarding for an installed-but-broken config — that keeps the workbench with a
// contextual Repair. Repair is offered only for problems Repair can fix (hook
// config/command); forwarder-file and listener failures get their own guidance.
export function OverviewSection({
  settings,
  connection,
  now,
  hookStatus,
  checkError = false,
  checking = false,
  actionOutcome = null,
  onRecheck,
  onOperationComplete
}: {
  settings: any;
  updateSettings?: (settings: any) => void;
  connection: any;
  now: number;
  hookStatus: HookStatus | null;
  checkError?: boolean;
  checking?: boolean;
  actionOutcome?: HookOperationOutcome | null;
  onRecheck?: () => void;
  onOperationComplete?: (outcome: HookOperationOutcome) => void;
}) {
  const { t, locale } = useI18n();
  const hideSensitive = settings.hideSensitiveContent === true;
  const format = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);

  const facts = deriveConnectionState(hookStatus, connection, checkError);
  const {
    mode,
    errorReason,
    requiredCount,
    configuredCount,
    configComplete,
    commandOk,
    forwarderOk,
    listening,
    healthy,
    canRepair,
    forwarderMissing,
    listenerDown,
    configState,
    commandState,
    forwarderState,
    listenerState,
    recentEventState
  } = facts;

  const recheckButton = onRecheck ? (
    <button type="button" className="connection-recheck" onClick={onRecheck} disabled={checking}>
      <RefreshCw size={13} className={checking ? "spin" : undefined} />
      {checking ? t("connection.rechecking", "检查中…") : t("connection.recheck", "重新检查")}
    </button>
  ) : null;

  return (
    <section className="overview-workbench">
      <ClaudeRoutingPanel />
      {connection.error ? <section className="connection-error"><Wrench size={18} />{hideSensitive ? redactSensitiveText(connection.error, locale) : connection.error}</section> : null}

      <section className="overview-connection">
        <header className="workbench-section-head">
          <div>
            <span>{t("settings.tabs.general", "总览")}</span>
            <h2>{t("sections.connectionDetails", "连接详情")}</h2>
          </div>
          {mode === "workbench" ? (
            <div className="connection-head-actions">
              <span className={`overview-state-badge ${healthy ? "good" : listening ? "wait" : "bad"}`}>
                {healthy ? t("status.ready", "已就绪") : listening ? t("status.needsAttention", "需要处理") : t("status.notListening", "未监听")}
              </span>
              {recheckButton}
            </div>
          ) : null}
        </header>

        {mode === "loading" ? (
          <div className="connection-loading">{t("status.checking", "检查中…")}</div>
        ) : mode === "error" ? (
          <div className="connection-check-error">
            <p>{errorReason === "settings-unreadable"
              ? t("connection.settingsUnreadable", "无法读取 Claude Code 设置。请检查设置文件格式是否有效，以及应用是否具有读取权限。")
              : t("connection.checkFailed", "无法刷新连接，请重试。")}</p>
            {recheckButton}
          </div>
        ) : mode === "notConfigured" ? (
          <div className="connection-onboarding">
            <h3>{t("main.connectTitle", "连接 Claude Code")}</h3>
            <p>{t("connection.onboardingBody", "一键安装 hooks，Claude Code 就会把会话事件发送到桌宠。")}</p>
            <HooksManager compact status={hookStatus} onOperationComplete={onOperationComplete} />
            {/* Discover an externally-installed config without leaving this view. */}
            {recheckButton}
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

            {/* Manage actions are always available in the workbench (Remove lives in
                a consistent danger zone); Repair only shows when it can actually fix
                the problem. Forwarder/listener failures get their own guidance. */}
            <HooksManager actionsOnly showRepair={canRepair} status={hookStatus} onOperationComplete={onOperationComplete} />
            {forwarderMissing ? (
              <div className="connection-guidance">
                <p>{t("connection.forwarderMissingGuidance", "桌宠的 hook 转发文件缺失，通常是应用被移动或未完整安装。请重新安装或恢复应用后再检查。")}</p>
              </div>
            ) : null}
            {listenerDown ? (
              <div className="connection-guidance">
                <p>{t("connection.listenerDownGuidance", "本地监听未运行，无法接收事件。请重启桌宠应用；监听恢复后此处会自动更新。")}</p>
              </div>
            ) : null}
          </>
        )}

        {/* Parent-owned action feedback: rendered outside the mode branches so a
            success message (e.g. the install restart guidance) survives the
            notConfigured <-> workbench transition that unmounts the HooksManager.
            The message is derived HERE from the structured outcome using the
            current locale + hide setting, so it never leaks a path stored earlier
            when hiding was off. */}
        {actionOutcome ? <p className="hooks-result connection-action-result">{hookOutcomeMessage(actionOutcome, t, hideSensitive)}</p> : null}
      </section>
    </section>
  );
}
