// @ts-nocheck
import React, { useState } from "react";
import { CheckCircle2, Wrench } from "lucide-react";
import { useI18n } from "../../useI18n";
import { StatusCard } from "../workbench/Primitives";
import { describeHookOperationError, type HookStatus, type HookOperationResult } from "../../../../shared/hooks";

export type { HookStatus };

export type HookOpKind = "install" | "repair" | "remove";
export interface HookOperationOutcome {
  operation: HookOpKind;
  /** Fresh status from the operation result, or null if the call threw. */
  status: HookStatus | null;
  /** Localized, already privacy-processed message to show the user. */
  message: string;
  /** True only for a fully successful install. */
  installed: boolean;
}

const HIDDEN_KEY: Record<HookOpKind, string> = { install: "doctor.installFailedHidden", repair: "doctor.repairFailedHidden", remove: "doctor.removeFailedHidden" };
const HIDDEN_FALLBACK: Record<HookOpKind, string> = { install: "Hook 安装失败，详情已隐藏。", repair: "Hook 修复失败，详情已隐藏。", remove: "Hook 移除失败，详情已隐藏。" };
const FAILED_KEY: Record<HookOpKind, string> = { install: "doctor.installFailed", repair: "doctor.repairFailed", remove: "doctor.removeFailed" };
const FAILED_FALLBACK: Record<HookOpKind, string> = { install: "安装失败: {error}", repair: "修复失败: {error}", remove: "移除失败: {error}" };

