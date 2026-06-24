// @ts-nocheck
import React, { useEffect, useState } from "react";
import { CheckCircle2, Wrench } from "lucide-react";
import { useI18n } from "../../useI18n";
import { StatusCard } from "../workbench/Primitives";

export type HookStatus = { installed: boolean; configExists: boolean; hookCount: number; requiredCount: number; missingEvents: string[]; commandMatches: boolean };
export type HookSetupStage = "idle" | "success" | "hiding";

export function HooksManager({ compact = false, success = false, onStatusChange, onInstallSuccess }: { compact?: boolean; success?: boolean; onStatusChange?: (status: HookStatus) => void; onInstallSuccess?: (status: HookStatus) => void } = {}) {
  const { t } = useI18n();
  const formatText = (template: string, values: Record<string, string | number>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
  const [status, setStatus] = useState<HookStatus | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function updateHookStatus(next: HookStatus) {
    setStatus(next);
    onStatusChange?.(next);
  }

  useEffect(() => {
    let cancelled = false;
    window.companion.checkHooks().then(next => {
      if (!cancelled) updateHookStatus(next);
    });
    return () => { cancelled = true; };
  }, []);

  async function handleInstall() {
    setAction("installing");
    try {
      const res = await window.companion.installHooks();
      const nextStatus = await window.companion.checkHooks();
      const installed = !!res.success && nextStatus.installed && nextStatus.commandMatches && nextStatus.missingEvents.length === 0;
      setResult(installed ? t("doctor.installDone", "安装成功！重启 Claude Code 会话后生效。") : res.success ? t("doctor.installIncomplete", "安装完成，但仍有 hooks 未配置完整。") : formatText(t("doctor.installFailed", "安装失败: {error}"), { error: res.error ?? "" }));
      updateHookStatus(nextStatus);
      if (installed) onInstallSuccess?.(nextStatus);
    } catch (error) {
      setResult(formatText(t("doctor.installFailed", "安装失败: {error}"), { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setAction(null);
    }
  }

  async function handleRepair() {
    setAction("repairing");
    try {
      const res = await window.companion.repairHooks();
      setResult(res.success ? formatText(t("doctor.repairDone", "修复完成，修复了 {count} 项配置。"), { count: res.fixed.length }) : formatText(t("doctor.repairFailed", "修复失败: {error}"), { error: res.error ?? "" }));
      updateHookStatus(await window.companion.checkHooks());
    } catch (error) {
      setResult(formatText(t("doctor.repairFailed", "修复失败: {error}"), { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setAction(null);
    }
  }

  async function handleRemove() {
    setAction("removing");
    try {
      const res = await window.companion.removeHooks();
      setResult(res.success ? t("doctor.removeDone", "已移除所有 Clawd hooks。") : formatText(t("doctor.removeFailed", "移除失败: {error}"), { error: res.error ?? "" }));
      updateHookStatus(await window.companion.checkHooks());
    } catch (error) {
      setResult(formatText(t("doctor.removeFailed", "移除失败: {error}"), { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setAction(null);
    }
  }

  const configuredLabel = formatText(t("doctor.configuredCount", "已配置 {count} / {total} 个事件"), { count: status?.hookCount ?? 0, total: status?.requiredCount ?? 6 });
  const missingLabel = status?.missingEvents && status.missingEvents.length > 0 ? formatText(t("doctor.missingPrefix", "缺少: {events}"), { events: status.missingEvents.join(", ") }) : undefined;
  const mismatchLabel = status && !status.commandMatches && status.configExists ? t("doctor.mismatchHint", "命令路径不匹配，建议修复") : undefined;
  const hookMeta = [missingLabel, mismatchLabel].filter(Boolean).join(" · ");

  return (
    <div className={`hooks-manager ${compact ? "compact" : ""} ${success ? "install-success" : ""}`}>
      <StatusCard
        icon={success ? <CheckCircle2 size={18} /> : <Wrench size={18} />}
        label={success ? t("doctor.hooksReady", "Hooks 已就绪") : t("doctor.status", "Hooks 状态")}
        value={success ? t("doctor.installSuccessValue", "安装成功") : compact ? configuredLabel : status?.installed ? t("hooks.installed", "已安装") : status?.configExists ? t("doctor.partial", "部分安装") : t("hooks.notInstalled", "未安装")}
        meta={success ? undefined : compact && hookMeta ? hookMeta : undefined}
        tone={success ? "good" : status?.installed ? "good" : status?.configExists ? "wait" : "bad"}
      />

      {!compact && <div className="hooks-detail">
        <span>{configuredLabel}</span>
        {missingLabel && <span className="hooks-missing">{missingLabel}</span>}
        {mismatchLabel && <span className="hooks-mismatch">{mismatchLabel}</span>}
      </div>}

      <div className="hooks-actions">
        <button onClick={handleInstall} disabled={!!action || success}>
          {success ? <><CheckCircle2 size={16} />{t("doctor.installed", "已安装")}</> : action === "installing" ? t("doctor.installing", "安装中...") : t("doctor.oneClickInstall", "一键安装")}
        </button>
        {!compact && <button onClick={handleRepair} disabled={!!action}>
          {action === "repairing" ? t("doctor.repairing", "修复中...") : t("doctor.repairConfig", "修复配置")}
        </button>}
        {!compact && <button className="danger" onClick={handleRemove} disabled={!!action}>
          {action === "removing" ? t("doctor.removing", "移除中...") : t("doctor.removeHooks", "移除 Hooks")}
        </button>}
      </div>

      {result && <p className="hooks-result">{result}</p>}

      {!compact && <p className="note">{t("doctor.note", "安装 hooks 后，Claude Code 会自动将事件发送到 Clawd Companion。备份文件保存在 ~/.claude/settings.clawd-backup.json")}</p>}
    </div>
  );
}
