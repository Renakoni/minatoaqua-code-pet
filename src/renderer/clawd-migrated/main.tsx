// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  Bell,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Code2,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  Gauge,
  KeyRound,
  Layers3,
  MonitorCheck,
  MousePointer2,
  PlugZap,
  Radio,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Timer,
  Wand2,
  Wrench,
  Zap,
  X
} from "lucide-react";
import type { CompanionEvent, CompanionSettings, CompanionSession, FeedbackMode, IdleAnimConfig, PetState, PrivacyMode, PermissionRequest, PluginWidgetDescriptor, ToolName, UpdateStatus } from "../shared/events";
import { defaultSettings, stateFromEvent, type EventHistoryEntry, type NotificationRule, type CustomPlugin, type MonitorPosition } from "../shared/events";
import clawdImage from "./clawd.png";
import "./clawd-sprites/sprites.css";
import "./styles.css";
import { I18nProvider, useI18n, detectLocale } from "./useI18n";
import { useCompanion, type ToolStream } from "./useCompanion";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SessionStatsDashboard } from "./components/SessionStatsDashboard";
import { TimelinePanel } from "./components/TimelinePanel";
import { PermissionCard } from "./components/PermissionCard";
import { PluginSpriteLoader } from "./components/PluginSpriteLoader";
import { PluginsPage } from "./components/plugins/PluginsPage";
import { SessionsPage } from "./components/sessions/SessionsPage";
import { ClaudeRoutingPanel } from "./components/claude-routing/ClaudeRoutingPanel";
import { PluginPomodoroWidget } from "./components/plugins/widgets/PluginPomodoroWidget";
import { NotificationRulesPanel } from "./components/NotificationRulesPanel";
import { MonitorSettings } from "./components/MonitorSettings";
import { DoctorPanel } from "./components/DoctorPanel";
import { StatsPanel } from "./components/StatsPanel";

const clawdGifName: Record<PetState, string> = {
  idle: "clawd_png_idle",
  thinking: "thinking_speech",
  tool_read: "thinking_speech",
  tool_edit: "working_hardhat",
  tool_bash: "headset_focus",
  tool_search: "thinking_speech",
  tool_mcp: "thinking_speech",
  skill: "idea_bulb",
  task: "idea_bulb",
  agent: "welding_work",
  waiting_permission: "permission_prompt",
  done: "celebrate_bunny",
  error: "error_dead"
};

const stateCopy: Record<PetState, { label: string; line: string; tone: string }> = {
  idle: { label: "待机", line: "Clawd 在桌面边缘小憩", tone: "sand" },
  thinking: { label: "思考中", line: "正在整理上下文", tone: "blue" },
  tool_read: { label: "读取", line: "正在看文件", tone: "green" },
  tool_edit: { label: "编辑", line: "正在改代码", tone: "coral" },
  tool_bash: { label: "终端", line: "正在执行命令", tone: "ink" },
  tool_search: { label: "搜索", line: "正在检索线索", tone: "blue" },
  tool_mcp: { label: "MCP", line: "正在调用 MCP 工具", tone: "blue" },
  skill: { label: "技能", line: "正在使用技能", tone: "honey" },
  task: { label: "任务", line: "正在处理任务", tone: "steel" },
  agent: { label: "子代理", line: "正在调用子代理", tone: "steel" },
  waiting_permission: { label: "等待确认", line: "需要你处理一个确认", tone: "honey" },
  done: { label: "完成", line: "这一轮已经处理完", tone: "green" },
  error: { label: "出错", line: "刚才有一步失败了", tone: "coral" }
};

const stateFeedbackMode: Record<PetState, FeedbackMode> = {
  idle: "card",
  thinking: "card",
  tool_read: "thought",
  tool_edit: "card",
  tool_bash: "thought",
  tool_search: "thought",
  tool_mcp: "thought",
  skill: "thought",
  task: "thought",
  agent: "thought",
  waiting_permission: "card",
  done: "card",
  error: "card"
};

function getFeedbackMode(event: CompanionEvent): FeedbackMode {
  if (event.tool && event.tool !== "Unknown") return "ribbon";
  return stateFeedbackMode[stateFromEvent(event)] ?? "card";
}

function applyTheme(theme: CompanionSettings["theme"]) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    return;
  }
  if (theme === "system") {
    document.documentElement.setAttribute("data-theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    return;
  }
  document.documentElement.setAttribute("data-theme", "light");
}

function applyUiStyle(uiStyle: CompanionSettings["uiStyle"]) {
  document.documentElement.setAttribute("data-ui-style", uiStyle);
}

const mappingRows: Array<{ source: string; tool?: string; state: PetState; title: string }> = [
  { source: "SessionStart", state: "thinking", title: "会话开始" },
  { source: "UserPromptSubmit", state: "thinking", title: "收到用户输入" },
  { source: "PreToolUse", tool: "Read / Notebook", state: "tool_read", title: "读取文件" },
  { source: "PreToolUse", tool: "Edit / Write", state: "tool_edit", title: "修改文件" },
  { source: "PreToolUse", tool: "Bash", state: "tool_bash", title: "执行命令" },
  { source: "PreToolUse", tool: "Grep / Glob / WebFetch / WebSearch", state: "tool_search", title: "搜索资料" },
  { source: "PreToolUse", tool: "MCP", state: "tool_mcp", title: "MCP 工具" },
  { source: "PreToolUse", tool: "Skill", state: "skill", title: "技能调用" },
  { source: "PreToolUse", tool: "Task", state: "task", title: "任务处理" },
  { source: "PreToolUse", tool: "Agent", state: "agent", title: "子代理调用" },
  { source: "PreToolUse", tool: "AskUserQuestion", state: "thinking", title: "等待选择" },
  { source: "Notification", state: "waiting_permission", title: "等待确认" },
  { source: "Stop", state: "done", title: "处理完成" },
  { source: "转发失败", state: "error", title: "异常提示" }
];

function makeEvent(event: CompanionEvent["event"], source: CompanionEvent["source"], title: string, message: string, tool?: CompanionEvent["tool"]): CompanionEvent {
  return {
    id: crypto.randomUUID(),
    source,
    event,
    tool,
    title,
    message,
    timestamp: Date.now()
  };
}

type PluginWidgetInstance = {
  plugin: CustomPlugin;
  widget: PluginWidgetDescriptor;
  widgetKey: string;
};

function getPluginWidgets(settings: CompanionSettings): PluginWidgetInstance[] {
  return (settings.customPlugins ?? []).filter(plugin => plugin.enabled).flatMap(plugin =>
    (plugin.manifest?.widgets ?? []).map(widget => ({ plugin, widget, widgetKey: widget.positionKey ?? widget.type }))
  );
}

function getPluginWidgetOffset(settings: CompanionSettings, plugin: CustomPlugin, widgetKey: string): { x: number; y: number } {
  return plugin.widgetOffsets?.[widgetKey] ?? settings.positionOffsets?.pomodoro ?? defaultSettings.positionOffsets?.pomodoro ?? { x: 735, y: -5 };
}

