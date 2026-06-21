import type { PetEvent } from "../shared/events";
import {
  defaultSettings,
  defaultStats,
  type AppStats,
  type CompanionConnectionStatus,
  type CompanionEvent,
  type CompanionEventType,
  type CompanionSettings,
  type DoctorReport,
  type EventHistoryEntry,
  type PermissionRequest,
  type PluginMarketIndex,
  type PluginRunRecord,
  type ProviderId,
  type SessionHistory,
  type TokenStats,
  type ToolName,
  type UpdateStatus
} from "./shared/events";

type Unsubscribe = () => void;
type Listener<T> = (payload: T) => void;

type PetApi = NonNullable<Window["petAPI"]>;

type CompanionApi = {
  getSettings: () => Promise<CompanionSettings>;
  saveSettings: (next: Partial<CompanionSettings>) => Promise<CompanionSettings>;
  getConnectionStatus: () => Promise<CompanionConnectionStatus>;
  checkHooks: (provider?: ProviderId) => Promise<ReturnType<typeof hooksStatus>>;
  installHooks: (provider?: ProviderId) => Promise<void>;
  repairHooks: (provider?: ProviderId) => Promise<void>;
  removeHooks: (provider?: ProviderId) => Promise<void>;
  openSettings: () => Promise<void>;
  minimizeSettings: () => Promise<void>;
  toggleMaximizeSettings: () => Promise<void>;
  closeSettings: () => Promise<void>;
  onEvent: (callback: Listener<CompanionEvent>) => Unsubscribe;
  onSettings: (callback: Listener<CompanionSettings>) => Unsubscribe;
  onConnection: (callback: Listener<CompanionConnectionStatus>) => Unsubscribe;
  setPetInteractive: (interactive: boolean) => Promise<void>;
  updatePermissionCardRect: (rect: unknown) => Promise<void>;
  dragPetTo: (position: { x: number; y: number }) => Promise<void>;
  movePetBy: (delta: { x: number; y: number }) => Promise<void>;
  onPermissionRequest: (callback: Listener<PermissionRequest>) => Unsubscribe;
  onPermissionResolved: (callback: Listener<{ id: string }>) => Unsubscribe;
  respondPermission: (response: { id: string; decision: "allow" | "deny"; reason?: string }) => Promise<void>;
  checkForUpdates: () => Promise<UpdateStatus>;
  installUpdate: () => Promise<void>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  getAppVersion: () => Promise<string>;
  getTokenStats: (force?: boolean) => Promise<TokenStats>;
  previewSound: () => Promise<void>;
  getDefaultSoundPaths: () => Promise<Record<string, string | null>>;
  previewSoundFile: (path: string) => Promise<void>;
  pickSoundFile: () => Promise<string | null>;
  syncIdleBubble: (payload: unknown) => Promise<void>;
  onIdleBubbleSync: (callback: Listener<unknown>) => Unsubscribe;
  getEventHistory: () => Promise<EventHistoryEntry[]>;
  getSessionHistory: () => Promise<SessionHistory[]>;
  clearEventHistory: () => Promise<void>;
  exportEventHistoryFile: () => Promise<void>;
  getMonitors: () => Promise<unknown[]>;
  getPlugins: () => Promise<unknown[]>;
  getClaudeResources: () => Promise<unknown>;
  getClaudeSessions: (force?: boolean) => Promise<unknown>;
  getClaudeSessionDetail: (filePath: string) => Promise<unknown>;
  resumeClaudeSession: (sessionId: string, projectPath?: string) => Promise<unknown>;
  openClaudeResource: (path: string) => Promise<void>;
  getPluginRuns: () => Promise<PluginRunRecord[]>;
  runPluginNow: (pluginId: string) => Promise<void>;
  openPluginDataDir: (pluginId: string) => Promise<void>;
  getPluginMarket: () => Promise<PluginMarketIndex>;
  installMarketPlugin: (pluginId: string) => Promise<void>;
  savePlugins: (plugins: unknown[]) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getStats: () => Promise<AppStats>;
  resetStats: () => Promise<void>;
  exportSettingsFile: () => Promise<void>;
  importSettingsFile: () => Promise<CompanionSettings | null>;
  exportStatsFile: () => Promise<void>;
  importStatsFile: () => Promise<AppStats | null>;
  getDoctorReport: () => Promise<DoctorReport>;
  onUpdateStatus: (callback: Listener<UpdateStatus>) => Unsubscribe;
  onPlaySound: (callback: Listener<string>) => Unsubscribe;
  onOpenSection: (callback: Listener<string>) => Unsubscribe;
};

