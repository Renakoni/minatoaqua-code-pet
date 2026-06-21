import { useMemo, useState } from "react";
import { PetEvent, PetState } from "../../shared/events";
import { buildStats, StatsPanel } from "./ClawdStatsPanel";
import { DoctorPanel } from "./ClawdDoctorPanel";
import { HistoryPanel } from "./ClawdHistoryPanel";
import { SourcesPanel } from "./ClawdSourcesPanel";
import { GroupCard } from "./ClawdPanelParts";
import { Pet } from "./Pet";

interface CompanionPanelProps {
  state: PetState;
  events: PetEvent[];
  startedAt: number;
  eventPort: number;
}

type SectionId = "general" | "connect" | "doctor" | "appearance" | "behavior" | "plugins" | "animation" | "data";

const stateCopy: Record<PetState, { label: string; line: string; tone: string }> = {
  idle: { label: "待机", line: "Aqua 在桌面边缘小憩", tone: "sand" },
  running: { label: "工作中", line: "正在跟随 Claude / Codex 会话", tone: "blue" },
  "permission-prompt": { label: "等待确认", line: "需要你处理一个权限请求", tone: "honey" },
  completed: { label: "完成", line: "这一轮已经处理完", tone: "green" }
};

const tabs: Array<{ id: SectionId; icon: string; label: string }> = [
  { id: "general", icon: "◇", label: "总览" },
  { id: "connect", icon: "⌁", label: "连接" },
  { id: "doctor", icon: "⌘", label: "诊断" },
  { id: "appearance", icon: "◉", label: "外观" },
  { id: "behavior", icon: "↗", label: "行为" },
  { id: "plugins", icon: "▣", label: "插件" },
  { id: "animation", icon: "✦", label: "动画" },
  { id: "data", icon: "☰", label: "数据" }
];