function PetApp() {
  const { t } = useI18n();
  const { settings, updateSettings, currentEvent, petState, toolStreams, activePermissions, sessions, exitingSessions, mainSessionId, companionSlotRef, connection, respondToPermission } = useCompanion({ keepEventList: false });
  const editMode = settings.editPosition;
  const dragging = useRef<string | null>(null);
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number }>({ mx: 0, my: 0, ox: 0, oy: 0 });
  const offRef = useRef(settings.positionOffsets ?? {});
  const [randomBubble, setRandomBubble] = useState<string | null>(null);
  const idleTimers = useRef<number[]>([]);

  // Git 操作气泡：触发时在 Clawd 头顶弹出，2.2 秒后自动消失
  const [gitToast, setGitToast] = useState<{ id: string; title: string; message: string } | null>(null);
  const gitToastTimer = useRef<number | null>(null);
  useEffect(() => {
    const off = window.companion.onEvent(event => {
      if (event.event !== "git_operation") return;
      if (gitToastTimer.current) window.clearTimeout(gitToastTimer.current);
      setGitToast({ id: event.id, title: event.title, message: event.message });
      gitToastTimer.current = window.setTimeout(() => setGitToast(null), 2200);
    });
    return () => {
      off();
      if (gitToastTimer.current) window.clearTimeout(gitToastTimer.current);
    };
  }, []);

  // HTML5 Audio 播放音效
  useEffect(() => {
    const off = window.companion.onPlaySound((dataUrl) => {
      try { const a = new Audio(dataUrl); a.volume = settings.sound.volume; a.play(); } catch { /* ignore */ }
    });
    return () => off();
  }, []);

  // 同步计算有效待机气泡（渲染时直接计算，避免 useEffect 时序问题）
  const mainIdle = (settings as any).mainClawdIdleAnimation ?? "random";
  // 只检查非退出中的活跃会话，避免 exitingSessions 残留导致 hasActiveSession 误判
  const hasActiveSession = sessions.some(s => s.isActive && !exitingSessions.has(s.sessionId));
  const isToolState = petState.startsWith("tool_") || petState === "waiting_permission";
  const isTerminalState = petState === "done" || petState === "error";

  let effectiveIdleBubble: string | null = null;
  if (!isToolState && !isTerminalState && !editMode) {
    if (mainIdle !== "random" && hasActiveSession) {
      effectiveIdleBubble = mainIdle;
    } else if (settings.idleAnim?.enabled && petState === "idle") {
      effectiveIdleBubble = randomBubble;
    }
  }

  // 随机动画定时器（仅管理随机模式的定时播放）
  useEffect(() => {
    const cfg = settings.idleAnim;
    if (!cfg?.enabled || petState !== "idle" || editMode || mainIdle !== "random") {
      setRandomBubble(null);
      idleTimers.current.forEach(clearTimeout);
      idleTimers.current = [];
      return;
    }
    const pool = cfg.selectedSprites.length > 0 ? cfg.selectedSprites : ["idle"];
    function playBatch() {
      const sprite = pool[Math.floor(Math.random() * pool.length)];
      const range = cfg!.repeatMax - cfg!.repeatMin;
      const repeats = cfg!.repeatMin + (range > 0 ? Math.floor(Math.random() * (range + 1)) : 0);
      let count = 0;
      function show() {
        setRandomBubble(sprite);
        const t = window.setTimeout(() => {
          setRandomBubble(null);
          count++;
          if (count < repeats) {
            idleTimers.current = [window.setTimeout(show, 1500)];
          } else {
            scheduleNext();
          }
        }, 2500);
        idleTimers.current = [t];
      }
      show();
    }
    function scheduleNext() {
      const iMin = cfg!.intervalMin * 1000;
      const iMax = cfg!.intervalMax * 1000;
      const delay = iMin + Math.random() * (iMax - iMin);
      idleTimers.current = [window.setTimeout(playBatch, delay)];
    }
    scheduleNext();
    return () => { idleTimers.current.forEach(clearTimeout); idleTimers.current = []; };
  }, [petState, editMode, settings.idleAnim, mainIdle]);

  // 同步 effectiveIdleBubble 到设置面板
  useEffect(() => {
    void window.companion.syncIdleBubble(effectiveIdleBubble);
  }, [effectiveIdleBubble]);

  useEffect(() => {
    const selector = editMode
      ? ".edit-zone, .zone-resize, .edge-handle, .edit-zone-companion"
      : settings.clickThrough
        ? ".perm-card, .plugin-widget, .pomodoro-widget"
        : ".clawd, .bubble-wrapper, .tool-streams, .permission-card-wrapper, .perm-card, .plugin-widget, .pomodoro-widget";
    let isInteractive = false;
    const setInteractive = (next: boolean) => {
      if (isInteractive === next) return;
      isInteractive = next;
      void window.companion.setPetInteractive(next);
    };
    const handle = (e: MouseEvent) => {
      if (dragging.current) return;
      const target = e.target as HTMLElement;
      setInteractive(!!target.closest(selector));
    };
    const leave = () => setInteractive(false);

    void window.companion.setPetInteractive(false);
    window.addEventListener('mousemove', handle);
    window.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('mousemove', handle);
      window.removeEventListener('mouseleave', leave);
      if (isInteractive) void window.companion.setPetInteractive(false);
    };
  }, [editMode, settings.clickThrough]);

  const offsetsRef = useRef(settings.positionOffsets ?? {});
  const scaleRef = useRef({ clawd: settings.clawdScale, bubble: settings.thoughtScale, ribbon: settings.bubbleScale, permission: settings.permissionScale });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const key = dragging.current;
      if (!key) return;
      const { mx, my, ox, oy } = dragStart.current;
      if (key.startsWith("resize-")) {
        const zoneKey = key.slice(7);
        if (zoneKey === "clawd") {
          updateSettings({ clawdScale: Math.max(0.6, Math.min(2, ox + (e.clientX - mx) / 226)) });
        } else if (zoneKey === "bubble") {
          const ns = Math.max(0.6, Math.min(2, oy + (e.clientY - my) / 106));
          updateSettings({ thoughtScale: ns, cardScale: ns });
        } else if (zoneKey === "ribbon") {
          updateSettings({ bubbleScale: Math.max(0.6, Math.min(2, ox + (e.clientX - mx) / 144)) });
        } else if (zoneKey === "permission") {
          updateSettings({ permissionScale: Math.max(0.4, Math.min(2, ox + (e.clientX - mx) / 240)) });
        } else if (zoneKey.startsWith("edge")) {
          const ws = ox + (e.clientX - mx + e.clientY - my) / 800;
          updateSettings({ viewScale: Math.max(0.7, Math.min(2.5, ws)) });
        }
      } else if (key === "view" || key === "pet") {
        const nx = ox + e.clientX - mx;
        const ny = oy + e.clientY - my;
        const p = offsetsRef.current;
        updateSettings({ positionOffsets: { ...p, view: { x: nx, y: ny } } });
      } else if (key.startsWith("pluginWidget:")) {
        const [, pluginId, widgetKey] = key.split(":");
        const nx = ox + e.clientX - mx;
        const ny = oy + e.clientY - my;
        updateSettings({
          customPlugins: (settings.customPlugins ?? []).map(plugin => plugin.id === pluginId
            ? { ...plugin, widgetOffsets: { ...(plugin.widgetOffsets ?? {}), [widgetKey]: { x: nx, y: ny } } }
            : plugin)
        });
      } else {
        const nx = ox + e.clientX - mx;
        const ny = oy + e.clientY - my;
        const p = offsetsRef.current;
        updateSettings({ positionOffsets: { ...p, [key]: { x: nx, y: ny } } });
      }
    };
    const up = () => { dragging.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [settings.customPlugins]);

  useEffect(() => { offsetsRef.current = settings.positionOffsets ?? {}; }, [settings.positionOffsets]);
  useEffect(() => { scaleRef.current = { clawd: settings.clawdScale, bubble: settings.thoughtScale, ribbon: settings.bubbleScale, permission: settings.permissionScale }; }, [settings.clawdScale, settings.thoughtScale, settings.bubbleScale, settings.permissionScale]);

  const offsets = settings.positionOffsets ?? {};
  const viewOff = offsets.view ?? { x: 0, y: 0 };
  const pluginWidgets = getPluginWidgets(settings);

  const permCardRef = useRef<HTMLDivElement>(null);
  const lastPermissionRect = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const clearRect = () => {
      if (!lastPermissionRect.current) return;
      lastPermissionRect.current = null;
      void window.companion.updatePermissionCardRect(null);
    };
    if (activePermissions.length === 0) {
      clearRect();
      return;
    }

    let frame = 0;
    const report = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = permCardRef.current;
        if (!el) return;
        const { x, y, width, height } = el.getBoundingClientRect();
        const next = { x, y, width, height };
        const prev = lastPermissionRect.current;
        if (prev && Math.abs(prev.x - x) < 1 && Math.abs(prev.y - y) < 1 && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) return;
        lastPermissionRect.current = next;
        void window.companion.updatePermissionCardRect(next);
      });
    };

    report();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(report);
    if (permCardRef.current) observer?.observe(permCardRef.current);
    window.addEventListener("resize", report);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", report);
      clearRect();
    };
  }, [activePermissions[0]?.id, activePermissions[0]?.toolDetail, activePermissions.length, offsets.permission?.x, offsets.permission?.y, settings.permissionScale]);

  const editPreviewEvent = useMemo(
    () => makeEvent("tool_start", "manual", t("pet.editPreviewTitle", "Edit mode preview"), t("pet.editPreviewMessage", "This is where the pet card or bubble is displayed."), "Edit"),
    [t]
  );
  const editPreviewStreams = useMemo(
    () => [{ event: makeEvent("tool_start", "manual", t("pet.toolIndicatorPreviewTitle", "Tool indicator preview"), t("pet.toolIndicatorPreviewMessage", "Preview position for the Edit tool indicator."), "Edit"), exiting: false, slot: 0 }],
    [t]
  );
  const editPreviewPermission = useMemo(
    () => ({ id: "preview", toolName: "Bash" as ToolName, toolDetail: t("pet.permissionPreviewDetail", "Preview permission card position"), timestamp: Date.now(), rawPayload: {} }),
    [t]
  );

  if (!settings.petEnabled) return <main className="pet-stage pet-disabled" />;

  function begin(k: string, e: React.MouseEvent) {
    if (!editMode) return;
    e.stopPropagation();
    dragging.current = k;
    if (k === "view") {
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: viewOff.x, oy: viewOff.y };
    } else if (k.startsWith("pluginWidget:")) {
      const [, pluginId, widgetKey] = k.split(":");
      const plugin = (settings.customPlugins ?? []).find(item => item.id === pluginId);
      const current = plugin ? getPluginWidgetOffset(settings, plugin, widgetKey) : { x: 0, y: 0 };
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: current.x, oy: current.y };
    } else {
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: offsets[k as keyof typeof offsets]?.x ?? 0, oy: offsets[k as keyof typeof offsets]?.y ?? 0 };
    }
  }

  function beginPluginWidgetDrag(pluginId: string, widgetKey: string, e: React.MouseEvent | React.PointerEvent) {
    e.stopPropagation();
    const plugin = (settings.customPlugins ?? []).find(item => item.id === pluginId);
    const current = plugin ? getPluginWidgetOffset(settings, plugin, widgetKey) : { x: 0, y: 0 };
    dragging.current = `pluginWidget:${pluginId}:${widgetKey}`;
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: current.x, oy: current.y };
  }

  function beginResize(k: string, e: React.MouseEvent) {
    if (!editMode) return;
    e.stopPropagation();
    dragging.current = `resize-${k}`;
    if (k.startsWith("edge")) {
      const vs = settings.viewScale ?? settings.petScale;
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: vs, oy: vs };
    } else {
      const s = scaleRef.current;
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: s[k as keyof typeof s] ?? 1, oy: s[k as keyof typeof s] ?? 1 };
    }
  }

  function beginNormalDrag(e: React.MouseEvent) {
    if (editMode || settings.clickThrough) return;
    const target = e.target as HTMLElement;
    if (target.closest(".plugin-widget, .pomodoro-widget, button, input, select, textarea")) return;
    dragging.current = "pet";
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: viewOff.x, oy: viewOff.y };
  }

  if (editMode) {
    const previewEvent = currentEvent ?? editPreviewEvent;
    const previewState = currentEvent ? petState : stateFromEvent(previewEvent);
    const previewStreams = toolStreams.length > 0 ? toolStreams : editPreviewStreams;
    const bubbleMode = getFeedbackMode(previewEvent);
    const cw = Math.round(226 * settings.clawdScale);
    const ch = Math.round(238 * settings.clawdScale);
    const bw = Math.round((bubbleMode === "thought" ? 172 : 234) * (bubbleMode === "thought" ? settings.thoughtScale : settings.cardScale));
    const bh = Math.round((bubbleMode === "thought" ? 82 : 124) * (bubbleMode === "thought" ? settings.thoughtScale : settings.cardScale));
    const bx = bubbleMode === "thought" ? Math.round(226 - 6 - bw) : -4;
    const by = bubbleMode === "thought" ? 84 : 10;
    const rw = Math.round(144 * settings.bubbleScale);
    const rh = Math.round(144 * settings.bubbleScale);
    const pw = Math.round(240 * settings.permissionScale);
    const ph = Math.round(140 * settings.permissionScale);

    return (
      <main className="pet-stage edit-mode"
        onMouseDown={e => { if (e.target === e.currentTarget) begin("view", e); }}>
        <span className="edge-handle edge-n" onMouseDown={e => beginResize("edgeN", e)} />
        <span className="edge-handle edge-s" onMouseDown={e => beginResize("edgeS", e)} />
        <span className="edge-handle edge-e" onMouseDown={e => beginResize("edgeE", e)} />
        <span className="edge-handle edge-w" onMouseDown={e => beginResize("edgeW", e)} />
        <span className="edge-handle edge-ne" onMouseDown={e => beginResize("edgeNE", e)} />
        <span className="edge-handle edge-nw" onMouseDown={e => beginResize("edgeNW", e)} />
        <span className="edge-handle edge-se" onMouseDown={e => beginResize("edgeSE", e)} />
        <span className="edge-handle edge-sw" onMouseDown={e => beginResize("edgeSW", e)} />
        <section className="pet-anchor" style={{ transform: `translateX(-50%) scale(${settings.petScale}) translate(${viewOff.x}px, ${viewOff.y}px)` }}>
          <div className="edit-live-layer">
            {settings.showBubbles && getFeedbackMode(previewEvent) !== "ribbon" ? (
              <div className="bubble-wrapper" style={{ transform: `translate(${offsets.bubble?.x ?? 0}px, ${offsets.bubble?.y ?? 0}px)` }}>
                <Bubble event={previewEvent} state={stateFromEvent(previewEvent)} settings={settings} />
              </div>
            ) : null}
            <div className={`clawd clawd-${previewState}`} style={{ transform: `translate(${offsets.clawd?.x ?? 0}px, ${offsets.clawd?.y ?? 0}px) scale(${settings.clawdScale})`, opacity: settings.clawdOpacity }}>
              <ClawdSprite state={previewState} idleBubble={effectiveIdleBubble} eventType={previewEvent.event} tool={previewEvent.tool} stateAnimations={settings.stateAnimations} />
              {settings.showStatusProp && previewState !== "idle" ? <StateProp state={previewState} /> : null}
            </div>
            {settings.showBubbles ? (
              <ToolStreams streams={previewStreams} offset={offsets.ribbon} />
            ) : null}
            {settings.showBubbles ? (
              <PermissionCard
                permission={editPreviewPermission}
                queueCount={1}
                onAllow={() => {}}
                onDeny={() => {}}
                settings={settings}
                offset={offsets.permission}
              />
            ) : null}
            {pluginWidgets.map(({ plugin, widget, widgetKey }) => widget.type === "pomodoro" ? (
              <PluginPomodoroWidget key={`${plugin.id}:${widgetKey}:preview`} plugin={plugin} offset={getPluginWidgetOffset(settings, plugin, widgetKey)} preview />
            ) : null)}
          </div>
          {pluginWidgets.map(({ plugin, widget, widgetKey }) => widget.type === "pomodoro" ? (
            <div key={`${plugin.id}:${widgetKey}`} className="edit-zone edit-zone-pomodoro edit-zone-plugin-widget"
              style={{
                transform: `translate(${getPluginWidgetOffset(settings, plugin, widgetKey).x}px, ${getPluginWidgetOffset(settings, plugin, widgetKey).y}px)`,
                width: widget.width ?? 172,
                height: widget.height ?? 78
              }}
              onMouseDown={e => begin(`pluginWidget:${plugin.id}:${widgetKey}`, e)}>
              <span className="edit-zone-label">{widget.label ?? plugin.name}</span>
            </div>
          ) : null)}
          <div className="edit-zone edit-zone-clawd"
            style={{
              left: Math.round((226 - cw) / 2),
              transform: `translate(${offsets.clawd?.x ?? 0}px, ${offsets.clawd?.y ?? 0}px)`,
              width: cw, height: ch
            }}
            onMouseDown={e => begin("clawd", e)}>
            <span className="edit-zone-label">Clawd</span>
            <span className="zone-resize" onMouseDown={e => beginResize("clawd", e)} />
          </div>
          <div className="edit-zone edit-zone-bubble"
            style={{
              left: bx,
              top: by,
              right: "auto",
              bottom: "auto",
              transform: `translate(${offsets.bubble?.x ?? 0}px, ${offsets.bubble?.y ?? 0}px)`,
              width: bw, height: bh
            }}
            onMouseDown={e => begin("bubble", e)}>
            <span className="edit-zone-label">{t("pet.editZoneBubble", "Bubble / card")}</span>
            <span className="zone-resize" onMouseDown={e => beginResize("bubble", e)} />
          </div>
          <div className="edit-zone edit-zone-ribbon"
            style={{
              transform: `translate(${offsets.ribbon?.x ?? 0}px, ${offsets.ribbon?.y ?? 0}px)`,
              width: rw, height: rh
            }}
            onMouseDown={e => begin("ribbon", e)}>
            <span className="edit-zone-label">{t("pet.editZoneRibbon", "Tool ribbon")}</span>
            <span className="zone-resize" onMouseDown={e => beginResize("ribbon", e)} />
          </div>
          <div className="edit-zone edit-zone-permission"
            style={{
              left: 10,
              top: 10,
              transform: `translate(${offsets.permission?.x ?? 0}px, ${offsets.permission?.y ?? 0}px)`,
              width: pw, height: ph
            }}
            onMouseDown={e => begin("permission", e)}>
            <span className="edit-zone-label">{t("pet.editZonePermission", "Permission card")}</span>
            <span className="zone-resize" onMouseDown={e => beginResize("permission", e)} />
          </div>
          <div className="edit-zone edit-zone-git-toast"
            style={{
              top: 8,
              left: "50%",
              transform: `translateX(-50%) translate(${offsets.gitToast?.x ?? 0}px, ${offsets.gitToast?.y ?? 0}px)`,
              width: 240,
              height: 36
            }}
            onMouseDown={e => begin("gitToast", e)}>
            <span className="edit-zone-label">{t("pet.editZoneGitToast", "Git capsule")}</span>
            <span className="zone-resize" onMouseDown={e => beginResize("gitToast", e)} />
          </div>
          {settings.multiSessionEnabled && [0, 1, 2].map(i => {
            const cScale = settings.companionScale ?? 0.6;
            const off = (offsets as any)[`companion${i}`] ?? { x: 80 + i * 100, y: -120 - i * 80 };
            return (
              <div key={i} className="edit-zone edit-zone-companion"
                style={{
                  left: 0,
                  bottom: 0,
                  transform: `translate(${off.x}px, ${off.y}px) scale(${cScale})`,
                  width: 168,
                  height: 160
                }}
                onMouseDown={e => begin(`companion${i}`, e)}>
                <span className="edit-zone-label">{t("pet.editZoneCompanion", "Mini Clawd")} {i + 1}</span>
              </div>
            );
          })}
        </section>
      </main>
    );
  }

  return (
    <main className={`pet-stage ${settings.clickThrough ? 'pet-clickthrough' : ''}`}>
      <PluginSpriteLoader />
      <section className="pet-anchor" style={{ transform: `translateX(-50%) scale(${settings.petScale}) translate(${viewOff.x}px, ${viewOff.y}px)`, opacity: settings.petOpacity }} onMouseDown={beginNormalDrag}>
      {gitToast && (
        <div className="git-toast" key={gitToast.id} style={{ top: 8, left: "50%", transform: `translateX(-50%) translate(${(settings.positionOffsets?.gitToast?.x ?? 0)}px, ${(settings.positionOffsets?.gitToast?.y ?? 0)}px)` }}>
          <span className="git-toast-title">{gitToast.title}</span>
          <span className="git-toast-message">{gitToast.message}</span>
        </div>
      )}
        {activePermissions.length > 0 ? (
          <PermissionCard
            hitTestRef={permCardRef}
            permission={activePermissions[0]}
            queueCount={activePermissions.length}
            onAllow={() => respondToPermission(activePermissions[0].id, "allow")}
            onDeny={() => respondToPermission(activePermissions[0].id, "deny")}
            settings={settings}
            offset={offsets.permission}
          />
        ) : settings.showBubbles && currentEvent && getFeedbackMode(currentEvent) !== "ribbon" ? (
          <div className="bubble-wrapper" style={{ transform: `translate(${offsets.bubble?.x ?? 0}px, ${offsets.bubble?.y ?? 0}px)` }}>
            <Bubble event={currentEvent} state={stateFromEvent(currentEvent)} settings={settings} />
          </div>
        ) : null}
        <div className={`clawd clawd-${petState}`} style={{ transform: `translate(${offsets.clawd?.x ?? 0}px, ${offsets.clawd?.y ?? 0}px) scale(${settings.clawdScale})`, opacity: settings.clawdOpacity }}>
          <ClawdSprite state={petState} idleBubble={effectiveIdleBubble} eventType={currentEvent?.event} tool={currentEvent?.tool} stateAnimations={settings.stateAnimations} />
          {settings.showStatusProp && petState !== "idle" ? <StateProp state={petState} /> : null}
        </div>
        {settings.showBubbles && toolStreams.length > 0 ? (
          <ToolStreams streams={toolStreams} offset={offsets.ribbon} />
        ) : null}

        {pluginWidgets.map(({ plugin, widget, widgetKey }) => widget.type === "pomodoro" ? (
          <PluginPomodoroWidget key={`${plugin.id}:${widgetKey}`} plugin={plugin} offset={getPluginWidgetOffset(settings, plugin, widgetKey)} onBeginDrag={e => beginPluginWidgetDrag(plugin.id, widgetKey, e)} />
        ) : null)}

        {settings.multiSessionEnabled && mainSessionId && sessions
            .filter(s => s.sessionId !== mainSessionId && (s.isActive || exitingSessions.has(s.sessionId)))
            .slice(0, 3).map((session) => (
            <CompanionClawd
              key={session.sessionId}
              session={session}
              index={companionSlotRef.current.get(session.sessionId) ?? 0}
              settings={settings}
              exiting={exitingSessions.has(session.sessionId)}
              mainClawdOffset={offsets.clawd ?? { x: 0, y: 0 }}
            />
          ))}
      </section>
    </main>
  );
}

