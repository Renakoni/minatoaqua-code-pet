// @ts-nocheck
import React from "react";
import { useI18n } from "../../useI18n";
import { HooksManager, type HookStatus } from "../../components/hooks/HooksManager";
import { hookOutcomeMessage, type HookOperationOutcome } from "../../components/hooks/hookOutcome";
import { ConnectionRow } from "../overview/OverviewSection";
import { deriveConnectionState } from "../overview/connectionState";
import { timeAgo } from "../../utils/format";

// The full connection picture plus the destructive Remove, moved out of the
// Overview so that surface stays compact. Same parent-owned data flow as the
// Overview: status/checking/outcome live in the panel root, operations report
// back via onOperationComplete and trigger the authoritative full-chain recheck.
export function ConnectionManagement({
  hideSensitive,
  connection,
  now,
  hookStatus,
  checkError = false,
  actionOutcome = null,
  onRecheck,
  onOperationComplete
}: {
  hideSensitive: boolean;
  connection: any;
  now: number;
  hookStatus: HookStatus | null;
  checkError?: boolean;
  actionOutcome?: HookOperationOutcome | null;
  onRecheck?: () => void;
  onOperationComplete?: (outcome: HookOperationOutcome) => void;
}) {
  const { t } = useI18n();
  const format = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);

  const facts = deriveConnectionState(hookStatus, connection, checkError);

  return (
    <div className="connection-management">
      {facts.mode === "loading" ? (
        <div className="connection-loading">{t("status.checking", "检查中…")}</div>
      ) : facts.mode === "error" ? (
        <div className="connection-check-error">
          <p>{facts.errorReason === "settings-unreadable"
            ? t("connection.settingsUnreadable", "无法读取 Claude Code 设置。请检查设置文件格式是否有效，以及应用是否具有读取权限。")
            : t("connection.checkFailed", "无法刷新连接，请重试。")}</p>
          {onRecheck ? (
            <button type="button" className="connection-recheck" onClick={onRecheck}>
              {t("connection.recheck", "重新检查")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="connection-rows">
          <ConnectionRow
            label={t("connection.hookConfig", "Hook 配置")}
            value={facts.configComplete
              ? format(t("connection.configuredAll", "{count} 个事件已配置"), { count: facts.requiredCount })
              : format(t("connection.configuredPartial", "已配置 {count}/{total}"), { count: facts.configuredCount, total: facts.requiredCount })}
            state={facts.configState}
          />
          <ConnectionRow
            label={t("connection.hookCommand", "Hook 命令")}
            value={facts.commandOk ? t("connection.commandCurrent", "指向当前 forwarder") : t("connection.commandMismatch", "路径或超时不匹配，需修复")}
            state={facts.commandState}
          />
          <ConnectionRow
            label={t("connection.forwarder", "Forwarder 文件")}
            value={facts.forwarderOk ? t("connection.available", "可用") : t("doctor.fileMissing", "文件不存在")}
            state={facts.forwarderState}
          />
          <ConnectionRow
            label={t("status.localServer", "本地监听")}
            value={facts.listening ? `127.0.0.1:${connection.port}` : t("status.notListening", "未监听")}
            state={facts.listenerState}
          />
          <ConnectionRow
            label={t("status.recentEvent", "最近事件")}
            value={connection.lastEventAt ? timeAgo(connection.lastEventAt, now) : t("connection.waitingFirstEvent", "等待首个事件")}
            state={facts.recentEventState}
          />
        </div>
      )}

      {/* This is the most complete connection view, so when a hook config/command
          problem is Repair-fixable it must offer Repair right where the "needs
          repair" row appears — a user reading the full diagnostics here shouldn't
          have to leave for the Overview to fix it. Repair is gated on canRepair
          exactly like the Overview: hidden when healthy, or when the forwarder is
          missing (Repair can't fix that — that case shows guidance instead). The
          destructive Remove with its two-step confirmation always stays. */}
      <HooksManager actionsOnly showRepair={facts.canRepair} status={hookStatus} onOperationComplete={onOperationComplete} />

      {/* Same parent-owned outcome as the Overview, derived at render time so it
          stays reactive to the current locale and hide setting. */}
      {actionOutcome ? <p className="hooks-result connection-action-result">{hookOutcomeMessage(actionOutcome, t, hideSensitive)}</p> : null}
    </div>
  );
}
