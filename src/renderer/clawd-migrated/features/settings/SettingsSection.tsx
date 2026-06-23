// @ts-nocheck
import React from "react";
import { Bell, Bot, Gauge, KeyRound, MonitorCheck, MousePointer2, Radio, Shield, Sparkles, Timer } from "lucide-react";
import { defaultSettings } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import minatoAquaCover from "../../../assets/themes/minato-aqua-cover.png";
import { NotificationRulesPanel } from "../../components/NotificationRulesPanel";
import { DoctorPanel } from "../../components/DoctorPanel";
import { ConnectionDetail, Field, GroupCard, LanguageSegmented, Segmented, SettingsInfoRow, Slider, ThemeSegmented, Toggle } from "../../components/workbench/Primitives";
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
            { id: "privacy", icon: <Shield size={14} />, label: t("settings.subtabs.privacy", "隐私与数据") },
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
        </>}

        {activeSettingsSubsection === "diagnostics" && <>
          <GroupCard icon={<Radio size={18} />} title={t("sections.connectionDetails", "连接详情")}>
            <div className="connection-detail-grid">
              <ConnectionDetail label={t("fields.status", "状态")} value={connection.connected ? t("status.connected", "已连接") : connection.serverListening ? t("status.waiting", "等待 Claude 会话") : t("status.notListening", "本地服务未监听")} />
              <ConnectionDetail label={t("fields.client", "客户端")} value={connection.activeClientLabel ?? t("pet.unknownClient", "未知客户端")} />
              <ConnectionDetail label={t("fields.sessionId", "会话 ID")} value={shortSession(connection.activeSessionId, t("connection.noSession", "无会话"))} />
              <ConnectionDetail label={t("fields.lastActive", "最后活动")} value={connection.lastEventAt ? timeAgo(connection.lastEventAt, now) : t("common.none", "暂无")} />
            </div>
          </GroupCard>
          <DoctorPanel />
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

          <div className="section-grid-2col">
            <GroupCard title={t("appearance.overallScale", "整体缩放")}>
              <Slider label={t("appearance.viewScale", "视图缩放")} min={0.7} max={1.45} step={0.05} value={settings.petScale} format={v => `${Math.round(v * 100)}%`} onChange={petScale => updateSettings({ petScale })} />
              <Slider label={t("appearance.viewportScale", "视窗缩放")} min={0.7} max={2.5} step={0.05} value={settings.viewScale ?? settings.petScale} format={v => `${Math.round(v * 100)}%`} onChange={viewScale => updateSettings({ viewScale })} />
              <Slider label={t("appearance.opacity", "整体透明")} min={0.45} max={1} step={0.05} value={settings.petOpacity} format={v => `${Math.round(v * 100)}%`} onChange={petOpacity => updateSettings({ petOpacity })} />
            </GroupCard>

            <GroupCard title={activePetTheme.characterName}>
              <Slider label={t("appearance.size", "尺寸")} min={0.7} max={1.35} step={0.05} value={settings.clawdScale} format={v => `${Math.round(v * 100)}%`} onChange={clawdScale => updateSettings({ clawdScale })} />
              <Slider label={t("appearance.opacity", "透明")} min={0.45} max={1} step={0.05} value={settings.clawdOpacity} format={v => `${Math.round(v * 100)}%`} onChange={clawdOpacity => updateSettings({ clawdOpacity })} />
            </GroupCard>

            <GroupCard title={t("appearance.thoughtBubble", "思维泡")}>
              <Slider label={t("appearance.size", "尺寸")} min={0.75} max={1.35} step={0.05} value={settings.thoughtScale} format={v => `${Math.round(v * 100)}%`} onChange={thoughtScale => updateSettings({ thoughtScale })} />
              <Slider label={t("appearance.opacity", "透明")} min={0.45} max={1} step={0.05} value={settings.thoughtOpacity} format={v => `${Math.round(v * 100)}%`} onChange={thoughtOpacity => updateSettings({ thoughtOpacity })} />
            </GroupCard>

            <GroupCard title={t("appearance.card", "卡片")}>
              <Slider label={t("appearance.size", "尺寸")} min={0.75} max={1.25} step={0.05} value={settings.cardScale} format={v => `${Math.round(v * 100)}%`} onChange={cardScale => updateSettings({ cardScale })} />
              <Slider label={t("appearance.opacity", "透明")} min={0.45} max={1} step={0.05} value={settings.cardOpacity} format={v => `${Math.round(v * 100)}%`} onChange={cardOpacity => updateSettings({ cardOpacity })} />
            </GroupCard>

            <GroupCard title={t("appearance.bubbleToolStream", "气泡 / 工具流")}>
              <Slider label={t("appearance.size", "尺寸")} min={0.6} max={2} step={0.05} value={settings.bubbleScale} format={v => `${Math.round(v * 100)}%`} onChange={bubbleScale => updateSettings({ bubbleScale })} />
              <Slider label={t("appearance.opacity", "透明")} min={0.45} max={1} step={0.05} value={settings.bubbleOpacity} format={v => `${Math.round(v * 100)}%`} onChange={bubbleOpacity => updateSettings({ bubbleOpacity })} />
            </GroupCard>

            <GroupCard title={t("appearance.permissionPopup", "权限弹窗")}>
              <Slider label={t("appearance.size", "尺寸")} min={0.4} max={2} step={0.05} value={settings.permissionScale} format={v => `${Math.round(v * 100)}%`} onChange={permissionScale => updateSettings({ permissionScale })} />
              <Slider label={t("appearance.opacity", "透明")} min={0.45} max={1} step={0.05} value={settings.permissionOpacity} format={v => `${Math.round(v * 100)}%`} onChange={permissionOpacity => updateSettings({ permissionOpacity })} />
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
            <Slider label={t("behavior.toolStreamStay", "工具流停留")} min={0.3} max={3} step={0.1} value={settings.toolStreamMinDuration} format={v => `${v.toFixed(1)} ${t("common.seconds", "秒")}`} onChange={toolStreamMinDuration => updateSettings({ toolStreamMinDuration })} />
          </GroupCard>
        </>}

        {activeSettingsSubsection === "privacy" && <>
          <GroupCard icon={<Shield size={18} />} title={t("sections.privacyData", "隐私与数据")}>
            <div className="settings-columns compact">
              <section className="settings-group">
                <h3 className="panel-subtitle">{t("sections.privacyMode", "隐私模式")}</h3>
                <Segmented value={settings.privacyMode} onChange={privacyMode => updateSettings({ privacyMode })} />
                <p className="note">{t("settings.privacyModeNote", "Safe mode only shows tool types; standard mode shows file names and search patterns; detailed mode can show truncated command summaries.")}</p>
              </section>
              <section className="settings-group">
                <h3 className="panel-subtitle">{t("sections.localData", "本地数据")}</h3>
                <Slider label={t("behavior.eventHistory", "事件历史")} min={12} max={100} step={4} value={settings.eventHistoryLimit} format={v => `${v} ${t("common.items", "条")}`} onChange={eventHistoryLimit => updateSettings({ eventHistoryLimit })} />
              </section>
            </div>
          </GroupCard>

          <GroupCard icon={<KeyRound size={18} />} title={t("sections.localAccess", "本地事件接入")}>
            <div className="settings-columns compact">
              <section className="settings-group">
                <Field label={t("fields.eventPort", "事件端口")}>
                  <input value={settings.port} onChange={event => updateSettings({ port: Number(event.target.value) || defaultSettings.port })} />
                </Field>
                <Field label={t("fields.localToken", "本地 token")}>
                  <input value={settings.token} onChange={event => updateSettings({ token: event.target.value })} />
                </Field>
              </section>
              <section className="settings-group">
                <SettingsInfoRow label={t("fields.status", "状态")} value={connection.serverListening ? t("status.listening", "正在监听") : t("status.notListening", "未监听")} />
                <SettingsInfoRow label={t("status.localServer", "本地监听")} value={connection.serverListening ? `127.0.0.1:${connection.port}` : t("status.notListening", "未监听")} />
                <p className="note">{t("settings.localAccessNote", "端口和 token 修改后需要重启应用才会影响本地事件入口。")}</p>
              </section>
            </div>
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
              <SettingsInfoRow label={t("status.localServer", "本地监听")} value={connection.serverListening ? `127.0.0.1:${connection.port}` : t("status.notListening", "未监听")} />
              <SettingsInfoRow label={t("fields.sessionId", "会话 ID")} value={shortSession(connection.activeSessionId, t("connection.noSession", "无会话"))} />
              <SettingsInfoRow label={t("update.status", "更新状态")} value={updateStatus.downloaded ? t("update.ready", "已下载") : updateStatus.available ? t("update.availableShort", "发现新版本") : updateStatus.upToDate ? t("update.upToDate", "已是最新版本") : updateStatus.error ? t("update.errorShort", "检查失败") : t("common.idle", "待机")} />
            </div>
          </GroupCard>
        </>}
      </div>
    </section>
  );
}