function Bubble({ event, state, settings }: { event: CompanionEvent; state: PetState; settings: CompanionSettings }) {
  const { t } = useI18n();
  const toolLabel = event.tool && event.tool !== "Unknown" ? event.tool : event.source === "claude-code" ? "Claude Code" : "Manual";
  const feedbackMode = getFeedbackMode(event);
  if (feedbackMode === "thought") {
    return (
      <div className="thought-wrapper" style={{ transform: `scale(${settings.thoughtScale})`, opacity: settings.thoughtOpacity }}>
        <section className={`thought-bubble thought-${state}`}>
          <i />
          <span>{toolLabel}</span>
          <strong>{event.detail ?? event.title}</strong>
        </section>
      </div>
    );
  }

  return (
    <div className="bubble-wrapper" style={{ transform: `scale(${settings.cardScale})`, opacity: settings.cardOpacity }}>
      <section className={`bubble bubble-${state}`}>
        <div className="bubble-status-light" />
        <div className="bubble-content">
        <header className="bubble-header">
          <span className="bubble-state">{t(`pet.${state}`, stateCopy[state].label)}</span>
          <span className="bubble-tool">{toolLabel}</span>
        </header>
        <strong>{event.title}</strong>
        <p>{event.message}</p>
        {event.detail ? <code className="bubble-detail">{event.detail}</code> : null}
        <footer className="bubble-footer">
          <span>{t(`pet.${state}Line`, stateCopy[state].line)}</span>
          <time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
        </footer>
      </div>
    </section>
    </div>
  );
}

const toolColorMap: Record<string, string> = {
  Read: "mint",
  Edit: "coral",
  Write: "coral",
  Bash: "ink",
  Grep: "blue",
  Glob: "blue",
  WebFetch: "blue",
  WebSearch: "blue",
  Notebook: "mint",
  Agent: "steel",
  Skill: "honey",
  Task: "steel",
  AskUserQuestion: "honey",
  MCP: "purple",
  Shell: "ink",
  ApplyPatch: "coral",
  UpdatePlan: "steel",
  ViewImage: "blue",
  Unknown: "steel"
};

