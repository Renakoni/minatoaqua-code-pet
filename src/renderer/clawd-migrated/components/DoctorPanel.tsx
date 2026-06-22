// @ts-nocheck
import React, { useEffect, useState } from "react";
import type { DoctorReport } from "../../shared/events";
import { useI18n } from "../useI18n";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={ok ? "doctor-pill ok" : "doctor-pill bad"}>{label}</span>;
}

function formatI18n(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template);
}

function updateStatusText(report: DoctorReport, t: (path: string, fallback?: string) => string): string {
  if (report.update.error) return report.update.error;
  if (report.update.downloaded) return formatI18n(t("doctor.updateDownloaded", "Downloaded v{version}"), { version: report.update.version ?? "" });
  if (report.update.downloading) return formatI18n(t("doctor.updateDownloading", "Downloading {progress}%"), { progress: Math.round(report.update.progress ?? 0) });
  if (report.update.checking) return t("doctor.updateChecking", "Checking");
  if (report.update.available) return formatI18n(t("doctor.updateAvailable", "Found v{version}"), { version: report.update.version ?? "" });
  if (report.update.upToDate) return t("doctor.updateUpToDate", "Up to date");
  return report.update.autoUpdateEnabled ? t("doctor.updateWaitingAuto", "Waiting for automatic check") : t("doctor.updateAutoDisabled", "Automatic check disabled");
}

export function DoctorPanel() {
  const { t, locale } = useI18n();
  const [report, setReport] = useState<DoctorReport | null>(null);
  const refresh = () => window.companion.getDoctorReport().then(setReport).catch(() => setReport(null));

  useEffect(() => {
    void refresh();
  }, []);

  if (!report) {
    return <div className="panel-group-card"><h3 className="panel-title">{t("doctor.title", "诊断中心")}</h3><div className="empty">{t("doctor.empty", "暂无诊断数据")}</div></div>;
  }

  // Backward-compat: the legacy single-provider Doctor report had a top-level
  // `hooks` object. New reports expose `providers["claude-code"].hooks`.
  const primaryHooks = report.hooks ?? report.providers?.["claude-code"]?.hooks;
  const primaryForwarderExists = report.forwarder.exists ?? report.providers?.["claude-code"]?.forwarder.exists ?? false;
  const primaryForwarderPath = report.forwarder.expectedPath ?? report.providers?.["claude-code"]?.forwarder.expectedPath;

  const rows = [
    [t("doctor.eventServer", "事件服务"), report.connection.serverListening ? `${t("doctor.listening", "监听")} ${report.connection.port}` : (report.connection.error ?? t("status.notListening", "未监听")), report.connection.serverListening],
    [t("doctor.recentConnection", "最近连接"), report.connection.connected ? t("doctor.eventWithin90s", "90 秒内收到事件") : t("doctor.waitingEvent", "等待 Claude Code 事件"), report.connection.connected],
    [t("doctor.hooks", "Hook 配置"), primaryHooks?.installed ? t("hooks.installed", "已安装") : `${t("doctor.missing", "缺少")} ${primaryHooks?.missingEvents.length ?? 0} ${t("common.items", "项")}`, primaryHooks?.installed ?? false],
    [t("doctor.hookCommand", "Hook 命令"), primaryHooks?.commandMatches ? t("doctor.commandMatches", "匹配当前 forwarder") : t("doctor.needsRepair", "需要修复"), primaryHooks?.commandMatches ?? false],
    ["Forwarder", primaryForwarderExists ? primaryForwarderPath : t("doctor.fileMissing", "文件不存在"), primaryForwarderExists],
    [t("doctor.autoStart", "自动启动"), report.forwarder.autoStartMarkerExists ? t("doctor.enabled", "已开启") : t("doctor.disabled", "未开启"), true],
    [t("doctor.autoUpdate", "自动更新"), report.update.autoUpdateEnabled ? t("doctor.enabled", "已开启") : t("doctor.disabled", "未开启"), true],
    [t("doctor.updateStatus", "更新状态"), updateStatusText(report, t), !report.update.error],
    [t("doctor.plugins", "插件"), `${report.plugins.enabled}/${report.plugins.total} ${t("doctor.enabledCount", "已启用")}, ${report.plugins.manifestErrors} ${t("doctor.manifestErrors", "manifest 错误")}`, report.plugins.manifestErrors === 0]
  ] as const;

  return (
    <div className="panel-group-card">
      <div className="panel-header">
        <h3 className="panel-title">{t("doctor.title", "诊断中心")}</h3>
        <button className="ghost-btn" onClick={refresh}>{t("doctor.recheck", "重新检查")}</button>
      </div>
      <div className="doctor-grid">
        {rows.map(([name, value, ok]) => (
          <div key={name} className="doctor-row">
            <strong>{name}</strong>
            <p title={String(value)}>{value}</p>
            <StatusPill ok={!!ok} label={ok ? t("doctor.ok", "OK") : t("doctor.check", "Check")} />
          </div>
        ))}
      </div>
      <div className="panel-divider" />
      <div className="doctor-summary">
        <div><strong>{t("doctor.version", "版本")}</strong><span>{report.appVersion}</span></div>
        <div><strong>{t("status.recentEvent", "最近事件")}</strong><span>{report.recent.lastEventTitle ?? t("common.none", "暂无")}</span></div>
        <div><strong>{t("doctor.generatedAt", "生成时间")}</strong><span>{new Date(report.generatedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</span></div>
      </div>
      {primaryHooks && !primaryHooks.installed && <p className="note">{t("doctor.hookHint", "可在上方 Hook 区域使用安装/修复按钮重新配置 Claude Code hooks。")}</p>}
    </div>
  );
}