declare global {
  interface Window {
    companion: CompanionApi;
  }
}

const sessionId = "local-pet-session";
const currentSettings: CompanionSettings = {
  ...defaultSettings,
  port: 17321,
  token: "minato-aqua-local",
  privacyMode: "detailed",
  language: "zh",
  enabledSources: ["claude-code", "codex"],
  openSettingsOnStart: true
};

let eventHistory: EventHistoryEntry[] = [];
let startedAt = Date.now();
let eventPort = 17321;
let lastEvent: CompanionEvent | null = null;

const settingsListeners = new Set<Listener<CompanionSettings>>();
const connectionListeners = new Set<Listener<CompanionConnectionStatus>>();
const companionEventListeners = new Set<Listener<CompanionEvent>>();
const permissionRequestListeners = new Set<Listener<PermissionRequest>>();
const permissionResolvedListeners = new Set<Listener<{ id: string }>>();
const idleBubbleSyncListeners = new Set<Listener<unknown>>();
const updateStatusListeners = new Set<Listener<UpdateStatus>>();
const playSoundListeners = new Set<Listener<string>>();
const openSectionListeners = new Set<Listener<string>>();

function subscribe<T>(listeners: Set<Listener<T>>, callback: Listener<T>): Unsubscribe {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function emit<T>(listeners: Set<Listener<T>>, payload: T) {
  listeners.forEach(listener => listener(payload));
}

function normalizeTool(tool?: string): ToolName {
  if (!tool) return "Unknown";
  const normalized = tool.toLowerCase();
  if (normalized.includes("bash") || normalized.includes("shell")) return "Bash";
  if (normalized.includes("edit")) return "Edit";
  if (normalized.includes("write")) return "Write";
  if (normalized.includes("read")) return "Read";
  if (normalized.includes("grep")) return "Grep";
  if (normalized.includes("glob")) return "Glob";
  if (normalized.includes("webfetch")) return "WebFetch";
  if (normalized.includes("websearch")) return "WebSearch";
  if (normalized.includes("notebook")) return "Notebook";
  if (normalized.includes("agent")) return "Agent";
  if (normalized.includes("skill")) return "Skill";
  if (normalized.includes("task")) return "Task";
  if (normalized.includes("mcp")) return "MCP";
  return "Unknown";
}

function toCompanionEvent(event: PetEvent): CompanionEvent {
  const mappedEvent: CompanionEventType = event.event === "idle"
    ? "session_start"
    : event.event === "permission-prompt"
      ? "permission_wait"
      : event.event === "completed"
        ? "done"
        : event.tool
          ? "tool_start"
          : "prompt_submit";

  return {
    id: event.id,
    source: "manual",
    event: mappedEvent,
    sessionId,
    clientType: "desktop",
    clientLabel: "Minato Aqua Code Pet",
    tool: event.tool ? normalizeTool(event.tool) : undefined,
    title: event.title ?? event.event,
    message: event.message ?? event.detail ?? event.title ?? event.event,
    detail: event.detail,
    timestamp: event.timestamp
  };
}

function currentConnection(): CompanionConnectionStatus {
  return {
    port: eventPort,
    serverListening: true,
    tokenSet: true,
    privacyMode: currentSettings.privacyMode,
    connected: true,
    activeSessionId: sessionId,
    activeClientType: "desktop",
    activeClientLabel: "Minato Aqua Code Pet",
    lastEventAt: lastEvent?.timestamp,
    lastEventTitle: lastEvent?.title,
    lastEventType: lastEvent?.event,
    lastEventSource: lastEvent?.source
  };
}

function applyCompanionEvent(event: CompanionEvent) {
  lastEvent = event;
  eventHistory = [{ id: event.id, event, timestamp: event.timestamp }, ...eventHistory].slice(0, currentSettings.eventHistoryLimit);
  emit(companionEventListeners, event);
  emit(connectionListeners, currentConnection());

  if (event.event === "permission_wait") {
    emit(permissionRequestListeners, {
      id: event.id,
      toolName: event.tool ?? "Unknown",
      toolDetail: event.detail ?? event.message,
      sessionId,
      timestamp: event.timestamp,
      rawPayload: {}
    });
  }
}

function buildStats(): AppStats {
  const stats: AppStats = {
    ...defaultStats,
    toolUsage: {},
    eventTypeCounts: {},
    dailyStats: {},
    hourlyActivity: new Array(24).fill(0),
    firstStartTime: startedAt,
    lastEventTime: lastEvent?.timestamp ?? 0,
    totalRuntime: Math.max(0, Date.now() - startedAt)
  };

  for (const entry of eventHistory) {
    const event = entry.event;
    stats.eventTypeCounts[event.event] = (stats.eventTypeCounts[event.event] ?? 0) + 1;
    if (event.tool) stats.toolUsage[event.tool] = (stats.toolUsage[event.tool] ?? 0) + 1;
    if (event.event === "error") stats.errorCount++;
    if (event.event === "permission_wait") stats.permissionRequests++;
    const date = new Date(event.timestamp);
    const day = date.toISOString().slice(0, 10);
    stats.hourlyActivity[date.getHours()]++;
    stats.dailyStats[day] ??= { events: 0, toolCalls: 0, sessions: 0 };
    stats.dailyStats[day].events++;
    if (event.tool) stats.dailyStats[day].toolCalls++;
    if (event.event === "session_start") stats.dailyStats[day].sessions++;
  }

  stats.totalSessions = 1;
  return stats;
}

function sessionHistory(): SessionHistory[] {
  return [{
    sessionId,
    title: "Minato Aqua Code Pet",
    clientLabel: "Minato Aqua Code Pet",
    startedAt,
    lastEventAt: lastEvent?.timestamp ?? startedAt,
    eventCount: eventHistory.length,
    status: lastEvent?.event === "error" ? "error" : lastEvent?.event === "done" ? "done" : "active",
    events: [...eventHistory].reverse()
  }];
}

function updateStatus(): UpdateStatus {
  return {
    checking: false,
    available: false,
    upToDate: true,
    downloading: false,
    downloaded: false,
    error: undefined,
    version: undefined,
    progress: undefined
  };
}

function hooksStatus() {
  return {
    installed: false,
    configExists: false,
    hookCount: 0,
    requiredCount: 6,
    missingEvents: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop"],
    commandMatches: false
  };
}

function doctorReport(): DoctorReport {
  const hooks = hooksStatus();
  return {
    generatedAt: Date.now(),
    appVersion: "0.0.0-dev",
    connection: currentConnection(),
    providers: {
      "claude-code": {
        hooks,
        forwarder: { expectedPath: "scripts/hook-forwarder.js", exists: true }
      },
      codex: {
        hooks,
        forwarder: { expectedPath: "scripts/hook-forwarder.js", exists: true }
      }
    },
    hooks,
    forwarder: {
      expectedPath: "scripts/hook-forwarder.js",
      exists: true,
      autoStartMarkerPath: "",
      autoStartMarkerExists: false
    },
    update: {
      ...updateStatus(),
      autoUpdateEnabled: false
    },
    plugins: {
      total: 0,
      enabled: 0,
      trusted: 0,
      manifestErrors: 0
    },
    recent: {
      lastEventAt: lastEvent?.timestamp,
      lastEventTitle: lastEvent?.title,
      lastError: lastEvent?.event === "error" ? lastEvent.message : undefined
    }
  };
}

function bindPetApi(petApi: PetApi) {
  void petApi.getSnapshot().then(snapshot => {
    startedAt = snapshot.startedAt;
    eventPort = snapshot.eventPort;
    eventHistory = snapshot.events.map(event => {
      const companionEvent = toCompanionEvent(event);
      lastEvent = lastEvent ?? companionEvent;
      return { id: companionEvent.id, event: companionEvent, timestamp: companionEvent.timestamp };
    });
    if (snapshot.events[0]) lastEvent = toCompanionEvent(snapshot.events[0]);
    emit(connectionListeners, currentConnection());
  });

  petApi.onPetEvent(event => applyCompanionEvent(toCompanionEvent(event)));
  petApi.onSnapshot(snapshot => {
    startedAt = snapshot.startedAt;
    eventPort = snapshot.eventPort;
    eventHistory = snapshot.events.map(event => {
      const companionEvent = toCompanionEvent(event);
      return { id: companionEvent.id, event: companionEvent, timestamp: companionEvent.timestamp };
    });
    lastEvent = eventHistory[0]?.event ?? null;
    emit(connectionListeners, currentConnection());
  });
}

export function installClawdCompat() {
  if (window.companion) return;

  const petApi = window.petAPI;
  if (petApi) bindPetApi(petApi);

  window.companion = {
    getSettings: async () => currentSettings,
    saveSettings: async next => {
      Object.assign(currentSettings, next);
      emit(settingsListeners, currentSettings);
      emit(connectionListeners, currentConnection());
      return currentSettings;
    },
    getConnectionStatus: async () => currentConnection(),
    checkHooks: async () => hooksStatus(),
    installHooks: async () => undefined,
    repairHooks: async () => undefined,
    removeHooks: async () => undefined,
    openSettings: async () => undefined,
    minimizeSettings: async () => petApi?.minimizePanel(),
    toggleMaximizeSettings: async () => petApi?.toggleMaximizePanel(),
    closeSettings: async () => petApi?.closePanel(),
    onEvent: callback => subscribe(companionEventListeners, callback),
    onSettings: callback => subscribe(settingsListeners, callback),
    onConnection: callback => subscribe(connectionListeners, callback),
    setPetInteractive: async () => undefined,
    updatePermissionCardRect: async () => undefined,
    dragPetTo: async () => undefined,
    movePetBy: async () => undefined,
    onPermissionRequest: callback => subscribe(permissionRequestListeners, callback),
    onPermissionResolved: callback => subscribe(permissionResolvedListeners, callback),
    respondPermission: async response => emit(permissionResolvedListeners, { id: response.id }),
    checkForUpdates: async () => updateStatus(),
    installUpdate: async () => undefined,
    getUpdateStatus: async () => updateStatus(),
    getAppVersion: async () => "0.0.0-dev",
    getTokenStats: async () => ({ sessions: [], daily: [], modelTotals: [], dailyTotals: [], projectTotals: [], recentRequests: [], totalTokens: 0, totalCostUsd: 0, totalSessions: 0, totalRequests: 0, cacheHitRatio: 0, lastScannedAt: Date.now(), scanning: false }),
    previewSound: async () => undefined,
    getDefaultSoundPaths: async () => ({}),
    previewSoundFile: async () => undefined,
    pickSoundFile: async () => null,
    syncIdleBubble: async payload => emit(idleBubbleSyncListeners, payload),
    onIdleBubbleSync: callback => subscribe(idleBubbleSyncListeners, callback),
    getEventHistory: async () => eventHistory,
    getSessionHistory: async () => sessionHistory(),
    clearEventHistory: async () => { eventHistory = []; },
    exportEventHistoryFile: async () => undefined,
    getMonitors: async () => [],
    getPlugins: async () => [],
    getClaudeResources: async () => ({ summary: { skills: 0, plugins: 0, mcp: 0 }, skills: [], plugins: [], mcp: [], scannedAt: Date.now(), paths: { claudeDir: "~/.claude", claudeJson: "~/.claude.json" } }),
    getClaudeSessions: async () => ({ sessions: [], scannedAt: Date.now(), projectsDir: "~/.claude/projects" }),
    getClaudeSessionDetail: async () => null,
    resumeClaudeSession: async sessionId => ({ ok: false, command: `claude --resume ${sessionId}` }),
    openClaudeResource: async () => undefined,
    getPluginRuns: async () => [],
    runPluginNow: async () => undefined,
    openPluginDataDir: async () => undefined,
    getPluginMarket: async () => ({ version: 1, plugins: [] }),
    installMarketPlugin: async () => undefined,
    savePlugins: async () => undefined,
    openExternal: async url => {
      if (/^https?:\/\//.test(url)) window.open(url, "_blank", "noopener,noreferrer");
    },
    getStats: async () => buildStats(),
    resetStats: async () => { eventHistory = []; },
    exportSettingsFile: async () => undefined,
    importSettingsFile: async () => null,
    exportStatsFile: async () => undefined,
    importStatsFile: async () => null,
    getDoctorReport: async () => doctorReport(),
    onUpdateStatus: callback => subscribe(updateStatusListeners, callback),
    onPlaySound: callback => subscribe(playSoundListeners, callback),
    onOpenSection: callback => subscribe(openSectionListeners, callback)
  };
}