function ToolStreams({ streams, offset }: { streams: ToolStream[]; offset?: { x: number; y: number } }) {
  const visible = streams.filter((stream, index) => stream.exiting || streams.slice(0, index).filter(s => !s.exiting).length < 5);

  return (
    <div className="tool-streams" style={{ transform: `translate(${offset?.x ?? 0}px, ${offset?.y ?? 0}px)` }}>
      {visible.map((stream) => {
        const tool = stream.event.tool ?? "Unknown";
        const color = toolColorMap[tool] ?? "steel";
        const detail = stream.event.detail ?? stream.event.title;
        const slot = stream.exiting ? (stream.exitSlot ?? stream.slot) : stream.slot;
        return (
          <div
            key={stream.event.id}
            className={`tool-stream color-${color} ${stream.exiting ? "exiting" : "active"}`}
            style={{ top: 34 + slot * 18 }}
          >
            <span className="stream-wake" />
            <span className="stream-core" />
            <span className="stream-tool-name">{tool}</span>
            <span className="stream-holo" aria-hidden="true">
              <span className="stream-detail">{detail}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Clawd({ state, settings, forceIdleBubble }: { state: PetState; settings: CompanionSettings; forceIdleBubble?: string | null }) {
  const { t } = useI18n();
  const [syncedSprite, setSyncedSprite] = useState<string | null>(null);

  useEffect(() => {
    const off = window.companion.onIdleBubbleSync(setSyncedSprite);
    return () => off();
  }, []);

  const effectiveBubble = forceIdleBubble ?? syncedSprite;

  return (
    <section className={`clawd clawd-${state}`} style={{ transform: `scale(${settings.clawdScale})`, opacity: settings.clawdOpacity }} aria-label={`Clawd ${t(`pet.${state}`, stateCopy[state].label)}`}>
      <ClawdSprite state={state} idleBubble={effectiveBubble} stateAnimations={settings.stateAnimations} />
      {settings.showStatusProp && state !== "idle" ? <StateProp state={state} /> : null}
    </section>
  );
}

const idleBubbleGifClass: Record<string, string> = {
  idle: "idle_bubble",
  thinking: "thinking_speech",
  tool_read: "headset_focus",
  tool_edit: "working_hardhat",
  waiting_permission: "permission_prompt",
  done: "celebrate_bunny",
  error: "error_dead",
  skill: "idea_bulb",
  task: "idea_bulb",
  agent: "welding_work"
};

const eventSpriteOverride: Partial<Record<CompanionEvent["event"], { sprite: string; gif: string }>> = {
  session_start: { sprite: "tool_read", gif: "headset_focus" },
  prompt_submit: { sprite: "done", gif: "celebrate_bunny" }
};

// 工具到 GIF 动画的映射
const toolGifMap: Record<string, string> = {
  Skill: "idea_bulb",
  Task: "idea_bulb",
  Agent: "welding_work"
};

function ClawdSprite({ state, idleBubble, eventType, tool, stateAnimations }: { state: PetState; idleBubble?: string | null; eventType?: CompanionEvent["event"]; tool?: string; stateAnimations?: Record<string, string> }) {
  if (idleBubble) {
    const gifClass = idleBubbleGifClass[idleBubble] ?? idleBubble;
    return (
      <>
        <div className="clawd-glow" />
        <span className={`clawd-sprite clawd-sprite-${idleBubble} clawd-gif-${gifClass}`} aria-hidden="true" />
        <div className="shadow" />
      </>
    );
  }
  if (state === "idle") {
    return (
      <>
        <div className="clawd-glow" />
        <img className="clawd-image" src={clawdImage} alt="" draggable={false} />
        <div className="shadow" />
      </>
    );
  }
  // 优先级：用户自定义 > 事件覆盖 > 默认映射
  const userSprite = stateAnimations?.[state];
  if (userSprite) {
    const gifClass = idleBubbleGifClass[userSprite] ?? userSprite;
    return <span className={`clawd-sprite clawd-sprite-${userSprite} clawd-gif-${gifClass}`} aria-hidden="true" />;
  }
  const override = eventType ? eventSpriteOverride[eventType] : undefined;
  if (override) {
    return <span className={`clawd-sprite clawd-sprite-${override.sprite} clawd-gif-${override.gif}`} aria-hidden="true" />;
  }
  // 检查工具特定的 GIF 映射
  if (tool && toolGifMap[tool]) {
    const gifClass = toolGifMap[tool];
    const spriteState = state === "tool_mcp" ? "thinking" : state === "tool_read" ? "thinking" : state === "tool_bash" ? "tool_read" : state;
    return <span className={`clawd-sprite clawd-sprite-${spriteState} clawd-gif-${gifClass}`} aria-hidden="true" />;
  }
  const spriteState = state === "tool_mcp" ? "thinking" : state === "tool_read" ? "thinking" : state === "tool_bash" ? "tool_read" : state;
  return <span className={`clawd-sprite clawd-sprite-${spriteState} clawd-gif-${clawdGifName[state]}`} aria-hidden="true" />;
}

function CompanionClawd({ session, index, settings, exiting, mainClawdOffset }: { session: CompanionSession; index: number; settings: CompanionSettings; exiting?: boolean; mainClawdOffset: { x: number; y: number } }) {
  const scale = settings.companionScale ?? 0.6;
  const offsets = settings.positionOffsets ?? {};
  const off = (offsets as any)[`companion${index}`] ?? { x: 80 + index * 100, y: -120 - index * 80 };
  const baseX = off.x;
  const baseY = off.y;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // 工作时自定义待机动画逻辑
  const isIdleInSession = session.state === "thinking" || session.state === "idle";
  const configuredIdleAnim = settings.companionIdleAnimations?.[index] ?? "thinking";

  // 处理 "random"：从动画池中随机选取精灵，循环播放
  const [randomSprite, setRandomSprite] = useState<string | null>(null);
  const randomTimerRef = useRef<number>(0);

  useEffect(() => {
    if (configuredIdleAnim !== "random" || !isIdleInSession) {
      setRandomSprite(null);
      clearTimeout(randomTimerRef.current);
      return;
    }
    const pool = settings.idleAnim?.selectedSprites?.length ? settings.idleAnim.selectedSprites : ["idle"];
    let cancelled = false;
    function next() {
      if (cancelled) return;
      const sprite = pool[Math.floor(Math.random() * pool.length)];
      setRandomSprite(sprite);
      const min = (settings.idleAnim?.intervalMin ?? 15) * 1000;
      const max = (settings.idleAnim?.intervalMax ?? 40) * 1000;
      randomTimerRef.current = window.setTimeout(next, min + Math.random() * (max - min));
    }
    next();
    return () => { cancelled = true; clearTimeout(randomTimerRef.current); };
  }, [configuredIdleAnim, isIdleInSession, settings.idleAnim]);

  // 确定最终显示的 idleBubble：优先走 idleBubble 路径（与主 Clawd 一致，ClawdSprite 通过 idleBubbleGifClass 正确解析）
  let effectiveIdleBubble: string | null = null;
  if (isIdleInSession && configuredIdleAnim) {
    if (configuredIdleAnim === "random") {
      effectiveIdleBubble = randomSprite; // null 期间 fallback 到 session.state
    } else {
      effectiveIdleBubble = configuredIdleAnim;
    }
  }

  return (
    <div
      className="companion-clawd"
      style={{
        transform: `translate(${baseX}px, ${baseY}px) scale(${scale})`,
        opacity: exiting ? 0 : mounted ? 1 : 0,
        transition: "opacity 0.3s ease-out"
      }}
    >
      <ClawdSprite state={session.state} idleBubble={effectiveIdleBubble} tool={session.lastEvent?.tool} stateAnimations={settings.stateAnimations} />
    </div>
  );
}

function StateProp({ state }: { state: PetState }) {
  if (state === "tool_bash") return <Terminal className="state-prop terminal-prop" size={30} />;
  if (state === "tool_edit") return <Code2 className="state-prop edit-prop" size={30} />;
  if (state === "tool_read") return <FileText className="state-prop read-prop" size={30} />;
  if (state === "tool_search") return <Search className="state-prop search-prop" size={30} />;
  if (state === "tool_mcp") return <PlugZap className="state-prop mcp-prop" size={30} />;
  if (state === "waiting_permission") return <Bell className="state-prop bell-prop" size={30} />;
  if (state === "done") return <Check className="state-prop check-prop" size={30} />;
  if (state === "error") return <X className="state-prop error-prop" size={30} />;
  return null;
}

type HookStatus = { installed: boolean; configExists: boolean; hookCount: number; requiredCount: number; missingEvents: string[]; commandMatches: boolean };
type HookSetupStage = "idle" | "success" | "hiding";

export function SettingsApp() {
  const { t, setLocale, locale } = useI18n();
  const { settings, updateSettings, connection, events, petState, toolStreams } = useCompanion();
  const [copied, setCopied] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("general");
  const [activeSettingsSubsection, setActiveSettingsSubsection] = useState("general");
  const [now, setNow] = useState(Date.now());
  const [appVersion, setAppVersion] = useState("...");
  const sectionContentRef = useRef<HTMLDivElement | null>(null);

  // Git 胶囊：在设置窗口也渲染一份（pet 窗口可能被遮挡）
  const [gitToast, setGitToast] = useState<{ id: string; title: string; message: string } | null>(null);
  const gitToastTimer = useRef<number | null>(null);
  useEffect(() => {
    const off = window.companion.onEvent(event => {
      if (event.event !== "git_operation") return;
      if (gitToastTimer.current) window.clearTimeout(gitToastTimer.current);
      setGitToast({ id: event.id, title: event.title, message: event.message });
      gitToastTimer.current = window.setTimeout(() => setGitToast(null), 2200);
    });
    return () => {
      off();
      if (gitToastTimer.current) window.clearTimeout(gitToastTimer.current);
    };
  }, []);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    checking: false,
    available: false,
    upToDate: false,
    downloaded: false,
    downloading: false
  });
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [persistedStats, setPersistedStats] = useState<any>(null);
  const [onboardingDone, setOnboardingDone] = useState(() => {
    try { return localStorage.getItem("clawd-onboarding-done") === "1"; } catch { return true; }
  });
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [overviewHookStatus, setOverviewHookStatus] = useState<HookStatus | null>(null);
  const [hookSetupStage, setHookSetupStage] = useState<HookSetupStage>("idle");
  const hookSetupTimers = useRef<number[]>([]);
  const hookSetupNeedsAttention = overviewHookStatus ? !overviewHookStatus.installed || overviewHookStatus.missingEvents.length > 0 || !overviewHookStatus.commandMatches : false;
  const hookSetupShowingSuccess = !hookSetupNeedsAttention && (hookSetupStage === "success" || hookSetupStage === "hiding");
  const shouldRenderHookSetup = hookSetupNeedsAttention || hookSetupStage !== "idle";
  const formatText = (template: string, values: Record<string, string | number>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
  const hookCommand = "node D:/build/GitLocal/Clawd-Companion/dist/hook-forwarder/index.js";
  const hookConfigPath = "C:/Users/Doulor/.claude/settings.json";
  const hookSnippet = useMemo(() => buildHookSnippet(hookCommand), [hookCommand]);

  useEffect(() => {
    window.companion.getAppVersion().then(setAppVersion);
    window.companion.getUpdateStatus().then(setUpdateStatus);
    window.companion.getStats().then(setPersistedStats);
    const offUpdate = window.companion.onUpdateStatus(setUpdateStatus);
    const offPlaySound = window.companion.onPlaySound((dataUrl) => {
      try { new Audio(dataUrl).play(); } catch { /* ignore */ }
    });
    // 每秒刷新统计
    const statsInterval = window.setInterval(() => window.companion.getStats().then(setPersistedStats), 1_000);
    return () => { offUpdate(); offPlaySound(); window.clearInterval(statsInterval); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.companion.checkHooks().then(status => {
      if (!cancelled) setOverviewHookStatus(status);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      hookSetupTimers.current.forEach(timer => window.clearTimeout(timer));
      hookSetupTimers.current = [];
    };
  }, []);

  function handleOverviewHookStatusChange(status: HookStatus) {
    setOverviewHookStatus(status);
    if (!status.installed || status.missingEvents.length > 0 || !status.commandMatches) {
      hookSetupTimers.current.forEach(timer => window.clearTimeout(timer));
      hookSetupTimers.current = [];
      setHookSetupStage("idle");
    }
  }

  function handleOverviewHookInstallSuccess(status: HookStatus) {
    hookSetupTimers.current.forEach(timer => window.clearTimeout(timer));
    hookSetupTimers.current = [];
    setOverviewHookStatus(status);
    setHookSetupStage("success");
    hookSetupTimers.current = [
      window.setTimeout(() => setHookSetupStage("hiding"), 4200),
      window.setTimeout(() => {
        setHookSetupStage("idle");
        hookSetupTimers.current = [];
      }, 5000)
    ];
  }

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  function jumpTo(section: string) {
    if (section === activeSection) return;
    const resetSectionScroll = () => {
      sectionContentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      requestAnimationFrame(() => sectionContentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    };

    if (document.startViewTransition) {
      try {
        document.startViewTransition(() => {
          flushSync(() => setActiveSection(section));
          resetSectionScroll();
        });
        return;
      } catch {
        setActiveSection(section);
        resetSectionScroll();
        return;
      }
    }
    setActiveSection(section);
    resetSectionScroll();
  }

  useEffect(() => {
    return window.companion.onOpenSection(section => jumpTo(section));
  }, [activeSection]);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(current => current === key ? null : current), 1600);
  }

  async function handleCheckUpdate() {
    setCheckingUpdate(true);
    setUpdateStatus(prev => ({ ...prev, error: undefined }));
    try {
      const result = await Promise.race([
        window.companion.checkForUpdates(),
        new Promise<{ ok: boolean; error?: string }>(resolve =>
          setTimeout(() => resolve({ ok: false, error: t("update.timeout", "检查超时，请检查网络连接后重试。") }), 15_000)
        )
      ]);
      if (!result.ok) {
        setUpdateStatus(prev => ({ ...prev, error: result.error }));
      }
    } catch {
      setUpdateStatus(prev => ({ ...prev, error: t("update.failed", "检查更新失败，请稍后重试。") }));
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleInstallClick() {
    setInstalling(true);
    try {
      const result = await window.companion.installUpdate();
      if (!result.ok) {
        setUpdateStatus(prev => ({ ...prev, error: result.error ?? t("update.installFailed", "安装启动失败") }));
      }
    } catch {
      // IPC 断开（quitAndInstall 触发退出）会到这里，属于正常情况
    } finally {
      setInstalling(false);
    }
  }

  return (
    <main className="settings-shell">
      {gitToast && (
        <div className="git-toast" key={gitToast.id} style={{ left: "50%", top: 64, transform: "translateX(-50%)" }}>
          <span className="git-toast-title">{gitToast.title}</span>
          <span className="git-toast-message">{gitToast.message}</span>
        </div>
      )}
      <section className="window-bar">
        <div className="window-title">
          <Sparkles size={16} />Clawd Companion
          {(updateStatus.available || updateStatus.downloading || updateStatus.downloaded) && (
            <button className="update-hint-btn" onClick={() => {
              const content = document.querySelector('.section-content');
              if (content) {
                content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
              }
            }}>
              {t("main.newVersion", "发现新版本")}
            </button>
          )}
        </div>
        <div className="window-actions">
          <button title={t("main.minimize", "最小化")} onClick={() => window.companion.minimizeSettings()}>-</button>
          <button title={t("main.maximize", "最大化/还原")} onClick={() => window.companion.toggleMaximizeSettings()}>□</button>
          <button className="close" title={t("main.close", "关闭配置")} onClick={() => window.companion.closeSettings()}>×</button>
        </div>
      </section>
      <nav className="tab-bar">
        <div className="tab-mark"><Sparkles size={18} /></div>
        {[
          { id: "general", icon: <Gauge size={16} />, label: t("settings.tabs.general", "总览") },
          { id: "sessions", icon: <Terminal size={16} />, label: t("settings.tabs.sessions", "会话") },
          { id: "plugins", icon: <PlugZap size={16} />, label: t("settings.tabs.plugins", "插件") },
          { id: "animation", icon: <Wand2 size={16} />, label: t("settings.tabs.animation", "动画") },
          { id: "data", icon: <FileText size={16} />, label: t("settings.tabs.data", "数据") },
          { id: "settings", icon: <Wrench size={16} />, label: t("settings.tabs.settings", "设置") }
        ].map(tab => (
          <button
            key={tab.id}
            className={`tab-item ${activeSection === tab.id ? "active" : ""}`}
            style={activeSection === tab.id ? ({ viewTransitionName: "active-tab" } as React.CSSProperties) : undefined}
            onClick={() => jumpTo(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      <div className="section-content" ref={sectionContentRef}>
        {activeSection === "general" && <section className="overview-workbench">
          {shouldRenderHookSetup && <section className={`onboarding-card overview-steps-card hook-setup-card ${hookSetupShowingSuccess ? "install-success" : ""} ${hookSetupStage === "hiding" && !hookSetupNeedsAttention ? "closing" : ""}`}>
            <div className="onboarding-content overview-welcome-content">
              <h3>{hookSetupShowingSuccess ? t("main.hooksInstallSuccess", "连接完成") : t("main.connectTitle", "连接 Claude Code")}</h3>
              <HooksManager compact success={hookSetupShowingSuccess} onStatusChange={handleOverviewHookStatusChange} onInstallSuccess={handleOverviewHookInstallSuccess} />
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
        </section>}

        {activeSection === "settings" && (
          <section className="settings-page">
            <header className="settings-page-head">
              <div>
                <span>{t("settings.eyebrow", "Settings")}</span>
                <h2>{t("settings.title", "偏好设置")}</h2>
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
                  <Toggle label={t("appearance.clickThrough", "完全点击穿透")} checked={settings.clickThrough} onChange={clickThrough => updateSettings({ clickThrough })} />
                  <Toggle label={t("appearance.showBubbles", "显示气泡")} checked={settings.showBubbles} onChange={showBubbles => updateSettings({ showBubbles })} />
                  <Toggle label={t("appearance.showStatusProp", "显示状态图标")} checked={settings.showStatusProp} onChange={showStatusProp => updateSettings({ showStatusProp })} />
                  <Toggle label={t("appearance.showSessionTitle", "显示会话标题")} checked={settings.showSessionTitle} onChange={showSessionTitle => updateSettings({ showSessionTitle })} />
                  <Toggle label={t("appearance.editPosition", "编辑桌宠位置")} checked={settings.editPosition} onChange={editPosition => updateSettings({ editPosition })} />
                  {settings.editPosition ? <button className="inline-action" onClick={() => updateSettings({ positionOffsets: defaultSettings.positionOffsets, zoneSizes: defaultSettings.zoneSizes, clawdScale: defaultSettings.clawdScale, thoughtScale: defaultSettings.thoughtScale, bubbleScale: defaultSettings.bubbleScale, cardScale: defaultSettings.cardScale, petScale: defaultSettings.petScale, viewScale: defaultSettings.viewScale })}>{t("appearance.resetAll", "重置全部")}</button> : null}
                </GroupCard>

                <MonitorSettings settings={settings} updateSettings={updateSettings} />

                <div className="section-grid-2col">
                  <GroupCard title={t("appearance.overallScale", "整体缩放")}>
                    <Slider label={t("appearance.viewScale", "视图缩放")} min={0.7} max={1.45} step={0.05} value={settings.petScale} format={v => `${Math.round(v * 100)}%`} onChange={petScale => updateSettings({ petScale })} />
                    <Slider label={t("appearance.viewportScale", "视窗缩放")} min={0.7} max={2.5} step={0.05} value={settings.viewScale ?? settings.petScale} format={v => `${Math.round(v * 100)}%`} onChange={viewScale => updateSettings({ viewScale })} />
                    <Slider label={t("appearance.opacity", "整体透明")} min={0.45} max={1} step={0.05} value={settings.petOpacity} format={v => `${Math.round(v * 100)}%`} onChange={petOpacity => updateSettings({ petOpacity })} />
                  </GroupCard>

                  <GroupCard title="Clawd">
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
                <GroupCard icon={<Sparkles size={18} />} title={t("settings.about.title", "关于 Clawd Companion")}>
                  <div className="settings-about-panel">
                    <div className="settings-about-mark">Clawd</div>
                    <div className="settings-about-copy">
                      <strong>Clawd Companion</strong>
                      <span>{t("settings.about.description", "面向 Claude Code 的本地桌宠和工作台。")}</span>
                    </div>
                    <div className="settings-about-actions">
                      <button className="inline-action" onClick={() => window.companion.openExternal("https://github.com/Doulor/Clawd-Companion")}>GitHub</button>
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
        )}

        {activeSection === "sessions" && <SessionsPage />}

        {activeSection === "plugins" && <PluginsPage settings={settings} updateSettings={updateSettings} />}

        {activeSection === "animation" && <>
          <GroupCard icon={<Sparkles size={18} />} title={t("sections.idleAnimation", "待机动画")}>
            <IdleAnimSettings config={settings.idleAnim ?? defaultSettings.idleAnim!} onChange={cfg => updateSettings({ idleAnim: cfg })} settings={settings} updateSettings={updateSettings} />
          </GroupCard>

          <GroupCard icon={<Wand2 size={18} />} title={t("sections.actionMapping", "动作映射")}>
            <StateAnimSettings stateAnimations={settings.stateAnimations ?? {}} onChange={sa => updateSettings({ stateAnimations: sa })} />
          </GroupCard>
        </>}

        {activeSection === "data" && <section className="data-workbench">
          <section className="workbench-section data-runtime-section">
            <header className="workbench-section-head">
              <div>
                <span>Runtime</span>
                <h2>{t("sections.runtimeStats", "运行统计")}</h2>
              </div>
              <Gauge size={18} />
            </header>
            {persistedStats ? <StatsPanel stats={persistedStats} /> : <p className="note">{t("common.loading", "加载中...")}</p>}
          </section>

          <section className="workbench-section data-token-section">
            <header className="workbench-section-head">
              <div>
                <span>Claude Code</span>
                <h2>{t("sections.tokenUsage", "Token 用量")}</h2>
              </div>
              <Code2 size={18} />
            </header>
            <TokenPanel />
          </section>
        </section>}
      </div>

      <footer className="version-bar">
        <div className="version-left">
          <span className="version-label">Clawd Companion</span>
          <span className="version-number">v{appVersion}</span>
          <button
            className="version-link"
            onClick={() => window.companion.openExternal("https://github.com/Doulor/Clawd-Companion")}
            title={t("update.github", "在 GitHub 上查看")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12 24 5.37 18.63 0 12 0z"/></svg>
            GitHub
          </button>
        </div>
        <div className="version-right" title={updateStatus.lastCheckedAt ? `${t("update.lastChecked", "上次检查")}: ${new Date(updateStatus.lastCheckedAt).toLocaleString()}` : undefined}>
          {updateStatus.error ? (
            <span className="update-error">{updateStatus.error}</span>
          ) : updateStatus.downloaded ? (
            <div className="update-install-wrap">
              <button className="update-btn update-ready" onClick={handleInstallClick} disabled={installing}>
                {installing ? t("update.installing", "正在启动安装...") : formatText(t("update.install", "点击重启并安装 v{version}"), { version: updateStatus.version ?? "" })}
              </button>
              <span className="update-install-hint">{t("update.installHint", "若安装失败，请右键本软件并以管理员身份运行后再次尝试")}</span>
            </div>
          ) : updateStatus.downloading ? (
            <span className="update-progress">{formatText(t("update.downloading", "下载中 {progress}%"), { progress: Math.round(updateStatus.progress ?? 0) })}</span>
          ) : updateStatus.checking ? (
            <span className="update-checking">{t("update.checking", "正在检查更新...")}</span>
          ) : updateStatus.available ? (
            <span className="update-available">{formatText(t("update.available", "发现新版本 v{version}，正在下载..."), { version: updateStatus.version ?? "" })}</span>
          ) : updateStatus.upToDate ? (
            <span className="update-uptodate">
              <Check size={14} />{t("update.upToDate", "已是最新版本")}
              <button className="update-refresh-btn" onClick={handleCheckUpdate} disabled={checkingUpdate} title={t("update.manualCheck", "手动检查更新")}>
                ↻
              </button>
            </span>
          ) : (
            <button className="update-btn" onClick={handleCheckUpdate} disabled={checkingUpdate}>
              {checkingUpdate ? t("update.checkShort", "检查中...") : t("update.check", "检查更新")}
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}

function Panel({ id, title, icon, wide, children }: { id?: string; title: string; icon: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return <section id={id} className={`panel ${wide ? "wide" : ""}`}><header>{icon}<h2>{title}</h2></header>{children}</section>;
}

function GroupCard({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="group-card">
      <header className="group-card-header">{icon}<h3>{title}</h3></header>
      {children}
    </div>
  );
}

function HooksManager({ compact = false, success = false, onStatusChange, onInstallSuccess }: { compact?: boolean; success?: boolean; onStatusChange?: (status: HookStatus) => void; onInstallSuccess?: (status: HookStatus) => void } = {}) {
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
    window.companion.checkHooks().then(updateHookStatus);
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
    const res = await window.companion.repairHooks();
    setResult(res.success ? formatText(t("doctor.repairDone", "修复完成，修复了 {count} 项配置。"), { count: res.fixed.length }) : formatText(t("doctor.repairFailed", "修复失败: {error}"), { error: res.error ?? "" }));
    updateHookStatus(await window.companion.checkHooks());
    setAction(null);
  }

  async function handleRemove() {
    setAction("removing");
    const res = await window.companion.removeHooks();
    setResult(res.success ? t("doctor.removeDone", "已移除所有 Clawd hooks。") : formatText(t("doctor.removeFailed", "移除失败: {error}"), { error: res.error ?? "" }));
    updateHookStatus(await window.companion.checkHooks());
    setAction(null);
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

function StatusCard({ icon, label, value, meta, tone }: { icon: React.ReactNode; label: string; value: string; meta?: string; tone: "good" | "bad" | "wait" | "neutral" }) {
  return <article className={`status-card ${tone}`}>{icon}<span>{label}</span><strong>{value}</strong>{meta ? <small>{meta}</small> : null}</article>;
}

function ConnectionPill({ connected, label }: { connected: boolean; label?: string }) {
  const { t } = useI18n();
  return <span className={`connection-pill ${connected ? "connected" : "waiting"}`}><i />{connected ? t("status.connected", "已连接") : t("status.waiting", "等待连接")}{label ? <small>{label}</small> : null}</span>;
}

function ConnectionDetail({ label, value }: { label: string; value: string }) {
  return <article className="connection-detail"><span>{label}</span><strong>{value}</strong></article>;
}

function SettingsInfoRow({ label, value }: { label: string; value: string }) {
  return <div className="settings-info-row"><span>{label}</span><strong>{value}</strong></div>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <article className="step"><b>{number}</b><div><strong>{title}</strong><p>{text}</p></div></article>;
}

function MappingRow({ row }: { row: { source: string; tool?: string; state: PetState; title: string } }) {
  const { t } = useI18n();
  return (
    <article className="mapping-row">
      <div><strong>{row.source}</strong><span>{row.tool ?? row.title}</span></div>
      <i />
      <em className={`tone-${stateCopy[row.state].tone}`}>{t(`pet.${row.state}`, stateCopy[row.state].label)}</em>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: React.ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      {checked ? <Eye size={17} /> : <EyeOff size={17} />}
      <span>{label}</span>
      <i />
    </button>
  );
}

function Slider({ label, min, max, step, value, format, onChange }: { label: string; min: number; max: number; step: number; value: number; format: (value: number) => string; onChange: (value: number) => void }) {
  const fillPercent = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--slider-fill": `${fillPercent}%` } as React.CSSProperties}
        onChange={event => onChange(Number(event.target.value))}
      />
      <b>{format(value)}</b>
    </label>
  );
}

function Segmented({ value, onChange }: { value: PrivacyMode; onChange: (value: PrivacyMode) => void }) {
  const { t } = useI18n();
  const items: Array<{ value: PrivacyMode; label: string }> = [
    { value: "safe", label: t("connection.privacySafe", "安全") },
    { value: "standard", label: t("connection.privacyStandard", "标准") },
    { value: "detailed", label: t("connection.privacyDetailed", "详细") }
  ];
  return <div className="segmented">{items.map(item => <button key={item.value} className={value === item.value ? "active" : ""} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

function ThemeSegmented({ value, onChange }: { value: CompanionSettings["theme"]; onChange: (value: CompanionSettings["theme"]) => void }) {
  const { t } = useI18n();
  const items: Array<{ value: CompanionSettings["theme"]; label: string; icon: string }> = [
    { value: "light", label: t("settings.themeLight", "浅色"), icon: "☀" },
    { value: "system", label: t("settings.themeSystem", "跟随"), icon: "◐" },
    { value: "dark", label: t("settings.themeDark", "夜间"), icon: "☾" }
  ];
  const activeIndex = Math.max(0, items.findIndex(item => item.value === value));

  return (
    <div className={`theme-switch theme-switch-${value}`} style={{ "--theme-index": activeIndex } as React.CSSProperties}>
      <div className="theme-switch-liquid" />
      {items.map(item => (
        <button
          key={item.value}
          className={`theme-switch-option ${value === item.value ? "active" : ""}`}
          onClick={() => onChange(item.value)}
          type="button"
        >
          <span className="theme-switch-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function LanguageSegmented({ value, onChange }: { value: CompanionSettings["language"]; onChange: (value: CompanionSettings["language"]) => void }) {
  const items: Array<{ value: CompanionSettings["language"]; label: string; icon: string }> = [
    { value: "zh", label: "中文", icon: "中" },
    { value: "en", label: "English", icon: "EN" }
  ];
  const activeIndex = Math.max(0, items.findIndex(item => item.value === value));
  return (
    <div className={`theme-switch language-switch language-switch-${value}`} style={{ "--theme-index": activeIndex } as React.CSSProperties}>
      <div className="theme-switch-liquid" />
      {items.map(item => (
        <button key={item.value} className={`theme-switch-option ${value === item.value ? "active" : ""}`} type="button" onClick={() => onChange(item.value)}>
          <span className="theme-switch-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function privacyLabel(mode: PrivacyMode) {
  if (mode === "safe") return "安全";
  if (mode === "standard") return "标准";
  return "详细";
}

function shortSession(sessionId?: string, fallback = "No session") {
  if (!sessionId) return fallback;
  return sessionId.length > 12 ? `${sessionId.slice(0, 6)}...${sessionId.slice(-4)}` : sessionId;
}

function localDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeAgo(timestamp: number | undefined, now = Date.now()) {
  const isZh = document.documentElement.lang.startsWith("zh");
  if (!timestamp) return isZh ? "暂无" : "None";
  const seconds = Math.max(1, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return isZh ? `${seconds} 秒前` : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return isZh ? `${minutes} 分钟前` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return isZh ? `${hours} 小时前` : `${hours}h ago`;
}

function buildHookSnippet(command: string) {
  const hook = { matcher: "*", hooks: [{ type: "command", command }] };
  return JSON.stringify({
    hooks: {
      SessionStart: [hook],
      UserPromptSubmit: [hook],
      PreToolUse: [hook],
      PostToolUse: [hook],
      Notification: [hook],
      Stop: [hook]
    }
  }, null, 2);
}

const idleSpriteOptions: Array<{ key: string; label: string; w: number; h: number }> = [
  { key: "idle", label: "idle_bubble", w: 168, h: 160 },
  { key: "thinking", label: "thinking_speech", w: 168, h: 209 },
  { key: "tool_read", label: "headset_focus", w: 168, h: 145 },
  { key: "tool_edit", label: "working_hardhat", w: 168, h: 133 },
  { key: "waiting_permission", label: "permission_prompt", w: 168, h: 100 },
  { key: "done", label: "celebrate_bunny", w: 168, h: 208 },
  { key: "error", label: "error_dead", w: 168, h: 182 },
  { key: "skill", label: "idea_bulb", w: 480, h: 480 },
  { key: "agent", label: "welding_work", w: 480, h: 480 }
];

function IdleAnimSettings({ config, onChange, settings, updateSettings }: { config: IdleAnimConfig; onChange: (cfg: IdleAnimConfig) => void; settings: CompanionSettings; updateSettings: (s: Partial<CompanionSettings>) => void }) {
  const { t } = useI18n();
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  function toggleSprite(key: string) {
    const next = config.selectedSprites.includes(key)
      ? config.selectedSprites.filter(s => s !== key)
      : [...config.selectedSprites, key];
    onChange({ ...config, selectedSprites: next });
  }

  const formatText = (template: string, values: Record<string, string | number>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
  const companionLabels = [
    t("data.mainClawd", "主 Clawd"),
    formatText(t("data.smallClawd", "小 Clawd {index}"), { index: 1 }),
    formatText(t("data.smallClawd", "小 Clawd {index}"), { index: 2 }),
    formatText(t("data.smallClawd", "小 Clawd {index}"), { index: 3 })
  ];
  const companionAnimValues = [
    (settings as any).mainClawdIdleAnimation ?? "random",
    settings.companionIdleAnimations?.[0] ?? "thinking",
    settings.companionIdleAnimations?.[1] ?? "thinking",
    settings.companionIdleAnimations?.[2] ?? "thinking"
  ];

  function setCompanionAnim(index: number, value: string) {
    if (index === 0) {
      updateSettings({ mainClawdIdleAnimation: value } as any);
    } else {
      const next = [...(settings.companionIdleAnimations ?? ["thinking", "thinking", "thinking"])];
      next[index - 1] = value;
      updateSettings({ companionIdleAnimations: next });
    }
  }

  function getAnimLabel(value: string) {
    if (value === "random") return t("common.random", "随机");
    const opt = idleSpriteOptions.find(o => o.key === value);
    return opt?.label ?? value;
  }

  return (
    <div className="idle-anim-settings">
      <Toggle label={t("data.enableIdleRandom", "启用待机随机动画")} checked={config.enabled} onChange={enabled => onChange({ ...config, enabled })} />
      <div className="panel-divider" />
      <h3 className="panel-subtitle">{t("data.optionalPool", "可选动画池")}</h3>
      <div className="idle-sprite-grid">
        {idleSpriteOptions.map(opt => (
          <button
            key={opt.key}
            className={`idle-sprite-preview ${config.selectedSprites.includes(opt.key) ? "checked" : ""}`}
            onClick={() => toggleSprite(opt.key)}
          >
            <div className="sprite-preview-box">
              <span
                className={`clawd-sprite clawd-sprite-${opt.key} clawd-gif-${idleBubbleGifClass[opt.key] ?? opt.key}`}
                style={{ transform: `scale(${72 / Math.max(opt.w, opt.h)})` }}
              />
            </div>
            <span className="idle-sprite-label">{opt.label}</span>
          </button>
        ))}
      </div>
      <div className="panel-divider" />
      <RangeSlider
        label={t("data.playInterval", "播放间隔")}
        min={5}
        max={120}
        step={5}
        low={config.intervalMin}
        high={config.intervalMax}
        format={v => `${v} ${t("common.seconds", "秒")}`}
        onChange={(low, high) => onChange({ ...config, intervalMin: low, intervalMax: high })}
      />
      <div className="panel-divider" />
      <RangeSlider
        label={t("data.repeatCount", "每次播放次数")}
        min={1}
        max={5}
        step={1}
        low={config.repeatMin}
        high={config.repeatMax}
        format={v => `${v} ${t("common.times", "次")}`}
        onChange={(low, high) => onChange({ ...config, repeatMin: low, repeatMax: high })}
      />
      <div className="panel-divider" />
      <h3 className="panel-subtitle">{t("data.clawdIdleAnimations", "各 Clawd 待机动画")}</h3>
      <p className="note">{t("data.idleAnimationNote", "选择「随机」时使用上方动画池配置循环播放；选择固定动画则始终重复播放该 GIF，替代默认的静态 PNG。")}</p>
      <div className="state-anim-grid">
        {companionLabels.map((label, i) => {
          const currentValue = companionAnimValues[i];
          const isOpen = openPicker === i;
          return (
            <div key={i} className="state-anim-col">
              <span className="state-anim-col-label">{label}</span>
              <button
                className={`idle-sprite-preview ${isOpen ? "checked" : ""}`}
                onClick={() => setOpenPicker(isOpen ? null : i)}
              >
                <div className="sprite-preview-box">
                  {currentValue === "random" ? (
                    <span style={{ fontSize: 18, fontWeight: 800, color: "var(--muted)" }}>?</span>
                  ) : (
                    <span
                      className={`clawd-sprite clawd-sprite-${currentValue} clawd-gif-${idleBubbleGifClass[currentValue] ?? currentValue}`}
                      style={{ transform: `scale(${72 / Math.max(168, 168)})` }}
                    />
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
      {openPicker !== null && (
        <div className="state-anim-picker">
          <span className="state-anim-picker-title">
            {formatText(t("data.chooseIdleAnimation", "选择「{name}」的待机动画"), { name: companionLabels[openPicker] })}
            <button className="state-anim-picker-close" onClick={() => setOpenPicker(null)}>×</button>
          </span>
          <div className="state-anim-picker-grid">
            <button
              className={`idle-sprite-preview ${companionAnimValues[openPicker] === "random" ? "checked" : ""}`}
              onClick={() => { setCompanionAnim(openPicker, "random"); setOpenPicker(null); }}
            >
              <div className="sprite-preview-box">
                <span style={{ fontSize: 22, fontWeight: 800, color: "var(--muted)" }}>?</span>
              </div>
              <span className="idle-sprite-label">{t("common.random", "随机")}</span>
            </button>
            {idleSpriteOptions.map(opt => (
              <button
                key={opt.key}
                className={`idle-sprite-preview ${companionAnimValues[openPicker] === opt.key ? "checked" : ""}`}
                onClick={() => { setCompanionAnim(openPicker, opt.key); setOpenPicker(null); }}
              >
                <div className="sprite-preview-box">
                  <span
                    className={`clawd-sprite clawd-sprite-${opt.key} clawd-gif-${idleBubbleGifClass[opt.key] ?? opt.key}`}
                    style={{ transform: `scale(${72 / Math.max(opt.w, opt.h)})` }}
                  />
                </div>
                <span className="idle-sprite-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const stateAnimEntries: Array<{ state: PetState; labelKey: string; fallback: string; defaultSprite: string }> = [
  { state: "thinking", labelKey: "data.thinkingMessage", fallback: "思考 / 新消息", defaultSprite: "thinking" },
  { state: "tool_read", labelKey: "data.readFile", fallback: "读取文件", defaultSprite: "thinking" },
  { state: "tool_edit", labelKey: "data.editFile", fallback: "编辑文件", defaultSprite: "tool_edit" },
  { state: "tool_bash", labelKey: "data.runCommand", fallback: "执行命令", defaultSprite: "tool_read" },
  { state: "tool_search", labelKey: "data.searchDocs", fallback: "搜索资料", defaultSprite: "thinking" },
  { state: "tool_mcp", labelKey: "data.mcpTool", fallback: "MCP 工具", defaultSprite: "thinking" },
  { state: "skill", labelKey: "pet.skill", fallback: "技能", defaultSprite: "skill" },
  { state: "task", labelKey: "pet.task", fallback: "任务", defaultSprite: "task" },
  { state: "agent", labelKey: "data.subAgent", fallback: "子代理", defaultSprite: "agent" },
  { state: "waiting_permission", labelKey: "data.waitingConfirm", fallback: "等待确认", defaultSprite: "waiting_permission" },
  { state: "done", labelKey: "data.processDone", fallback: "处理完成", defaultSprite: "done" },
  { state: "error", labelKey: "pet.error", fallback: "错误", defaultSprite: "error" }
];

function StateAnimSettings({ stateAnimations, onChange }: { stateAnimations: Record<string, string>; onChange: (sa: Record<string, string>) => void }) {
  const { t } = useI18n();
  const formatText = (template: string, values: Record<string, string | number>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
  const [openKey, setOpenKey] = useState<string | null>(null);

  function selectSprite(state: string, sprite: string) {
    onChange({ ...stateAnimations, [state]: sprite });
    setOpenKey(null);
  }

  function resetState(state: string) {
    const next = { ...stateAnimations };
    delete next[state];
    onChange(next);
    setOpenKey(null);
  }

  return (
    <div className="state-anim-settings">
      <p className="note" style={{ marginTop: 0 }}>{t("data.actionPickerHint", "点击预览框展开选择器，再次点击其他动作自动收起。")}</p>
      <div className="state-anim-grid">
        {stateAnimEntries.map(entry => {
          const currentSprite = stateAnimations[entry.state] ?? entry.defaultSprite;
          const isOpen = openKey === entry.state;
          const opt = idleSpriteOptions.find(o => o.key === currentSprite);
          const spriteW = opt?.w ?? 168;
          const spriteH = opt?.h ?? 168;
          return (
            <div key={entry.state} className="state-anim-col">
              <span className="state-anim-col-label">{t(entry.labelKey, entry.fallback)}</span>
              <button
                className={`idle-sprite-preview ${isOpen ? "checked" : ""}`}
                onClick={() => setOpenKey(isOpen ? null : entry.state)}
              >
                <div className="sprite-preview-box">
                  <span
                    className={`clawd-sprite clawd-sprite-${currentSprite} clawd-gif-${idleBubbleGifClass[currentSprite] ?? currentSprite}`}
                    style={{ transform: `scale(${72 / Math.max(spriteW, spriteH)})` }}
                  />
                </div>
              </button>
            </div>
          );
        })}
      </div>
      {openKey && (
        <div className="state-anim-picker">
          <span className="state-anim-picker-title">
            {formatText(t("data.chooseActionAnimation", "选择「{name}」的动画"), { name: (() => { const entry = stateAnimEntries.find(e => e.state === openKey); return entry ? t(entry.labelKey, entry.fallback) : ""; })() })}
            <button className="state-anim-picker-close" onClick={() => setOpenKey(null)}>×</button>
          </span>
          <div className="state-anim-picker-grid">
            {idleSpriteOptions.map(opt => {
              const currentSprite = stateAnimations[openKey!] ?? stateAnimEntries.find(e => e.state === openKey!)!.defaultSprite;
              return (
                <button
                  key={opt.key}
                  className={`idle-sprite-preview ${currentSprite === opt.key ? "checked" : ""}`}
                  onClick={() => selectSprite(openKey!, opt.key)}
                >
                  <div className="sprite-preview-box">
                    <span
                      className={`clawd-sprite clawd-sprite-${opt.key} clawd-gif-${idleBubbleGifClass[opt.key] ?? opt.key}`}
                      style={{ transform: `scale(${72 / Math.max(opt.w, opt.h)})` }}
                    />
                  </div>
                  <span className="idle-sprite-label">{opt.label}</span>
                </button>
              );
            })}
            <button className="idle-sprite-preview reset" onClick={() => resetState(openKey!)}>
              <span className="idle-sprite-label">{t("common.resetDefault", "重置默认")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RangeSlider({ label, min, max, step, low, high, format, onChange }: {
  label: string; min: number; max: number; step: number;
  low: number; high: number; format: (v: number) => string;
  onChange: (low: number, high: number) => void;
}) {
  const range = max - min;
  const leftPercent = ((low - min) / range) * 100;
  const rightPercent = ((high - min) / range) * 100;

  return (
    <label className="range-slider-row">
      <span>{label}</span>
      <div className="range-track">
        <div className="range-fill" style={{ left: `${leftPercent}%`, width: `${rightPercent - leftPercent}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={low}
          onChange={e => { const v = Number(e.target.value); if (v <= high) onChange(v, high); }}
        />
        <input
          type="range" min={min} max={max} step={step} value={high}
          onChange={e => { const v = Number(e.target.value); if (v >= low) onChange(low, v); }}
        />
      </div>
      <b>{format(low)} — {format(high)}</b>
    </label>
  );
}

function TokenKpi({ icon, value, label, tone }: { icon: React.ReactNode; value: string; label: string; tone: "mint" | "honey" | "steel" | "coral" }) {
  return (
    <div className={`token-kpi-card ${tone}`}>
      <span className="token-kpi-icon">{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function TokenDisclosure({ title, summary, defaultOpen = false, children }: { title: string; summary?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`token-disclosure ${open ? "open" : ""}`}>
      <button className="token-disclosure-trigger" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <ChevronDown size={15} className="token-disclosure-chevron" />
        <span>
          <strong>{title}</strong>
          {summary ? <small>{summary}</small> : null}
        </span>
      </button>
      {open ? <div className="token-disclosure-body">{children}</div> : null}
    </section>
  );
}

type TokenHeatmapDaily = {
  date: string;
  requestCount?: number;
  totalTokens?: number;
  costUsd?: number;
};

type TokenHeatmapCell = {
  date: string;
  week: number;
  day: number;
  future: boolean;
  requests: number;
  tokens: number;
  costUsd: number;
};

function dateKeyToLocalDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function shiftLocalDate(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function tokenHeatLevel(value: number, maxValue: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || maxValue <= 0) return 0;
  const ratio = value / maxValue;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function buildTokenHeatmap(dailyTotals: TokenHeatmapDaily[], zh: boolean) {
  const weekCount = 53;
  const today = dateKeyToLocalDate(localDateKey());
  const start = shiftLocalDate(today, -((weekCount - 1) * 7 + today.getDay()));
  const dailyMap = new Map<string, TokenHeatmapDaily>((dailyTotals ?? []).map(entry => [entry.date, entry]));
  const cells: TokenHeatmapCell[] = Array.from({ length: weekCount * 7 }, (_, index) => {
    const date = shiftLocalDate(start, index);
    const dateKey = localDateKey(date.getTime());
    const future = date.getTime() > today.getTime();
    const entry = dailyMap.get(dateKey);
    return {
      date: dateKey,
      week: Math.floor(index / 7),
      day: date.getDay(),
      future,
      requests: future ? 0 : entry?.requestCount ?? 0,
      tokens: future ? 0 : entry?.totalTokens ?? 0,
      costUsd: future ? 0 : entry?.costUsd ?? 0
    };
  });
  const maxRequests = Math.max(0, ...cells.map(cell => cell.requests));
  const activeCells = cells.filter(cell => !cell.future && cell.requests > 0);
  const monthLabels: Array<{ week: number; label: string }> = [];
  const seenMonths = new Set<string>();
  for (let week = 0; week < weekCount; week++) {
    const weekCells = cells.slice(week * 7, week * 7 + 7).filter(cell => !cell.future);
    const firstOfMonth = weekCells.find(cell => dateKeyToLocalDate(cell.date).getDate() === 1);
    if (!firstOfMonth) continue;
    const date = dateKeyToLocalDate(firstOfMonth.date);
    const monthId = `${date.getFullYear()}-${date.getMonth()}`;
    if (seenMonths.has(monthId)) continue;
    seenMonths.add(monthId);
    monthLabels.push({ week, label: zh ? `${date.getMonth() + 1}月` : date.toLocaleString("en-US", { month: "short" }) });
  }
  const bestDay = activeCells.reduce((best, cell) => {
    if (!best || cell.requests > best.requests || (cell.requests === best.requests && cell.tokens > best.tokens)) return cell;
    return best;
  }, null as null | (typeof cells)[number]);
  return {
    cells: cells.map(cell => ({ ...cell, level: tokenHeatLevel(cell.requests, maxRequests) })),
    monthLabels,
    activeDays: activeCells.length,
    totalRequests: activeCells.reduce((sum, cell) => sum + cell.requests, 0),
    bestDay
  };
}

const TOKEN_STATS_CACHE_KEY = "clawd-token-stats-cache-v1";

function readCachedTokenStats() {
  try {
    const raw = localStorage.getItem(TOKEN_STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: unknown };
    return parsed && typeof parsed.data === "object" && parsed.data ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeCachedTokenStats(data: unknown) {
  try {
    localStorage.setItem(TOKEN_STATS_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }));
  } catch {
    // Best-effort cache only. Token scans still work without localStorage.
  }
}

function TokenPanel() {
  const { t, locale } = useI18n();
  const zh = locale === "zh";
  const [stats, setStats] = useState<any | null>(() => readCachedTokenStats());
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const load = async (force = false) => {
    setError(null);
    setLoading(true);
    if (force) setRefreshing(true);
    try {
      const result = await window.companion.getTokenStats(force);
      setStats(result);
      writeCachedTokenStats(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(false); }, []);

  const fmtTok = (n: number) => n >= 1_000_000_000 ? (n / 1_000_000_000).toFixed(2) + "B" : n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n || 0));
  const fmtUsd = (n: number) => n > 0 ? `$${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}` : "—";
  const fmtPct = (n: number) => `${Math.round((n || 0) * 100)}%`;
  const fmtCount = (n: number) => Math.round(n || 0).toLocaleString(zh ? "zh-CN" : "en-US");

  if (error && !stats) return <div className="note" style={{ color: "var(--coral)" }}>{t("stats.scanFailed", "加载失败")}: {error}</div>;
  if (!stats) {
    return (
      <div className="token-panel token-panel-rich token-panel-loading">
        <div className="token-header">
          <div>
            <h3 className="panel-subtitle">{t("stats.tokenUsageFull", "Claude Code Token usage")}</h3>
            <p className="note">{t("stats.scanning", "扫描中…")} {t("stats.scanningClaudeUsage", "Reading Claude Code usage from ~/.claude/projects")}</p>
          </div>
        </div>
        <div className="stats-grid token-kpi-grid">
          <TokenKpi icon={<Zap size={17} />} value="0" label={t("stats.tokenToday", "今日")} tone="mint" />
          <TokenKpi icon={<BarChart3 size={17} />} value="0" label={t("stats.token30d", "30天")} tone="honey" />
          <TokenKpi icon={<Layers3 size={17} />} value="0" label={t("stats.tokenTotal", "累计")} tone="steel" />
          <TokenKpi icon={<DollarSign size={17} />} value="$0" label={t("stats.estimatedCost", "Est. cost")} tone="coral" />
          <TokenKpi icon={<Gauge size={17} />} value="0%" label="Cache hit" tone="mint" />
          <TokenKpi icon={<Terminal size={17} />} value="0" label={t("stats.requests", "Requests")} tone="steel" />
        </div>
        <p className="note">{t("stats.cacheSnapshotHint", "After the first scan, a snapshot is kept so this page can show the last result immediately.")}</p>
      </div>
    );
  }

  const todayStr = localDateKey();
  const todayEntry = stats.dailyTotals?.find((d: any) => d.date === todayStr);
  const todayTokens = todayEntry?.totalTokens ?? 0;
  const thirtyDaysAgo = localDateKey(shiftLocalDate(dateKeyToLocalDate(todayStr), -29).getTime());
  const last30Entries = (stats.dailyTotals ?? []).filter((d: any) => d.date >= thirtyDaysAgo).sort((a: any, b: any) => b.date.localeCompare(a.date));
  const last30 = last30Entries.reduce((s: number, d: any) => s + (d.totalTokens ?? 0), 0);
  const last30Cost = last30Entries.reduce((s: number, d: any) => s + (d.costUsd ?? 0), 0);
  const maxDailyTokens = Math.max(1, ...last30Entries.map((d: any) => d.totalTokens ?? 0));
  const modelRows = showAllModels ? stats.modelTotals ?? [] : (stats.modelTotals ?? []).slice(0, 8);
  const projectRows = showAllProjects ? stats.projectTotals ?? [] : (stats.projectTotals ?? []).slice(0, 8);
  const highRequestRows = (stats.recentRequests ?? []).slice(0, 10);
  const heatmap = buildTokenHeatmap(stats.dailyTotals ?? [], zh);
  const trendSummary = last30Entries.length > 0
    ? `${last30Entries.length} ${zh ? "天" : "days"} · ${fmtTok(last30)} · ${fmtUsd(last30Cost)}`
    : t("stats.noData", "无数据");
  const projectSummary = (stats.projectTotals ?? []).length > 0
    ? `${stats.projectTotals.length} ${zh ? "个项目" : "projects"} · ${fmtTok((stats.projectTotals ?? []).reduce((sum: number, project: any) => sum + (project.totalTokens ?? 0), 0))}`
    : t("stats.noData", "无数据");
  const highRequestSummary = highRequestRows.length > 0
    ? `${highRequestRows.length} ${zh ? "条请求" : "requests"} · ${fmtTok(highRequestRows.reduce((sum: number, request: any) => sum + (request.totalTokens ?? 0), 0))} · ${fmtUsd(highRequestRows.reduce((sum: number, request: any) => sum + (request.costUsd ?? 0), 0))}`
    : t("stats.noData", "无数据");
  const scannedAt = Number.isFinite(Number(stats.lastScannedAt)) ? Number(stats.lastScannedAt) : Date.now();
  const scanSummary = Object.entries({ sessions: stats.totalSessions ?? 0, requests: stats.totalRequests ?? 0, time: new Date(scannedAt).toLocaleString(zh ? "zh-CN" : "en-US") }).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), t("stats.scanSummary", "Scanned {sessions} sessions · {requests} requests · {time}"));
  const scanNote = `${loading ? `${t("stats.scanning", "扫描中…")} · ` : ""}${scanSummary}${error ? ` · ${t("stats.scanFailed", "加载失败")}: ${error}` : ""}`;

  return (
    <div className="token-panel token-panel-rich">
      <div className="token-header">
        <div>
          <h3 className="panel-subtitle">{t("stats.tokenUsageFull", "Claude Code Token usage")}</h3>
          <p className="note">{scanNote}</p>
        </div>
        <button className="ghost-btn" onClick={() => load(true)} disabled={loading || refreshing}>{loading || refreshing ? t("stats.scanning", "扫描中…") : t("common.refresh", "刷新")}</button>
      </div>

      <div className="stats-grid token-kpi-grid">
        <TokenKpi icon={<Zap size={17} />} value={fmtTok(todayTokens)} label={t("stats.tokenToday", "今日")} tone="mint" />
        <TokenKpi icon={<BarChart3 size={17} />} value={fmtTok(last30)} label={t("stats.token30d", "30天")} tone="honey" />
        <TokenKpi icon={<Layers3 size={17} />} value={fmtTok(stats.totalTokens ?? 0)} label={t("stats.tokenTotal", "累计")} tone="steel" />
        <TokenKpi icon={<DollarSign size={17} />} value={fmtUsd(stats.totalCostUsd ?? 0)} label={t("stats.estimatedCost", "Est. cost")} tone="coral" />
        <TokenKpi icon={<Gauge size={17} />} value={fmtPct(stats.cacheHitRatio ?? 0)} label="Cache hit" tone="mint" />
        <TokenKpi icon={<Terminal size={17} />} value={String(stats.totalRequests ?? 0)} label={t("stats.requests", "Requests")} tone="steel" />
      </div>

      <div className="token-breakdown-strip">
        <span><b>{fmtTok((stats.dailyTotals ?? []).reduce((s: number, d: any) => s + (d.inputTokens ?? 0), 0))}</b>{t("stats.inputTokens", "input")}</span>
        <span><b>{fmtTok((stats.dailyTotals ?? []).reduce((s: number, d: any) => s + (d.outputTokens ?? 0), 0))}</b>{t("stats.outputTokens", "output")}</span>
        <span><b>{fmtTok((stats.dailyTotals ?? []).reduce((s: number, d: any) => s + (d.cacheReadTokens ?? 0), 0))}</b>cache read</span>
        <span><b>{fmtTok((stats.dailyTotals ?? []).reduce((s: number, d: any) => s + (d.cacheCreationTokens ?? 0), 0))}</b>cache write</span>
        <span><b>{fmtUsd(last30Cost)}</b>{t("stats.cost30d", "30d cost")}</span>
      </div>

      <section className="token-heatmap-panel">
        <div className="token-heatmap-head">
          <div>
            <h3 className="panel-subtitle">{t("stats.requestHeatmap", "Request heatmap")}</h3>
            <p className="note">{t("stats.requestHeatmapSubtitle", "Last 12 months · request heatmap")}</p>
          </div>
          <div className="token-heatmap-summary">
            <span><small>{t("stats.activeDaysShort", "active days")}</small><b>{fmtCount(heatmap.activeDays)}</b></span>
            <span><small>{t("stats.requests", "requests")}</small><b>{fmtCount(heatmap.totalRequests)}</b></span>
            <span><small>{t("stats.peak", "peak")}</small><b>{heatmap.bestDay ? heatmap.bestDay.date.slice(5) : "—"}</b></span>
          </div>
        </div>
        <div className="token-heatmap-scroll" aria-label={t("stats.requestHeatmapAria", "Request heatmap for the last 12 months")}>
          <div className="token-heatmap">
            <div className="token-heatmap-months">
              {heatmap.monthLabels.map(label => <span key={`${label.week}-${label.label}`} style={{ gridColumn: `${label.week + 1}` }}>{label.label}</span>)}
            </div>
            <div className="token-heatmap-body">
              <div className="token-heatmap-weekdays" aria-hidden="true">
                <span style={{ gridRow: "2" }}>{zh ? "一" : "Mon"}</span>
                <span style={{ gridRow: "4" }}>{zh ? "三" : "Wed"}</span>
                <span style={{ gridRow: "6" }}>{zh ? "五" : "Fri"}</span>
              </div>
              <div className="token-heatmap-cells">
                {heatmap.cells.map(cell => (
                  <span
                    key={cell.date}
                    className={`token-heat-cell level-${cell.level}${cell.future ? " future" : ""}`}
                    style={{ gridColumn: `${cell.week + 1}`, gridRow: `${cell.day + 1}` }}
                    title={cell.future ? undefined : `${cell.date}: ${cell.requests} ${zh ? "次请求" : "requests"} · ${fmtTok(cell.tokens)} · ${fmtUsd(cell.costUsd)}`}
                    aria-label={cell.future ? undefined : `${cell.date}: ${cell.requests} ${zh ? "次请求" : "requests"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="token-heatmap-legend">
          <span>{zh ? "少" : "Less"}</span>
          {[0, 1, 2, 3, 4].map(level => <i key={level} className={`token-heat-cell level-${level}`} />)}
          <span>{zh ? "多" : "More"}</span>
        </div>
      </section>

      <TokenDisclosure title={t("stats.last30Trend", "Last 30 days")} summary={trendSummary}>
        {last30Entries.length === 0 ? <p className="note">{t("stats.noData", "无数据")}</p> : (
          <div className="token-daily-bars">
            {last30Entries.slice(0, 30).map((d: any) => (
              <div key={d.date} className="token-daily-bar-row" title={`${d.date}: ${fmtTok(d.totalTokens)} · ${fmtUsd(d.costUsd ?? 0)}`}>
                <time>{d.date.slice(5)}</time>
                <div><span style={{ width: `${Math.max(3, ((d.totalTokens ?? 0) / maxDailyTokens) * 100)}%` }} /></div>
                <b>{fmtTok(d.totalTokens ?? 0)}</b>
                <em>{fmtUsd(d.costUsd ?? 0)}</em>
              </div>
            ))}
          </div>
        )}
      </TokenDisclosure>

      <section className="token-flat-section">
        <header className="token-section-head">
          <h3 className="panel-subtitle">{t("stats.byModel", "按模型拆分")}</h3>
          <span>{fmtCount((stats.modelTotals ?? []).length)}</span>
        </header>
        {(stats.modelTotals ?? []).length === 0 ? <p className="note">{t("stats.noData", "无数据")}</p> : (
          <div className="token-table token-table-wide">
            <div className="token-table-header"><span>{t("stats.model", "模型")}</span><span>{t("stats.tokens", "Tokens")}</span><span>{t("stats.cost", "Cost")}</span><span>{t("stats.req", "Req")}</span><span>Cache</span></div>
            {modelRows.map((m: any) => (
              <div key={m.model} className="token-table-row">
                <span className="token-model-name">{m.model}</span>
                <span>{fmtTok(m.totalTokens)}</span>
                <span>{m.priced ? fmtUsd(m.costUsd) : "—"}</span>
                <span>{m.requestCount}</span>
                <span>{fmtPct(m.cacheHitRatio)}</span>
              </div>
            ))}
            {(stats.modelTotals ?? []).length > 8 && <button className="ghost-btn token-more-btn" onClick={() => setShowAllModels(v => !v)}>{showAllModels ? t("stats.collapse", "收起") : `${t("stats.showMore", "查看更多")} (${stats.modelTotals.length - 8})`}</button>}
          </div>
        )}
      </section>

      <TokenDisclosure title={t("stats.projectRanking", "Projects")} summary={projectSummary}>
        {(stats.projectTotals ?? []).length === 0 ? <p className="note">{t("stats.noData", "无数据")}</p> : (
          <div className="token-project-list">
            {projectRows.map((p: any) => (
              <article key={p.projectPath} className="token-project-row">
                <div><strong>{p.projectName}</strong><p>{p.projectPath}</p></div>
                <span>{fmtTok(p.totalTokens)}</span>
                <span>{fmtUsd(p.costUsd)}</span>
                <time>{p.lastActivity ? new Date(p.lastActivity).toLocaleDateString() : "—"}</time>
              </article>
            ))}
            {(stats.projectTotals ?? []).length > 8 && <button className="ghost-btn token-more-btn" onClick={() => setShowAllProjects(v => !v)}>{showAllProjects ? t("stats.collapse", "收起") : `${t("stats.showMore", "查看更多")} (${stats.projectTotals.length - 8})`}</button>}
          </div>
        )}
      </TokenDisclosure>

      <TokenDisclosure title={t("stats.largestRequests", "Largest requests")} summary={highRequestSummary}>
        {highRequestRows.length === 0 ? <p className="note">{t("stats.noData", "无数据")}</p> : (
          <div className="token-table token-table-requests">
            <div className="token-table-header"><span>{t("stats.timeProject", "Time / Project")}</span><span>{t("stats.model", "Model")}</span><span>{t("stats.tokens", "Tokens")}</span><span>{t("stats.cost", "Cost")}</span></div>
            {highRequestRows.map((r: any) => (
              <div key={r.id} className="token-table-row">
                <span><b>{new Date(r.timestamp).toLocaleString()}</b><small>{r.projectName}</small></span>
                <span className="token-model-name">{r.model}</span>
                <span>{fmtTok(r.totalTokens)}</span>
                <span>{r.priced ? fmtUsd(r.costUsd) : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </TokenDisclosure>
    </div>
  );
}

export function ClawdSettingsRoot() {
  const route = window.location.hash.replace("#/", "") || "settings";
  const localeRef = React.useRef<string | null>(null);
  const [locale, setLocaleState] = React.useState(() => {
    const saved = localStorage.getItem("clawd-locale");
    return saved === "en" || saved === "zh" ? saved : detectLocale();
  });

  React.useEffect(() => {
    const init = async () => {
      try {
        const settings = await window.companion.getSettings();
        const lang = settings.language === "auto" ? detectLocale() : settings.language;
        if (lang === "en" || lang === "zh") {
          setLocaleState(lang);
          localStorage.setItem("clawd-locale", lang);
        }
      } catch {}
    };
    init();
  }, []);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.setAttribute("data-ui-style", "classic");
    let themeMode: CompanionSettings["theme"] = "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      if (themeMode === "system") applyTheme("system");
    };

    const initTheme = async () => {
      try {
        const settings = await window.companion.getSettings();
        themeMode = settings.theme || "system";
        applyTheme(themeMode);
        applyUiStyle(settings.uiStyle || "classic");
      } catch {}
    };

    media.addEventListener("change", onSystemThemeChange);
    initTheme();
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, []);

  return (
    <I18nProvider initialLocale={locale}>
      {route === "pet" ? <PetApp /> : <SettingsApp />}
    </I18nProvider>
  );
}

if (new URLSearchParams(window.location.search).get("view") === "clawd-standalone") {
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <ClawdSettingsRoot />
    </ErrorBoundary>
  );
}

