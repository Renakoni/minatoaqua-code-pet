// @ts-nocheck
import React from "react";
import { Bell, Bot, Gauge, LockKeyhole, MessageSquareText, MonitorCheck, MousePointer2, Radio, RotateCcw, Shield, ShieldCheck, SlidersHorizontal, Sparkles, Timer } from "lucide-react";
import { defaultSettings } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import minatoAquaCover from "../../../assets/themes/minato-aqua-cover.png";
import { NotificationRulesPanel } from "../../components/NotificationRulesPanel";
import { DoctorPanel } from "../../components/DoctorPanel";
import { ConnectionDetail, GroupCard, LanguageSegmented, SettingsInfoRow, Slider, ThemeSegmented, Toggle } from "../../components/workbench/Primitives";
import { shortSession, timeAgo } from "../../utils/format";
import { getPetTheme, petThemes } from "../../utils/petThemes";

export function SettingsSection({
  settings,
  updateSettings,
  connection,
  activeSettingsSubsection,
  setActiveSettingsSubsection,
  sectionContentRef,
  locale,
  setLocale,
  now,
  appVersion,
  updateStatus,
  checkingUpdate,
  handleCheckUpdate
}: {
  settings: any;
  updateSettings: (settings: any) => void;
  connection: any;
  activeSettingsSubsection: string;
  setActiveSettingsSubsection: (section: string) => void;
  sectionContentRef: React.MutableRefObject<HTMLDivElement | null>;
  locale: string;
  setLocale: (locale: string) => void;
  now: number;
  appVersion: string;
  updateStatus: any;
  checkingUpdate: boolean;
  handleCheckUpdate: () => void;
}) {
  const { t } = useI18n();
  const activePetTheme = getPetTheme(settings.petTheme);
  const petThemeCovers: Record<string, string> = {
    "minato-aqua": minatoAquaCover
  };

  return (
    <section className="settings-page">
      <header className="settings-page-head">
        <div>
          <span>{t("settings.eyebrow", "Settings")}</span>
          <h2>Chara Desk</h2>
        </div>
        <nav className="settings-subtabs">
          {[
            { id: "general", icon: <Gauge size={14} />, label: t("settings.subtabs.general", "通用") },
            { id: "pet", icon: <Bot size={14} />, label: t("settings.subtabs.pet", "桌宠") },
            { id: "notifications", icon: <Bell size={14} />, label: t("settings.subtabs.notifications", "通知") },
            { id: "diagnostics", icon: <MonitorCheck size={14} />, label: t("settings.subtabs.diagnostics", "诊断") },
            { id: "about", icon: <Sparkles size={14} />, label: t("settings.subtabs.about", "关于") }
          ].map(tab => (
            <button
              key={tab.id}
              className={`settings-subtab ${activeSettingsSubsection === tab.id ? "active" : ""}`}
              onClick={() => {
                setActiveSettingsSubsection(tab.id);
                sectionContentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className="settings-subsection-content">
        {activeSettingsSubsection === "general" && <>
          <GroupCard icon={<Gauge size={18} />} title={t("sections.basicPreferences", "基础偏好")}>
            <section className="settings-group theme-settings-group">
              <h3 className="panel-subtitle">{t("sections.theme", "界面主题")}</h3>
              <div className="theme-style-row">
                <ThemeSegmented value={settings.theme ?? "system"} onChange={theme => updateSettings({ theme })} />
                <LanguageSegmented value={settings.language === "auto" ? locale : settings.language ?? locale} onChange={language => {
                  updateSettings({ language });
                  setLocale(language);
                }} />
              </div>
            </section>
          </GroupCard>

          <GroupCard icon={<MousePointer2 size={18} />} title={t("sections.startup", "启动与更新")}>
            <Toggle label={t("behavior.launchAtLogin", "开机自启")} checked={settings.launchAtLogin} onChange={launchAtLogin => updateSettings({ launchAtLogin })} />
            <Toggle label={t("behavior.autoStartWithCli", "Claude Code 启动时自动启动")} checked={settings.autoStartWithCli} onChange={autoStartWithCli => updateSettings({ autoStartWithCli })} />
            <Toggle label={t("behavior.autoUpdate", "启动时自动检查更新")} checked={settings.autoUpdateEnabled} onChange={autoUpdateEnabled => updateSettings({ autoUpdateEnabled })} />
            <Toggle label={t("behavior.openSettingsOnStart", "启动时打开配置面板")} checked={settings.openSettingsOnStart} onChange={openSettingsOnStart => updateSettings({ openSettingsOnStart })} />
          </GroupCard>

          <GroupCard icon={<Shield size={18} />} title={t("sections.contentDisplay", "内容显示")}>
            <Toggle label={t("appearance.hideSensitiveContent", "隐藏敏感内容")} checked={settings.hideSensitiveContent} onChange={hideSensitiveContent => updateSettings({ hideSensitiveContent })} />
            <p className="note">{t("appearance.hideSensitiveContentNote", "隐藏界面和系统通知中的路径与内容；权限确认仍显示决策所需详情。")}</p>
          </GroupCard>
        </>}

        {activeSettingsSubsection === "diagnostics" && <>
          <GroupCard icon={<Radio size={18} />} title={t("sections.connectionDetails", "连接详情")}>
            <div className="connection-detail-grid">
              <ConnectionDetail label={t("status.localServer", "本地监听")} value={connection.serverListening ? `127.0.0.1:${connection.port}` : t("status.notListening", "未监听")} />
              <ConnectionDetail label={t("fields.client", "客户端")} value={connection.activeClientLabel ?? t("pet.unknownClient", "未知客户端")} />
              <ConnectionDetail label={t("fields.sessionId", "会话 ID")} value={shortSession(connection.activeSessionId, t("connection.noSession", "无会话"))} />
              <ConnectionDetail label={t("fields.lastActive", "最后活动")} value={connection.lastEventAt ? timeAgo(connection.lastEventAt, now) : t("common.none", "暂无")} />
            </div>
          </GroupCard>
          <DoctorPanel hideSensitiveContent={settings.hideSensitiveContent} />
        </>}

        {activeSettingsSubsection === "pet" && <>
          <GroupCard icon={<Bot size={18} />} title={t("sections.petDisplay", "桌宠显示")}>
            <Toggle label={t("appearance.enablePet", "启用桌宠")} checked={settings.petEnabled} onChange={petEnabled => updateSettings({ petEnabled })} />
            <Toggle label={t("appearance.alwaysOnTop", "始终置顶")} checked={settings.alwaysOnTop} onChange={alwaysOnTop => updateSettings({ alwaysOnTop })} />
            <Toggle label={t("appearance.showBubbles", "显示气泡")} checked={settings.showBubbles} onChange={showBubbles => updateSettings({ showBubbles })} />
          </GroupCard>

          <GroupCard icon={<Sparkles size={18} />} title={t("sections.petTheme", "桌宠选择")}>
            <div className="pet-theme-grid">
              {petThemes.map(theme => (
                <button
                  key={theme.id}
                  type="button"
                  className={`pet-theme-card ${activePetTheme.id === theme.id ? "active" : ""}`}
                  onClick={() => updateSettings({ petTheme: theme.id })}
                >
                  <img src={petThemeCovers[theme.id]} alt="" draggable={false} />
                  <span className="pet-theme-card-copy">
                    <strong>{theme.displayName}</strong>
                    <small>{theme.characterName}</small>
                  </span>
                </button>
              ))}
            </div>
          </GroupCard>

          <div className="pet-display-controls">
            <GroupCard
              className="pet-display-group pet-display-group-primary"
              icon={<SlidersHorizontal size={17} />}
              title={t("appearance.petAppearance", "桌宠外观")}
              action={<button type="button" className="group-reset-button" title={t("common.reset", "重置")} aria-label={t("common.reset", "重置")} disabled={settings.petScale === defaultSettings.petScale && settings.clawdScale === defaultSettings.clawdScale && settings.clawdOpacity === defaultSettings.clawdOpacity} onClick={() => updateSettings({ petScale: defaultSettings.petScale, clawdScale: defaultSettings.clawdScale, clawdOpacity: defaultSettings.clawdOpacity })}><RotateCcw size={14} /></button>}
            >
              <Slider label={t("appearance.petSize", "桌宠大小")} min={0.7} max={1.35} step={0.05} value={settings.petScale} format={v => `${Math.round(v * 100)}%`} onChange={petScale => updateSettings({ petScale })} />
              <Slider label={t("appearance.petOpacity", "桌宠透明度")} min={0.5} max={1} step={0.05} value={settings.clawdOpacity} format={v => `${Math.round(v * 100)}%`} onChange={clawdOpacity => updateSettings({ clawdOpacity })} />
            </GroupCard>

            <GroupCard
              className={`pet-display-group${settings.showBubbles ? "" : " pet-display-group-disabled"}`}
              icon={<MessageSquareText size={17} />}
              title={t("appearance.statusFeedback", "状态反馈")}
              action={<button type="button" className="group-reset-button" title={t("common.reset", "重置")} aria-label={t("common.reset", "重置")} disabled={!settings.showBubbles || (settings.feedbackScale === defaultSettings.feedbackScale && settings.feedbackOpacity === defaultSettings.feedbackOpacity)} onClick={() => updateSettings({ feedbackScale: defaultSettings.feedbackScale, feedbackOpacity: defaultSettings.feedbackOpacity })}><RotateCcw size={14} /></button>}
            >
              <Slider disabled={!settings.showBubbles} label={t("appearance.feedbackSize", "反馈大小")} min={0.75} max={1.35} step={0.05} value={settings.feedbackScale} format={v => `${Math.round(v * 100)}%`} onChange={feedbackScale => updateSettings({ feedbackScale })} />
              <Slider disabled={!settings.showBubbles} label={t("appearance.feedbackOpacity", "反馈透明度")} min={0.5} max={1} step={0.05} value={settings.feedbackOpacity} format={v => `${Math.round(v * 100)}%`} onChange={feedbackOpacity => updateSettings({ feedbackOpacity })} />
            </GroupCard>

            <GroupCard
              className="pet-display-group"
              icon={<ShieldCheck size={17} />}
              title={t("appearance.permissionConfirmation", "权限确认")}
              action={<button type="button" className="group-reset-button" title={t("common.reset", "重置")} aria-label={t("common.reset", "重置")} disabled={settings.permissionScale === defaultSettings.permissionScale} onClick={() => updateSettings({ permissionScale: defaultSettings.permissionScale })}><RotateCcw size={14} /></button>}
            >
              <Slider label={t("appearance.permissionCardSize", "权限卡片大小")} min={0.85} max={1.25} step={0.05} value={settings.permissionScale} format={v => `${Math.round(v * 100)}%`} onChange={permissionScale => updateSettings({ permissionScale })} />
              <div className="pet-display-fixed-row">
                <span>{t("appearance.opacity", "透明度")}</span>
                <strong><LockKeyhole size={13} aria-hidden="true" />100%</strong>
              </div>
            </GroupCard>
          </div>

          <GroupCard title={t("sections.multiSession", "多会话模式")}>
            <Toggle label={<span className="toggle-label-with-badge">{t("behavior.enableMultiSession", "启用多会话")}<sup className="beta-badge">{t("behavior.testing", "测试中")}</sup></span>} checked={settings.multiSessionEnabled} onChange={multiSessionEnabled => updateSettings({ multiSessionEnabled })} />
            {settings.multiSessionEnabled && (
              <Slider label={t("behavior.companionScale", "小 Clawd 缩放")} min={0.3} max={0.8} step={0.05} value={settings.companionScale} format={v => `${Math.round(v * 100)}%`} onChange={companionScale => updateSettings({ companionScale })} />
            )}
          </GroupCard>
        </>}

        {activeSettingsSubsection === "notifications" && <>
          <GroupCard icon={<Bell size={18} />} title={t("sections.sound", "通知和音效")}>
            <NotificationRulesPanel settings={settings} updateSettings={updateSettings} />
          </GroupCard>

          <GroupCard icon={<Timer size={18} />} title={t("sections.time", "时间与提示")}>
            <Toggle label={t("behavior.permissionDialog", "权限申请卡片")} checked={settings.permissionDialogEnabled} onChange={permissionDialogEnabled => updateSettings({ permissionDialogEnabled })} />
            <Slider label={t("behavior.bubbleStay", "气泡停留")} min={3} max={18} step={1} value={settings.bubbleDuration} format={v => `${v} ${t("common.seconds", "秒")}`} onChange={bubbleDuration => updateSettings({ bubbleDuration })} />
            <Slider label={t("behavior.permissionWait", "权限等待")} min={5} max={60} step={5} value={settings.permissionWaitSeconds} format={v => `${v} ${t("common.seconds", "秒")}`} onChange={permissionWaitSeconds => updateSettings({ permissionWaitSeconds })} />
            <Slider label={t("behavior.toolStreamStay", "工具流停留")} min={0.3} max={3} step={0.1} value={settings.toolStreamMinDuration} format={v => `${v.toFixed(1)} ${t("common.seconds", "秒")}`} onChange={toolStreamMinDuration => updateSettings({ toolStreamMinDuration })} />
          </GroupCard>
        </>}

        {activeSettingsSubsection === "about" && <>
          <GroupCard icon={<Sparkles size={18} />} title={t("settings.about.title", "关于 Chara Desk")}>
            <div className="settings-about-panel">
              <div className="settings-about-mark">Aqua</div>
              <div className="settings-about-copy">
                <strong>Chara Desk</strong>
                <span>{t("settings.about.description", "面向 Claude Code 的本地桌宠和工作台。")}</span>
              </div>
              <div className="settings-about-actions">
                <button className="inline-action" onClick={() => window.companion.openExternal("https://github.com/Renakoni/minatoaqua-code-pet")}>GitHub</button>
                <button className="inline-action" onClick={handleCheckUpdate} disabled={checkingUpdate || updateStatus.checking || updateStatus.downloading}>
                  {checkingUpdate || updateStatus.checking ? t("update.checkShort", "检查中...") : t("update.check", "检查更新")}
                </button>
              </div>
            </div>
            <div className="settings-info-list">
              <SettingsInfoRow label={t("settings.about.version", "版本")} value={`v${appVersion}`} />
              <SettingsInfoRow label={t("settings.about.product", "产品定位")} value={t("settings.about.productValue", "Claude Code 桌宠与本地控制面板")} />
              <SettingsInfoRow label={t("fields.sessionId", "会话 ID")} value={shortSession(connection.activeSessionId, t("connection.noSession", "无会话"))} />
              <SettingsInfoRow label={t("update.status", "更新状态")} value={updateStatus.downloaded ? t("update.ready", "已下载") : updateStatus.available ? t("update.availableShort", "发现新版本") : updateStatus.upToDate ? t("update.upToDate", "已是最新版本") : updateStatus.error ? t("update.errorShort", "检查失败") : t("common.idle", "待机")} />
            </div>
          </GroupCard>
        </>}
      </div>
    </section>
  );
}
