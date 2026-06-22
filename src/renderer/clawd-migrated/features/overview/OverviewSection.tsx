// @ts-nocheck
import React from "react";
import { MonitorCheck, Radio, Shield, Timer, Wrench } from "lucide-react";
import { useI18n } from "../../useI18n";
import { ClaudeRoutingPanel } from "../../components/claude-routing/ClaudeRoutingPanel";
import { HooksManager, type HookSetupStage, type HookStatus } from "../../components/hooks/HooksManager";
import { StatusCard } from "../../components/workbench/Primitives";
import { shortSession, timeAgo } from "../../utils/format";

export function OverviewSection({
  settings,
  updateSettings,
  connection,
  now,
  shouldRenderHookSetup,
  hookSetupShowingSuccess,
  hookSetupStage,
  hookSetupNeedsAttention,
  onHookStatusChange,
  onHookInstallSuccess
}: {
  settings: any;
  updateSettings: (settings: any) => void;
  connection: any;
  now: number;
  shouldRenderHookSetup: boolean;
  hookSetupShowingSuccess: boolean;
  hookSetupStage: HookSetupStage;
  hookSetupNeedsAttention: boolean;
  onHookStatusChange: (status: HookStatus) => void;
  onHookInstallSuccess: (status: HookStatus) => void;
}) {
  const { t } = useI18n();

  return (
    <section className="overview-workbench">
      {shouldRenderHookSetup && <section className={`onboarding-card overview-steps-card hook-setup-card ${hookSetupShowingSuccess ? "install-success" : ""} ${hookSetupStage === "hiding" && !hookSetupNeedsAttention ? "closing" : ""}`}>
        <div className="onboarding-content overview-welcome-content">
          <h3>{hookSetupShowingSuccess ? t("main.hooksInstallSuccess", "连接完成") : t("main.connectTitle", "连接 Claude Code")}</h3>
          <HooksManager compact success={hookSetupShowingSuccess} onStatusChange={onHookStatusChange} onInstallSuccess={onHookInstallSuccess} />
        </div>
      </section>}

      <ClaudeRoutingPanel settings={settings} updateSettings={updateSettings} connection={connection} />
      {connection.error ? <section className="connection-error"><Wrench size={18} />{connection.error}</section> : null}

      <section className="overview-status-panel">
        <header className="workbench-section-head">
          <div>
            <span>{t("settings.tabs.general", "总览")}</span>
            <h2>{t("sections.connectionDetails", "连接详情")}</h2>
          </div>
          <span className={`overview-state-badge ${connection.connected ? "good" : connection.serverListening ? "wait" : "bad"}`}>
            {connection.connected ? t("status.connected", "已连接") : connection.serverListening ? t("status.waiting", "等待会话") : t("status.notListening", "未监听")}
            {connection.activeClientLabel ? <small>{connection.activeClientLabel}</small> : null}
          </span>
        </header>
        <div className="overview-status-grid">
          <StatusCard icon={<Radio size={18} />} label={t("status.connection", "连接状态")} value={connection.connected ? t("status.connected", "已连接") : connection.serverListening ? t("status.waiting", "等待会话") : t("status.notListening", "未监听")} meta={connection.activeClientLabel} tone={connection.connected ? "good" : connection.serverListening ? "wait" : "bad"} />
          <StatusCard icon={<Timer size={18} />} label={t("status.recentEvent", "最近事件")} value={connection.lastEventAt ? timeAgo(connection.lastEventAt, now) : t("status.noEvent", "还没收到")} tone={connection.lastEventAt ? "good" : "wait"} />
          <StatusCard icon={<Shield size={18} />} label={t("status.session", "会话")} value={shortSession(connection.activeSessionId, t("connection.noSession", "无会话"))} tone="neutral" />
          <StatusCard icon={<MonitorCheck size={18} />} label={t("status.localServer", "本地监听")} value={connection.serverListening ? `127.0.0.1:${connection.port}` : t("status.notListening", "未监听")} tone={connection.serverListening ? "good" : "bad"} />
        </div>
      </section>
    </section>
  );
}