function timeAgo(timestamp: number | undefined, now: number) {
  if (!timestamp) return "暂无";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.floor(minutes / 60)} 小时前`;
}

function formatDuration(startedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function shortSession(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function eventMessage(event: PetEvent) {
  return event.message ?? event.detail ?? event.tool ?? stateCopy[event.event].line;
}

function countEvents(events: PetEvent[], event: PetState) {
  return events.filter(item => item.event === event).length;
}

function toolRanking(events: PetEvent[]) {
  return Object.entries(
    events.reduce<Record<string, number>>((acc, event) => {
      if (!event.tool) return acc;
      acc[event.tool] = (acc[event.tool] ?? 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

function ConnectionPill({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span className={`connection-pill ${connected ? "connected" : "waiting"}`}>
      <i />{connected ? "已连接" : "等待会话"}{label ? <small>{label}</small> : null}
    </span>
  );
}

function StatusCard({ icon, label, value, meta, tone }: { icon: string; label: string; value: string; meta?: string; tone: "good" | "bad" | "wait" | "neutral" }) {
  return (
    <article className={`status-card ${tone}`}>
      <b className="status-icon">{icon}</b>
      <span>{label}</span>
      <strong>{value}</strong>
      {meta ? <small>{meta}</small> : null}
    </article>
  );
}

function ToggleRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <button className={`toggle ${checked ? "on" : ""}`}>
      <span className="toggle-dot" />
      <span>{label}</span>
      <i />
    </button>
  );
}

function SliderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="slider-row">
      <span>{label}</span>
      <input type="range" min="0" max="100" defaultValue="72" />
      <b>{value}</b>
    </div>
  );
}

export function CompanionPanel({ state, events, startedAt, eventPort }: CompanionPanelProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [now] = useState(Date.now());
  const latest = events[0];
  const connected = Boolean(latest && Date.now() - latest.timestamp < 90_000);
  const tools = useMemo(() => toolRanking(events), [events]);
  const currentCopy = stateCopy[state];
  const sessionId = latest?.id;

  return (
    <main className="settings-shell">
      <section className="window-bar">
        <div className="window-title"><span className="window-title-icon">✦</span>Minato Aqua Code Pet</div>
        <div className="window-actions">
          <button title="最小化" onClick={() => window.petAPI?.minimizePanel()}>-</button>
          <button title="最大化/还原" onClick={() => window.petAPI?.toggleMaximizePanel()}>□</button>
          <button className="close" title="关闭面板" onClick={() => window.petAPI?.closePanel()}>×</button>
        </div>
      </section>

      <nav className="tab-bar">
        <div className="tab-mark">✦</div>
        {tabs.map(tab => (
          <button key={tab.id} className={`tab-item ${activeSection === tab.id ? "active" : ""}`} onClick={() => setActiveSection(tab.id)}>
            <span>{tab.icon}</span>{tab.label}
          </button>
        ))}
      </nav>

      <div className="section-content">
        {activeSection === "general" && <>
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Aqua Companion</p>
              <h1>{connected ? "Aqua 正在跟随 Claude / Codex 会话" : "Aqua 等待 Claude / Codex 会话接入"}</h1>
              <p className="subtle">{connected ? `最近事件：${latest?.title ?? currentCopy.label}，${timeAgo(latest?.timestamp, now)}。` : "本地监听已经准备好；启动已配置 hooks 的 Claude Code 或 Codex 会话后会自动连接。"}</p>
              <div className="hero-status-board">
                <ConnectionPill connected={connected} label={latest?.tool ?? "Claude Code / Codex"} />
                <code>{shortSession(sessionId, "无会话")}</code>
              </div>
            </div>
            <div className="mini-stage"><div className="mini-pet"><Pet state={state} /></div></div>
          </section>

          <section className="status-strip">
            <StatusCard icon="◉" label="连接状态" value={connected ? "已连接" : "等待会话"} meta={latest?.tool} tone={connected ? "good" : "wait"} />
            <StatusCard icon="◷" label="最近事件" value={latest ? timeAgo(latest.timestamp, now) : "还没收到"} tone={latest ? "good" : "wait"} />
            <StatusCard icon="◇" label="会话" value={shortSession(sessionId, "无会话")} tone="neutral" />
            <StatusCard icon="⌁" label="本地监听" value={`127.0.0.1:${eventPort}`} tone="good" />
          </section>
        </>}

        {activeSection === "connect" && <>
          <GroupCard icon="⌁" title="数据源（Sources）">
            <SourcesPanel />
          </GroupCard>
          <GroupCard icon="◉" title="连接详情">
            <div className="connection-detail-grid">
              <ConnectionDetail label="状态" value={connected ? "已连接" : "等待 Claude / Codex 会话"} />
              <ConnectionDetail label="客户端" value={latest?.tool ?? "未知客户端"} />
              <ConnectionDetail label="会话 ID" value={shortSession(sessionId, "无会话")} />
              <ConnectionDetail label="最后活动" value={latest ? timeAgo(latest.timestamp, now) : "暂无"} />
            </div>
          </GroupCard>
          <GroupCard icon="◇" title="隐私与安全">
            <div className="settings-columns compact">
              <section className="settings-group">
                <label className="field"><span>事件端口</span><input value={eventPort} readOnly /></label>
                <label className="field"><span>本地 token</span><input value="MVP local mode" readOnly /></label>
              </section>
              <section className="settings-group">
                <div className="segmented"><button className="active">safe</button><button>standard</button><button>detailed</button></div>
                <p className="note">当前版本只展示本地事件摘要，不保存完整 hook payload。</p>
              </section>
            </div>
          </GroupCard>
        </>}

        {activeSection === "doctor" && <>
          <DoctorPanel events={events} eventPort={eventPort} startedAt={startedAt} />
        </>}

        {activeSection === "appearance" && <>
          <GroupCard icon="◉" title="显示">
            <section className="settings-group theme-settings-group">
              <h3 className="panel-subtitle">界面主题</h3>
              <div className="segmented"><button>浅色</button><button>跟随系统</button><button className="active">经典</button></div>
              <p className="note">这里保留 Clawd Companion 的外观设置结构，后续接入真实配置。</p>
            </section>
            <div className="panel-divider" />
            <ToggleRow label="启用桌宠" checked />
            <ToggleRow label="始终置顶" checked />
            <ToggleRow label="显示气泡" checked />
            <ToggleRow label="显示会话标题" checked={false} />
          </GroupCard>
          <div className="section-grid-2col">
            <GroupCard title="Aqua"><SliderRow label="尺寸" value="100%" /><SliderRow label="透明" value="100%" /></GroupCard>
            <GroupCard title="卡片"><SliderRow label="尺寸" value="100%" /><SliderRow label="透明" value="92%" /></GroupCard>
          </div>
        </>}

        {activeSection === "behavior" && <>
          <GroupCard icon="↗" title="启动">
            <ToggleRow label="开机自启" checked={false} />
            <ToggleRow label="Claude Code 启动时自动启动" checked={false} />
            <ToggleRow label="启动时打开配置面板" checked={false} />
            <ToggleRow label="权限申请卡片" checked />
          </GroupCard>
          <GroupCard icon="◷" title="时间">
            <SliderRow label="气泡停留" value="8 秒" />
            <SliderRow label="工具流停留" value="1.2 秒" />
            <SliderRow label="事件历史" value="100 条" />
          </GroupCard>
        </>}

        {activeSection === "plugins" && <>
          <GroupCard icon="▣" title="插件">
            <div className="management-action-grid">
              <ActionCard title="Plugin market" detail="保留 Clawd Companion 插件市场入口。" />
              <ActionCard title="Installed plugins" detail="后续接入自定义插件 manifest。" />
              <ActionCard title="Widget area" detail="保留桌面小组件区域。" />
            </div>
          </GroupCard>
        </>}

        {activeSection === "animation" && <>
          <GroupCard icon="✦" title="待机动画">
            <div className="mapping-list">
              {Object.entries(stateCopy).map(([key, copy]) => <MappingRow key={key} source={key} title={copy.line} state={copy.label} tone={copy.tone} />)}
            </div>
          </GroupCard>
          <GroupCard icon="◇" title="动作映射">
            <div className="mapping-list">
              <MappingRow source="SessionStart" title="会话开始" state="待机" tone="sand" />
              <MappingRow source="UserPromptSubmit" title="收到用户输入" state="工作中" tone="blue" />
              <MappingRow source="Notification" title="等待确认" state="权限" tone="honey" />
              <MappingRow source="Stop" title="处理完成" state="完成" tone="green" />
            </div>
          </GroupCard>
        </>}

        {activeSection === "data" && <>
          <HistoryPanel events={events} />

          <GroupCard icon="◇" title="运行统计">
            <StatsPanel stats={buildStats(events, startedAt)} />
          </GroupCard>

          <GroupCard icon="☰" title="最近事件">
            <div className="event-list data-event-list">
              {events.length === 0 ? <div className="empty">还没有收到事件。先检查 hooks 配置，收到真实事件后这里会更新。</div> : events.map(event => (
                <article key={event.id} className="event-row">
                  <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  <strong>{event.title ?? event.event}</strong>
                  <p>{eventMessage(event)}</p>
                  <small>{timeAgo(event.timestamp, now)}</small>
                  <em>{stateCopy[event.event].label}</em>
                </article>
              ))}
            </div>
          </GroupCard>
        </>}
      </div>
    </main>
  );
}

function ConnectionDetail({ label, value }: { label: string; value: string }) {
  return <div className="connection-detail"><span>{label}</span><strong>{value}</strong></div>;
}

function DoctorRow({ label, value, status }: { label: string; value: string; status: "OK" | "WAIT" }) {
  return <div className="doctor-row"><strong>{label}</strong><p>{value}</p><span className={`doctor-pill ${status === "OK" ? "ok" : "bad"}`}>{status}</span></div>;
}

function ActionCard({ title, detail }: { title: string; detail: string }) {
  return <article className="management-action-card"><div><strong>{title}</strong><p>{detail}</p></div><button>打开</button></article>;
}

function MappingRow({ source, title, state, tone }: { source: string; title: string; state: string; tone: string }) {
  return <div className="mapping-row"><div><strong>{source}</strong><span>{title}</span></div><i /><em className={`tone-${tone}`}>{state}</em></div>;
}

function StatItem({ value, label }: { value: string; label: string }) {
  return <div className="stat-item"><span className="stat-value">{value}</span><span className="stat-label">{label}</span></div>;
}

function ToolRankRow({ pos, tool, count, max }: { pos: number; tool: string; count: number; max: number }) {
  return <div className="tool-rank-row"><span className="tool-rank-pos">{pos}</span><span className="tool-rank-name">{tool}</span><span className="tool-rank-bar"><span className="tool-rank-fill" style={{ width: `${Math.round((count / max) * 100)}%` }} /></span><span className="tool-rank-count">{count}</span></div>;
}

function Timeline({ events }: { events: PetEvent[] }) {
  if (events.length === 0) return <div className="empty">暂无时间线。</div>;
  return <div className="timeline-track">{events.slice(0, 12).map((event, index) => <span key={event.id} className={`timeline-marker ${event.event}`} style={{ left: `${(index / Math.max(1, Math.min(events.length, 12) - 1)) * 100}%` }} title={event.title ?? event.event}><span /></span>)}</div>;
}