// The parent (Overview) is the single owner of hook STATUS, the loading/error
// state, AND the action-outcome message: HooksManager reports each completed
// operation via onOperationComplete, and the parent renders the message in a
// stable location so it survives the notConfigured <-> workbench transition that
// unmounts this component. HooksManager renders the supplied status and performs
// install/repair/remove; it does NOT fetch status on mount.
export function HooksManager({ compact = false, actionsOnly = false, success = false, showRepair = true, hideSensitiveContent = false, status = null, onOperationComplete }: { compact?: boolean; actionsOnly?: boolean; success?: boolean; showRepair?: boolean; hideSensitiveContent?: boolean; status?: HookStatus | null; onOperationComplete?: (outcome: HookOperationOutcome) => void } = {}) {
  const { t } = useI18n();
  const formatText = (template: string, values: Record<string, string | number>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
  const [action, setAction] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // Turn a failed hook-operation result into a display message. The privacy
  // decision (structured category / generic hidden / raw) is made by
  // describeHookOperationError; here we only localize it.
  function failureMessage(res: Pick<HookOperationResult, "error" | "errorKind" | "forwarderPath"> | undefined, op: HookOpKind) {
    const display = describeHookOperationError(res, hideSensitiveContent);
    if (display.kind === "forwarder-missing") {
      return display.path
        ? formatText(t("doctor.forwarderMissingPath", "找不到 hook 转发文件：{path}"), { path: display.path })
        : t("doctor.forwarderMissing", "找不到 hook 转发文件，请重新安装应用。");
    }
    if (display.kind === "hidden") return t(HIDDEN_KEY[op], HIDDEN_FALLBACK[op]);
    return formatText(t(FAILED_KEY[op], FAILED_FALLBACK[op]), { error: display.text });
  }

  async function handleInstall() {
    setAction("installing");
    try {
      const res = await window.companion.installHooks();
      const installed = !!res.success && !!res.status?.installed;
      const message = installed ? t("doctor.installDone", "安装成功！重启 Claude Code 会话后生效。") : res.success ? t("doctor.installIncomplete", "安装完成，但仍有 hooks 未配置完整。") : failureMessage(res, "install");
      onOperationComplete?.({ operation: "install", status: res.status ?? null, message, installed });
    } catch (error) {
      onOperationComplete?.({ operation: "install", status: null, message: failureMessage({ error: error instanceof Error ? error.message : String(error) }, "install"), installed: false });
    } finally {
      setAction(null);
    }
  }

  async function handleRepair() {
    setAction("repairing");
    try {
      const res = await window.companion.repairHooks();
      const message = res.success ? t("doctor.repairDone", "Hook 配置已修复。") : failureMessage(res, "repair");
      onOperationComplete?.({ operation: "repair", status: res.status ?? null, message, installed: false });
    } catch (error) {
      onOperationComplete?.({ operation: "repair", status: null, message: failureMessage({ error: error instanceof Error ? error.message : String(error) }, "repair"), installed: false });
    } finally {
      setAction(null);
    }
  }

  async function handleRemove() {
    setAction("removing");
    try {
      const res = await window.companion.removeHooks();
      const message = res.success ? t("doctor.removeDone", "已移除所有 Clawd hooks。") : failureMessage(res, "remove");
      onOperationComplete?.({ operation: "remove", status: res.status ?? null, message, installed: false });
    } catch (error) {
      onOperationComplete?.({ operation: "remove", status: null, message: failureMessage({ error: error instanceof Error ? error.message : String(error) }, "remove"), installed: false });
    } finally {
      setAction(null);
      setConfirmingRemove(false);
    }
  }

  const configuredLabel = formatText(t("doctor.configuredCount", "已配置 {count} / {total} 个事件"), { count: status?.hookCount ?? 0, total: status?.requiredCount ?? 6 });
  const missingLabel = status?.missingEvents && status.missingEvents.length > 0 ? formatText(t("doctor.missingPrefix", "缺少: {events}"), { events: status.missingEvents.join(", ") }) : undefined;
  const mismatchLabel = status && !status.commandMatches && status.configExists ? t("doctor.mismatchHint", "命令与当前配置不一致，建议修复") : undefined;
  const hookMeta = [missingLabel, mismatchLabel].filter(Boolean).join(" · ");
  const showManage = !compact || actionsOnly;

  return (
    <div className={`hooks-manager ${compact ? "compact" : ""} ${actionsOnly ? "actions-only" : ""} ${success ? "install-success" : ""}`}>
      {!actionsOnly && <StatusCard
        icon={success ? <CheckCircle2 size={18} /> : <Wrench size={18} />}
        label={success ? t("doctor.hooksReady", "Hooks 已就绪") : t("doctor.status", "Hooks 状态")}
        value={success ? t("doctor.installSuccessValue", "安装成功") : compact ? configuredLabel : status?.installed ? t("hooks.installed", "已安装") : status?.configExists ? t("doctor.partial", "部分安装") : t("hooks.notInstalled", "未安装")}
        meta={success ? undefined : compact && hookMeta ? hookMeta : undefined}
        tone={success ? "good" : status?.installed ? "good" : status?.configExists ? "wait" : "bad"}
      />}

      {!compact && !actionsOnly && <div className="hooks-detail">
        <span>{configuredLabel}</span>
        {missingLabel && <span className="hooks-missing">{missingLabel}</span>}
        {mismatchLabel && <span className="hooks-mismatch">{mismatchLabel}</span>}
      </div>}

      {(!actionsOnly || showRepair) && <div className="hooks-actions">
        {!actionsOnly && <button onClick={handleInstall} disabled={!!action || success}>
          {success ? <><CheckCircle2 size={16} />{t("doctor.installed", "已安装")}</> : action === "installing" ? t("doctor.installing", "安装中...") : t("doctor.oneClickInstall", "一键安装")}
        </button>}
        {showManage && showRepair && <button onClick={handleRepair} disabled={!!action}>
          {action === "repairing" ? t("doctor.repairing", "修复中...") : t("doctor.repairConfig", "修复配置")}
        </button>}
      </div>}

      {/* Remove is destructive (it edits Claude Code settings), so it lives in a
          de-emphasized zone and requires an explicit confirmation. It is offered
          consistently whenever the manage actions show, not only alongside Repair. */}
      {showManage && <div className="hooks-danger-zone">
        {confirmingRemove ? (
          <>
            <span className="hooks-danger-prompt">{t("doctor.removeConfirm", "确定从 Claude Code 配置中移除所有 hooks？")}</span>
            <button className="danger" onClick={handleRemove} disabled={!!action}>
              {action === "removing" ? t("doctor.removing", "移除中...") : t("doctor.removeConfirmYes", "确认移除")}
            </button>
            <button onClick={() => setConfirmingRemove(false)} disabled={!!action}>{t("common.cancel", "取消")}</button>
          </>
        ) : (
          <button className="danger ghost" onClick={() => setConfirmingRemove(true)} disabled={!!action}>{t("doctor.removeHooks", "移除 Hooks")}</button>
        )}
      </div>}

      {!compact && !actionsOnly && <p className="note">{t("doctor.note", "安装 hooks 后，Claude Code 会自动将事件发送到 Clawd Companion。备份文件保存在 ~/.claude/settings.clawd-backup.json")}</p>}
    </div>
  );
}
