import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } from "electron";
import { autoUpdater } from "electron-updater";
import { spawn } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { extname, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { isPetEvent, PetEvent, PetState } from "../shared/events";

type RuntimeStats = {
  toolUsage: Record<string, number>;
  eventTypeCounts: Record<string, number>;
  totalSessions: number;
  dailyStats: Record<string, { events: number; toolCalls: number; sessions: number }>;
  errorCount: number;
  permissionRequests: number;
  permissionApproved: number;
  permissionDenied: number;
  totalRuntime: number;
  hourlyActivity: number[];
  firstStartTime: number;
  lastEventTime: number;
};

type UpdateStatus = {
  checking: boolean;
  available: boolean;
  upToDate: boolean;
  version?: string;
  downloaded: boolean;
  downloading: boolean;
  progress?: number;
  error?: string;
  lastCheckedAt?: number;
};

const eventPort = 17321;
const appStartedAt = Date.now();
const singleInstanceLock = app.requestSingleInstanceLock();
let petWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let eventServer: ReturnType<typeof createServer> | null = null;
let tray: Tray | null = null;
let currentState: PetState = "idle";
let eventHistory: PetEvent[] = [];
let runtimeStats: RuntimeStats | null = null;
let runtimeStatsDirty = false;
const activePermissionIds = new Set<string>();
let autoUpdaterConfigured = false;
let updateStatus: UpdateStatus = {
  checking: false,
  available: false,
  upToDate: false,
  downloaded: false,
  downloading: false
};
let companionSettings: Record<string, any> = {
  port: eventPort,
  token: "minato-aqua-local",
  privacyMode: "detailed",
  showBubbles: true,
  editPosition: false,
  alwaysOnTop: true,
  clickThrough: false,
  petEnabled: true,
  petScale: 1,
  viewScale: 1,
  petOpacity: 1,
  clawdScale: 0.8,
  clawdOpacity: 1,
  thoughtScale: 0.75,
  thoughtOpacity: 1,
  cardScale: 0.75,
  cardOpacity: 1,
  bubbleScale: 1,
  bubbleOpacity: 1,
  bubbleDuration: 8,
  permissionScale: 0.9,
  permissionOpacity: 1,
  toolStreamMinDuration: 0.8,
  showStatusProp: true,
  multiSessionEnabled: false,
  permissionDialogEnabled: true,
  showSessionTitle: true,
  companionScale: 0.5,
  companionIdleAnimations: ["thinking", "idle", "waiting_permission"],
  mainClawdIdleAnimation: "random",
  launchAtLogin: false,
  openSettingsOnStart: true,
  autoStartWithCli: false,
  autoUpdateEnabled: false,
  enabledSources: ["claude-code", "codex"],
  doneSound: false,
  notificationsEnabled: true,
  theme: "system",
  uiStyle: "classic",
  language: "zh",
  autoStartDelay: 0,
  autoStartMinimized: false,
  displayMonitorId: "primary",
  monitorPositions: [],
  notificationRules: [
    { eventType: "done", enabled: true, systemNotification: true, playSound: true, showBubble: true },
    { eventType: "error", enabled: true, systemNotification: true, playSound: true, showBubble: true },
    { eventType: "permission_wait", enabled: true, systemNotification: true, playSound: true, showBubble: true },
    { eventType: "notification", enabled: true, systemNotification: true, playSound: false, showBubble: true }
  ],
  customPlugins: [],
  pomodoroEnabled: false,
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  sound: {
    enabled: true,
    volume: 0.6,
    onDone: true,
    onError: true,
    onPermission: true,
    onSessionStart: false,
    fileDone: null,
    fileError: null,
    filePermission: null,
    fileSessionStart: null,
    eventFiles: {}
  },
  eventHistoryLimit: 100,
  claudeRoutingMode: "auto",
  claudeProviderPinned: true,
  claudeRoutes: [
    { id: "claude-official", name: "Claude Official", baseUrl: "https://www.anthropic.com/claude-code", enabled: true },
    { id: "anyrouter", name: "anyrouter", baseUrl: "https://anyrouter.top", enabled: true },
    { id: "hkc", name: "神秘大佬", baseUrl: "https://hkcn2.dpdns.org/api", enabled: true },
    { id: "micuai-free2", name: "米醋_free2", baseUrl: "https://api-slb.micuapi.ai", enabled: true },
    { id: "micuai-max", name: "米醋_max", baseUrl: "https://www.openclaudecode.cn", enabled: true }
  ],
  activeClaudeRouteId: "claude-official",
  idleAnim: {
    enabled: true,
    selectedSprites: ["idle"],
    intervalMin: 12,
    intervalMax: 28,
    repeatMin: 1,
    repeatMax: 2
  },
  stateAnimations: {}
};

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showPetWindow();
    if (companionSettings.openSettingsOnStart) showPanelWindow();
  });
}

function getPetWindowBounds() {
  const width = 260;
  const height = 300;
  const cursorPoint = screen.getCursorScreenPoint();
  const workArea = screen.getDisplayNearestPoint(cursorPoint).workArea;

  return {
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 24
  };
}

function rendererUrl(view?: "panel") {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (!devServerUrl) return null;
  return view ? `${devServerUrl}?view=${view}` : devServerUrl;
}

function loadRenderer(window: BrowserWindow, view?: "panel") {
  const url = rendererUrl(view);
  if (url) {
    window.loadURL(url);
    return;
  }

  window.loadFile(join(__dirname, "../../dist/index.html"), view ? { query: { view } } : undefined);
}

function getAppIcon() {
  const candidates = [
    join(__dirname, "../../src/main/assets/kuaclock.png"),
    join(process.cwd(), "src/main/assets/kuaclock.png"),
    join(process.resourcesPath ?? "", "kuaclock.png")
  ];
  const iconPath = candidates.find(candidate => candidate && existsSync(candidate));
  if (!iconPath) return createTrayIcon();
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? createTrayIcon() : image;
}

function isPetEnabled() {
  return companionSettings.petEnabled !== false;
}

function isPetAlwaysOnTop() {
  return companionSettings.alwaysOnTop === true;
}

function applyPetAlwaysOnTopSetting() {
  if (!petWindow || petWindow.isDestroyed()) return;

  if (isPetAlwaysOnTop()) {
    petWindow.setAlwaysOnTop(true, "screen-saver");
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    return;
  }

  petWindow.setAlwaysOnTop(false);
  petWindow.setVisibleOnAllWorkspaces(false);
}

function createPetWindow() {
  if (!isPetEnabled()) return;
  if (petWindow && !petWindow.isDestroyed()) return;

  const bounds = getPetWindowBounds();
  const alwaysOnTop = isPetAlwaysOnTop();

  petWindow = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop,
    resizable: false,
    backgroundColor: "#00000000",
    hasShadow: false,
    skipTaskbar: true,
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setBackgroundColor("#00000000");
  applyPetAlwaysOnTopSetting();
  loadRenderer(petWindow);

  petWindow.on("show", updateTrayMenu);
  petWindow.on("hide", updateTrayMenu);
  petWindow.on("minimize", updateTrayMenu);
  petWindow.on("restore", updateTrayMenu);
  petWindow.on("closed", () => {
    petWindow = null;
    updateTrayMenu();
  });
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) return panelWindow;

  panelWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 860,
    minHeight: 620,
    title: "Minato Aqua Code Pet",
    frame: false,
    backgroundColor: "#f5efe3",
    autoHideMenuBar: true,
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadRenderer(panelWindow, "panel");
  panelWindow.on("show", updateTrayMenu);
  panelWindow.on("hide", updateTrayMenu);
  panelWindow.on("minimize", updateTrayMenu);
  panelWindow.on("restore", updateTrayMenu);
  panelWindow.on("closed", () => {
    panelWindow = null;
    updateTrayMenu();
  });

  return panelWindow;
}

function showPanelWindow() {
  const window = createPanelWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  updateTrayMenu();
}

function hidePanelWindow() {
  panelWindow?.hide();
  updateTrayMenu();
}

function togglePanelWindow() {
  if (panelWindow?.isVisible()) {
    hidePanelWindow();
  } else {
    showPanelWindow();
  }
}

function createTrayIcon() {
  const size = 16;
  const center = (size - 1) / 2;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const distance = Math.hypot(x - center, y - center);
      const inside = distance <= 7;
      pixels[offset] = inside ? 255 : 0;
      pixels[offset + 1] = inside ? 190 : 0;
      pixels[offset + 2] = inside ? 72 : 0;
      pixels[offset + 3] = inside ? 255 : 0;
    }
  }

  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 1 });
}

function showPetWindow() {
  if (!isPetEnabled()) {
    hidePetWindow();
    return;
  }

  if (!petWindow) createPetWindow();
  if (!petWindow) return;

  petWindow.setBounds(getPetWindowBounds());
  petWindow.setOpacity(1);
  petWindow.setIgnoreMouseEvents(false);
  if (petWindow.isMinimized()) petWindow.restore();
  petWindow.show();
  petWindow.focus();
  applyPetAlwaysOnTopSetting();
  if (isPetAlwaysOnTop()) petWindow.moveTop();
  updateTrayMenu();
}

function hidePetWindow() {
  petWindow?.hide();
  updateTrayMenu();
}

function togglePetWindow() {
  if (!isPetEnabled()) return;

  if (petWindow?.isVisible()) {
    hidePetWindow();
  } else {
    showPetWindow();
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const petEnabled = isPetEnabled();
  const isPetVisible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible());
  const isPanelVisible = Boolean(panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible());

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: isPetVisible ? "隐藏桌宠" : "显示桌宠",
        enabled: petEnabled,
        click: isPetVisible ? hidePetWindow : showPetWindow
      },
      {
        label: isPanelVisible ? "隐藏面板" : "显示面板",
        click: isPanelVisible ? hidePanelWindow : showPanelWindow
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => app.quit()
      }
    ])
  );
}

function createTray() {
  const trayIcon = getAppIcon().resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip("Claude Codex Pet is running");
  updateTrayMenu();

  tray.on("click", showPetWindow);
}

function broadcastUpdateStatus() {
  petWindow?.webContents.send("companion:update-status", updateStatus);
  panelWindow?.webContents.send("companion:update-status", updateStatus);
}

function setUpdateStatus(next: UpdateStatus) {
  updateStatus = next;
  broadcastUpdateStatus();
}

function configureAutoUpdater() {
  if (autoUpdaterConfigured) return;
  autoUpdaterConfigured = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "Doulor",
    repo: "Clawd-Companion",
    releaseType: "release"
  });

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus({
      ...updateStatus,
      checking: true,
      error: undefined,
      lastCheckedAt: Date.now()
    });
  });

  autoUpdater.on("update-available", info => {
    setUpdateStatus({
      ...updateStatus,
      checking: false,
      available: true,
      upToDate: false,
      version: info.version
    });
  });

  autoUpdater.on("update-not-available", () => {
    setUpdateStatus({
      checking: false,
      available: false,
      upToDate: true,
      downloaded: false,
      downloading: false,
      progress: undefined,
      version: undefined,
      error: undefined,
      lastCheckedAt: Date.now()
    });
  });

  autoUpdater.on("download-progress", progress => {
    setUpdateStatus({
      ...updateStatus,
      checking: false,
      downloading: true,
      progress: progress.percent
    });
  });

  autoUpdater.on("update-downloaded", info => {
    setUpdateStatus({
      checking: false,
      available: true,
      upToDate: false,
      version: info.version,
      downloaded: true,
      downloading: false,
      progress: 100,
      error: undefined,
      lastCheckedAt: Date.now()
    });
  });

  autoUpdater.on("error", error => {
    setUpdateStatus({
      ...updateStatus,
      checking: false,
      downloading: false,
      error: error.message,
      lastCheckedAt: Date.now()
    });
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    const error = "Update checks are only available in packaged builds.";
    setUpdateStatus({
      ...updateStatus,
      checking: false,
      downloading: false,
      error,
      lastCheckedAt: Date.now()
    });
    return { ok: false, error };
  }

  configureAutoUpdater();
  try {
    const result = await autoUpdater.checkForUpdates();
    return result ? { ok: true } : { ok: false, error: "No update metadata was returned." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setUpdateStatus({
      ...updateStatus,
      checking: false,
      downloading: false,
      error: message,
      lastCheckedAt: Date.now()
    });
    return { ok: false, error: message };
  }
}

function installUpdate() {
  if (!app.isPackaged) {
    return { ok: false, error: "Update installation is only available in packaged builds." };
  }
  if (!updateStatus.downloaded) {
    return { ok: false, error: "No downloaded update is ready to install." };
  }

  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function applyLaunchAtLoginSetting() {
  const openAtLogin = companionSettings.launchAtLogin === true;
  const options = app.isPackaged
    ? { openAtLogin, path: process.execPath }
    : { openAtLogin, path: process.execPath, args: [app.getAppPath()] };

  try {
    app.setLoginItemSettings(options);
  } catch {
    // Login item support is platform and build dependent.
  }
}

function runStartupBehaviors() {
  if (process.platform === "win32") {
    app.setAppUserModelId("ClaudeCodexPet.ClawdCompanion");
  }
  applyLaunchAtLoginSetting();
  if (companionSettings.openSettingsOnStart) showPanelWindow();
  if (companionSettings.autoUpdateEnabled && app.isPackaged) {
    setTimeout(() => void checkForUpdates(), 1500);
  }
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://127.0.0.1:5173",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload));
}

function getSnapshot() {
  return {
    state: currentState,
    events: eventHistory,
    startedAt: appStartedAt,
    eventPort
  };
}

const sessionId = "local-pet-session";

type CompanionEventType = "session_start" | "prompt_submit" | "tool_start" | "tool_end" | "notification" | "permission_wait" | "done" | "error" | "heartbeat" | "git_operation";

type CompanionEvent = {
  id: string;
  source: "claude-code" | "codex" | "cc-haha" | "manual";
  event: CompanionEventType;
  sessionId?: string;
  clientType?: "cli" | "desktop" | "vscode" | "unknown";
  clientLabel?: string;
  tool?: string;
  cwd?: string;
  title: string;
  message: string;
  detail?: string;
  timestamp: number;
};

type ManagedNotificationEventType = "done" | "error" | "permission_wait" | "notification";
type SoundNotificationEventType = Exclude<ManagedNotificationEventType, "notification">;
type BuiltInSound = "done" | "error" | "permission";

type NotificationRule = {
  eventType: CompanionEventType;
  enabled: boolean;
  systemNotification: boolean;
  playSound: boolean;
  showBubble: boolean;
};

function normalizeTool(tool?: string) {
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
        : event.event === "error"
          ? "error"
          : event.title === "Tool completed"
            ? "tool_end"
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

const managedNotificationEventTypes: ManagedNotificationEventType[] = ["done", "error", "permission_wait", "notification"];
const soundNotificationEventTypes: SoundNotificationEventType[] = ["done", "error", "permission_wait"];
const defaultWindowsSoundNames: Record<BuiltInSound, string[]> = {
  done: ["Windows Notify Calendar.wav", "notify.wav"],
  error: ["Windows Error.wav", "Windows Critical Stop.wav"],
  permission: ["Windows Notify System Generic.wav", "Windows Exclamation.wav"]
};
const soundDataUrlCache = new Map<string, string>();

function isManagedNotificationEvent(eventType: CompanionEventType): eventType is ManagedNotificationEventType {
  return managedNotificationEventTypes.includes(eventType as ManagedNotificationEventType);
}

function isSoundNotificationEvent(eventType: CompanionEventType): eventType is SoundNotificationEventType {
  return soundNotificationEventTypes.includes(eventType as SoundNotificationEventType);
}

function defaultNotificationRule(eventType: ManagedNotificationEventType): NotificationRule {
  return {
    eventType,
    enabled: true,
    systemNotification: true,
    playSound: isSoundNotificationEvent(eventType),
    showBubble: true
  };
}

function getNotificationRule(eventType: ManagedNotificationEventType): NotificationRule {
  const rules = Array.isArray(companionSettings.notificationRules) ? companionSettings.notificationRules as NotificationRule[] : [];
  const rule = rules.find(item => item?.eventType === eventType);
  return rule ? { ...defaultNotificationRule(eventType), ...rule, eventType } : defaultNotificationRule(eventType);
}

function builtInSoundNameForEvent(eventType: SoundNotificationEventType): BuiltInSound {
  if (eventType === "permission_wait") return "permission";
  return eventType;
}

function isBuiltInSound(value: unknown): value is BuiltInSound {
  return value === "done" || value === "error" || value === "permission";
}

function windowsMediaSoundPath(name: BuiltInSound): string | null {
  if (process.platform !== "win32") return null;
  for (const fileName of defaultWindowsSoundNames[name]) {
    const candidate = join("C:\\Windows\\Media", fileName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function isAudioPath(filePath: string): boolean {
  return /\.(wav|mp3)$/i.test(filePath);
}

function resolveSoundFile(override: string | null | undefined, name: BuiltInSound): string | null {
  if (override) {
    const candidate = isAbsolute(override) ? override : resolve(app.getAppPath(), override);
    return existsSync(candidate) && isAudioPath(candidate) ? candidate : null;
  }
  return windowsMediaSoundPath(name);
}

function fileToDataUrl(filePath: string): string | null {
  if (!isAudioPath(filePath) || !existsSync(filePath)) return null;
  const cached = soundDataUrlCache.get(filePath);
  if (cached) {
    soundDataUrlCache.delete(filePath);
    soundDataUrlCache.set(filePath, cached);
    return cached;
  }

  try {
    const buffer = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const mime = ext === ".mp3" ? "audio/mpeg" : "audio/wav";
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    if (soundDataUrlCache.size >= 8) {
      const oldest = soundDataUrlCache.keys().next().value;
      if (oldest) soundDataUrlCache.delete(oldest);
    }
    soundDataUrlCache.set(filePath, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

function soundOverrideForEvent(eventType: SoundNotificationEventType): string | null {
  const sound = companionSettings.sound ?? {};
  const eventOverride = sound.eventFiles?.[eventType];
  if (typeof eventOverride === "string" && eventOverride.trim()) return eventOverride;
  if (eventType === "done") return sound.fileDone ?? null;
  if (eventType === "error") return sound.fileError ?? null;
  if (eventType === "permission_wait") return sound.filePermission ?? null;
  return null;
}

function soundDataUrlForEvent(eventType: SoundNotificationEventType): string | null {
  const sound = companionSettings.sound ?? {};
  if (sound.enabled !== true) return null;
  const file = resolveSoundFile(soundOverrideForEvent(eventType), builtInSoundNameForEvent(eventType));
  return file ? fileToDataUrl(file) : null;
}

function previewSoundDataUrl(name: BuiltInSound) {
  const file = resolveSoundFile(null, name);
  const dataUrl = file ? fileToDataUrl(file) : null;
  return dataUrl ? { ok: true, dataUrl } : { ok: false, error: "Sound file not found." };
}

function previewSoundFile(filePath: string) {
  const dataUrl = fileToDataUrl(filePath);
  return dataUrl ? { ok: true, dataUrl } : { ok: false, error: "Unable to read audio file." };
}

function playSoundDataUrl(dataUrl: string) {
  const targetWindow = petWindow && !petWindow.isDestroyed() ? petWindow : panelWindow;
  targetWindow?.webContents.send("companion:play-sound", dataUrl);
}

function notificationBody(event: CompanionEvent): string {
  const lines = [event.message];
  if (event.tool) lines.push(`Tool: ${event.tool}`);
  if (event.detail && event.detail !== event.message) lines.push(event.detail);
  return lines.filter(Boolean).join("\n").slice(0, 300);
}

function showWindowsNotification(event: CompanionEvent) {
  if (process.platform !== "win32" || !Notification.isSupported()) return;
  new Notification({
    title: event.title || "Clawd Companion",
    body: notificationBody(event),
    icon: getAppIcon(),
    silent: true
  }).show();
}

function handleCompanionAlerts(event: CompanionEvent) {
  if (!isManagedNotificationEvent(event.event)) return;

  const rule = getNotificationRule(event.event);

  if (companionSettings.notificationsEnabled !== false) {
    showWindowsNotification(event);
  }

  if (isSoundNotificationEvent(event.event) && rule.enabled !== false && rule.playSound !== false) {
    const dataUrl = soundDataUrlForEvent(event.event);
    if (dataUrl) playSoundDataUrl(dataUrl);
  }
}

type ClaudeResourceKind = "skill" | "plugin" | "mcp";

type ClaudeResourceItem = {
  id: string;
  kind: ClaudeResourceKind;
  name: string;
  description?: string;
  path?: string;
  enabled?: boolean;
  source: "claude" | "claude-json" | "unknown";
  detail?: string;
};

type ClaudeInstalledPluginEntry = Record<string, unknown> & {
  scope?: string;
  installPath?: string;
  path?: string;
  version?: string;
  description?: string;
  enabled?: boolean;
};

function getClaudePaths() {
  const home = homedir();
  return {
    claudeDir: join(home, ".claude"),
    claudeJson: join(home, ".claude.json"),
    projectsDir: join(home, ".claude", "projects")
  };
}

function readTextIfExists(filePath: string) {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return "";
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const text = readTextIfExists(filePath);
    if (!text.trim()) return null;
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isDirectoryPath(dirPath: string) {
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function extractMarkdownDescription(markdown: string) {
  const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatter) {
    const description = frontmatter[1].match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
    if (description) return description;
  }

  return markdown
    .replace(/^---[\s\S]*?---/, "")
    .split(/\n\s*\n/)
    .map(block => block.replace(/^#+\s*/gm, "").trim())
    .find(Boolean);
}

function readClaudeEnabledPlugins(claudeDir: string): Record<string, boolean> | null {
  const settings = readJsonObject(join(claudeDir, "settings.json"));
  const enabledPlugins = settings?.enabledPlugins;
  if (!enabledPlugins || typeof enabledPlugins !== "object" || Array.isArray(enabledPlugins)) return null;
  return enabledPlugins as Record<string, boolean>;
}

function readClaudeInstalledPlugins(claudeDir: string): Record<string, unknown> | null {
  const registry = readJsonObject(join(claudeDir, "plugins", "installed_plugins.json"));
  const plugins = registry?.plugins;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) return null;
  return plugins as Record<string, unknown>;
}

function normalizeInstalledPluginEntries(value: unknown): ClaudeInstalledPluginEntry[] {
  if (Array.isArray(value)) return value.filter(entry => entry && typeof entry === "object" && !Array.isArray(entry)) as ClaudeInstalledPluginEntry[];
  if (value && typeof value === "object") return [value as ClaudeInstalledPluginEntry];
  return [];
}

function scanSkillDirectory(skillDir: string, name: string, detail = "SKILL.md"): ClaudeResourceItem | null {
  const skillFile = join(skillDir, "SKILL.md");
  if (!readTextIfExists(skillFile)) return null;
  return {
    id: `skill:${name}`,
    kind: "skill" as const,
    name,
    description: extractMarkdownDescription(readTextIfExists(skillFile)),
    path: skillDir,
    source: "claude" as const,
    detail
  };
}

function scanClaudeSkills(claudeDir: string): ClaudeResourceItem[] {
  const found = new Map<string, ClaudeResourceItem>();
  const skillsDir = join(claudeDir, "skills");
  try {
    if (existsSync(skillsDir)) {
      for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        const skillDir = join(skillsDir, entry.name);
        if (!isDirectoryPath(skillDir)) continue;
        const item = scanSkillDirectory(skillDir, entry.name);
        if (item) found.set(item.id, item);
      }
    }

    const enabledPlugins = readClaudeEnabledPlugins(claudeDir) ?? {};
    const installedPlugins = readClaudeInstalledPlugins(claudeDir) ?? {};
    for (const [pluginName, enabled] of Object.entries(enabledPlugins)) {
      if (enabled !== true) continue;
      for (const entry of normalizeInstalledPluginEntries(installedPlugins[pluginName])) {
        const installPath = typeof entry.installPath === "string" ? entry.installPath : typeof entry.path === "string" ? entry.path : "";
        const pluginSkillsDir = installPath ? join(installPath, "skills") : "";
        if (!pluginSkillsDir || !isDirectoryPath(pluginSkillsDir)) continue;
        for (const skillEntry of readdirSync(pluginSkillsDir, { withFileTypes: true })) {
          const skillDir = join(pluginSkillsDir, skillEntry.name);
          if (!isDirectoryPath(skillDir)) continue;
          const item = scanSkillDirectory(skillDir, skillEntry.name, `plugin: ${pluginName}`);
          if (item && !found.has(item.id)) found.set(item.id, item);
        }
      }
    }
  } catch {
    // Return whatever was discovered before an unreadable plugin or skill directory.
  }

  return Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function scanClaudePlugins(claudeDir: string): ClaudeResourceItem[] {
  const pluginsDir = join(claudeDir, "plugins");
  const registryPlugins = readClaudeInstalledPlugins(claudeDir);
  if (registryPlugins) {
    const enabledPlugins = readClaudeEnabledPlugins(claudeDir);
    return Object.entries(registryPlugins)
      .map(([name, value]) => {
        const entries = normalizeInstalledPluginEntries(value);
        const first = entries[0] ?? {};
        const version = entries.find(entry => typeof entry.version === "string")?.version;
        const scopes = Array.from(new Set(entries.map(entry => typeof entry.scope === "string" ? entry.scope : "").filter(Boolean)));
        const path = typeof first.installPath === "string" ? first.installPath : typeof first.path === "string" ? first.path : pluginsDir;
        return {
          id: `plugin:${name}`,
          kind: "plugin" as const,
          name,
          description: typeof first.description === "string" ? first.description : undefined,
          path,
          enabled: enabledPlugins ? enabledPlugins[name] === true : entries.every(entry => entry.enabled !== false),
          source: "claude" as const,
          detail: [version ? `version ${version}` : "installed_plugins.json", scopes.length ? scopes.join("/") : ""].filter(Boolean).join(" · ")
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  try {
    if (!existsSync(pluginsDir)) return [];
    return readdirSync(pluginsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        id: `plugin:${entry.name}`,
        kind: "plugin" as const,
        name: entry.name,
        description: "Claude Code plugin directory",
        path: join(pluginsDir, entry.name),
        enabled: true,
        source: "claude" as const,
        detail: "directory"
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function summarizeMcpServer(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "configured";
  const server = value as Record<string, unknown>;
  if (typeof server.command === "string") return `command: ${server.command}`;
  if (typeof server.url === "string") return `url: ${server.url}`;
  if (typeof server.type === "string") return `type: ${server.type}`;
  return Object.keys(server).filter(key => !/token|secret|key|password/i.test(key)).slice(0, 4).join(", ") || "configured";
}

function scanClaudeMcp(claudeJson: string): ClaudeResourceItem[] {
  const config = readJsonObject(claudeJson);
  const servers = config?.mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];

  return Object.entries(servers as Record<string, unknown>)
    .map(([name, server]) => ({
      id: `mcp:${name}`,
      kind: "mcp" as const,
      name,
      description: "Claude Code MCP server",
      path: claudeJson,
      enabled: true,
      source: "claude-json" as const,
      detail: summarizeMcpServer(server)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getClaudeResourcesSnapshot() {
  const paths = getClaudePaths();
  const skills = scanClaudeSkills(paths.claudeDir);
  const plugins = scanClaudePlugins(paths.claudeDir);
  const mcp = scanClaudeMcp(paths.claudeJson);
  return {
    summary: { skills: skills.length, plugins: plugins.length, mcp: mcp.length },
    skills,
    plugins,
    mcp,
    scannedAt: Date.now(),
    paths
  };
}

function isAllowedClaudeResourcePath(targetPath: string) {
  const paths = getClaudePaths();
  const resolvedTarget = resolve(targetPath);
  const resolvedClaudeDir = resolve(paths.claudeDir);
  const resolvedClaudeJson = resolve(paths.claudeJson);
  return resolvedTarget === resolvedClaudeJson || resolvedTarget === resolvedClaudeDir || resolvedTarget.startsWith(`${resolvedClaudeDir}\\`) || resolvedTarget.startsWith(`${resolvedClaudeDir}/`);
}

type ClaudeSessionStatus = "valid" | "empty" | "corrupt";

type ClaudeSessionIndexItem = {
  sessionId: string;
  title: string;
  firstPrompt?: string;
  projectName: string;
  projectPath?: string;
  encodedProject: string;
  filePath: string;
  messageCount: number;
  lastMessageAt: number;
  createdAt: number;
  status: ClaudeSessionStatus;
  model?: string;
  branch?: string;
};

type ClaudeSessionMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "unknown";
  text: string;
  timestamp?: number;
  model?: string;
  toolName?: string;
};

const CLAUDE_SESSION_CACHE_TTL = 60 * 1000;
const CLAUDE_SESSION_STALE_TTL = 7 * 24 * 60 * 60 * 1000;
const CLAUDE_SESSION_SCAN_CONCURRENCY = 10;
let claudeSessionCache: { data: { sessions: ClaudeSessionIndexItem[]; scannedAt: number; projectsDir: string }; timestamp: number } | null = null;
let pendingClaudeSessionScan: Promise<{ sessions: ClaudeSessionIndexItem[]; scannedAt: number; projectsDir: string }> | null = null;

function decodeClaudeProjectName(encodedProject: string) {
  if (!encodedProject) return "Claude Code";
  const decoded = encodedProject.replace(/-/g, "\\");
  return decoded.replace(/\\+$/g, "") || encodedProject;
}

async function collectClaudeProjectDirs(projectsDir: string) {
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => ({ encodedProject: entry.name, projectDir: join(projectsDir, entry.name) }));
  } catch {
    return [];
  }
}

async function scanClaudeProjectDirectory(projectDir: string, encodedProject: string) {
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    const sessions: ClaudeSessionIndexItem[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const filePath = join(projectDir, entry.name);
      try {
        sessions.push(await scanSingleClaudeSessionStream(filePath, encodedProject));
      } catch {
        // Skip unreadable session files in the index scan.
      }
    }
    return sessions;
  } catch {
    return [];
  }
}

async function scanSingleClaudeSessionStream(filePath: string, encodedProject: string): Promise<ClaudeSessionIndexItem> {
  const stat = statSync(filePath);
  const fallbackTime = stat.mtimeMs;
  let sessionId = sessionIdFromPath(filePath);
  let firstPrompt = "";
  let customTitle = "";
  let lastText = "";
  let lastMessageAt = fallbackTime;
  let createdAt = fallbackTime;
  let messageCount = 0;
  let corrupt = false;
  let model: string | undefined;
  let projectPath: string | undefined;
  let branch: string | undefined;
  let lineIndex = 0;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const rawLine of reader) {
      const line = rawLine.replace(/^﻿/, "").trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        const record = parsed as Record<string, unknown>;
        if (typeof record.sessionId === "string") sessionId = record.sessionId;
        if (typeof record.session_id === "string") sessionId = record.session_id;
        if (typeof record.cwd === "string") projectPath = record.cwd;
        if (typeof record.gitBranch === "string") branch = record.gitBranch;
        if (typeof record.customTitle === "string" && record.customTitle.trim()) customTitle = record.customTitle.trim();

        const message = record.message && typeof record.message === "object" && !Array.isArray(record.message)
          ? record.message as Record<string, unknown>
          : null;
        if (message && typeof message.model === "string") model = message.model;
        if (typeof record.model === "string") model = record.model;

        const role = roleFromRecord(record);
        if (role !== "user" && role !== "assistant") continue;
        const body = textFromRecord(record);
        if (!body) continue;
        messageCount++;
        if (!firstPrompt && role === "user") firstPrompt = body;
        lastText = body;
        const ts = timestampFromRecord(record, fallbackTime);
        if (messageCount === 1) createdAt = ts;
        lastMessageAt = Math.max(lastMessageAt, ts);
      } catch {
        corrupt = true;
      } finally {
        lineIndex++;
      }
    }
  } catch {
    corrupt = true;
  } finally {
    reader.close();
    stream.destroy();
  }

  const projectName = projectPath ? projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath : decodeClaudeProjectName(encodedProject);
  const title = customTitle || firstPrompt || lastText || sessionId;
  return {
    sessionId,
    title: title.slice(0, 180),
    firstPrompt: firstPrompt ? firstPrompt.slice(0, 240) : undefined,
    projectName,
    projectPath,
    encodedProject,
    filePath,
    messageCount,
    lastMessageAt,
    createdAt,
    status: corrupt && lineIndex > 1 ? "corrupt" : messageCount > 0 ? "valid" : "empty",
    model,
    branch
  };
}

async function scanClaudeSessionsFresh() {
  const paths = getClaudePaths();
  const projectDirs = await collectClaudeProjectDirs(paths.projectsDir);
  const sessions: ClaudeSessionIndexItem[] = [];

  for (let index = 0; index < projectDirs.length; index += CLAUDE_SESSION_SCAN_CONCURRENCY) {
    const batch = projectDirs.slice(index, index + CLAUDE_SESSION_SCAN_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(project => scanClaudeProjectDirectory(project.projectDir, project.encodedProject)));
    for (const result of batchResults) sessions.push(...result);
  }

  return {
    sessions: sessions.sort((a, b) => b.lastMessageAt - a.lastMessageAt).slice(0, 500),
    scannedAt: Date.now(),
    projectsDir: paths.projectsDir
  };
}

async function getClaudeSessionSnapshot(force = false) {
  const now = Date.now();
  if (!force && claudeSessionCache && now - claudeSessionCache.timestamp < CLAUDE_SESSION_CACHE_TTL) {
    return claudeSessionCache.data;
  }

  if (!force && claudeSessionCache && now - claudeSessionCache.timestamp < CLAUDE_SESSION_STALE_TTL) {
    if (!pendingClaudeSessionScan) {
      pendingClaudeSessionScan = scanClaudeSessionsFresh()
        .then(data => {
          claudeSessionCache = { data, timestamp: Date.now() };
          return data;
        })
        .finally(() => { pendingClaudeSessionScan = null; });
    }
    return claudeSessionCache.data;
  }

  if (pendingClaudeSessionScan) return pendingClaudeSessionScan;
  pendingClaudeSessionScan = scanClaudeSessionsFresh()
    .then(data => {
      claudeSessionCache = { data, timestamp: Date.now() };
      return data;
    })
    .finally(() => { pendingClaudeSessionScan = null; });
  return pendingClaudeSessionScan;
}

type TokenBreakdown = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
};

type ClaudeTokenRequest = TokenBreakdown & {
  id: string;
  sessionId: string;
  filePath: string;
  projectPath?: string;
  projectName: string;
  model: string;
  timestamp: number;
  durationMs?: number;
  costUsd: number;
  priced: boolean;
};

type ClaudeTokenStats = {
  sessions: Array<TokenBreakdown & { sessionId: string; project: string; cwd: string; startTime: number; endTime: number; model: string; entrypoint: string; costUsd: number; requestCount: number; messageCount: number }>;
  daily: Array<TokenBreakdown & { date: string; model: string; costUsd: number; sessionCount: number; requestCount: number; messageCount: number }>;
  modelTotals: Array<TokenBreakdown & { model: string; costUsd: number; requestCount: number; sessionCount: number; messageCount: number; cacheHitRatio: number; priced: boolean }>;
  dailyTotals: Array<TokenBreakdown & { date: string; costUsd: number; sessionCount: number; requestCount: number; messageCount: number }>;
  projectTotals: Array<TokenBreakdown & { projectPath: string; projectName: string; costUsd: number; requestCount: number; sessionCount: number; lastActivity: number; models: string[]; cacheHitRatio: number }>;
  recentRequests: ClaudeTokenRequest[];
  totalTokens: number;
  totalCostUsd: number;
  totalSessions: number;
  totalRequests: number;
  cacheHitRatio: number;
  lastScannedAt: number;
  scanning: boolean;
};

const CLAUDE_TOKEN_CACHE_TTL = 60 * 1000;
const CLAUDE_TOKEN_STALE_TTL = 7 * 24 * 60 * 60 * 1000;
const CLAUDE_TOKEN_SCAN_CONCURRENCY = 10;
let claudeTokenStatsCache: { data: ClaudeTokenStats; timestamp: number } | null = null;
let pendingClaudeTokenStatsScan: Promise<ClaudeTokenStats> | null = null;

function emptyClaudeTokenStats(scannedAt = Date.now()): ClaudeTokenStats {
  return {
    sessions: [],
    daily: [],
    modelTotals: [],
    dailyTotals: [],
    projectTotals: [],
    recentRequests: [],
    totalTokens: 0,
    totalCostUsd: 0,
    totalSessions: 0,
    totalRequests: 0,
    cacheHitRatio: 0,
    lastScannedAt: scannedAt,
    scanning: false
  };
}

type ModelPricingRates = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

type PricingCacheFile = { timestamp: number; rates: Record<string, ModelPricingRates> };

let dynamicPricingRates: Map<string, ModelPricingRates> | null = null;
let pendingDynamicPricingLoad: Promise<Map<string, ModelPricingRates>> | null = null;

function normalizePricingModel(model: string) {
  return model.toLowerCase().replace(/^(anthropic|openai|github-copilot|openrouter)\//, "").trim();
}

function pricingCachePath() {
  return join(app.getPath("userData"), "pricing-litellm-cache.json");
}

function ratesFromLiteLlmEntry(entry: Record<string, unknown>): ModelPricingRates | null {
  const input = typeof entry.input_cost_per_token === "number" ? entry.input_cost_per_token * 1_000_000 : undefined;
  const output = typeof entry.output_cost_per_token === "number" ? entry.output_cost_per_token * 1_000_000 : undefined;
  if (!input || !output) return null;
  const cacheRead = typeof entry.cache_read_input_token_cost === "number" ? entry.cache_read_input_token_cost * 1_000_000 : undefined;
  const cacheWrite = typeof entry.cache_creation_input_token_cost === "number" ? entry.cache_creation_input_token_cost * 1_000_000 : undefined;
  return { input, output, cacheRead, cacheWrite };
}

function parseLiteLlmPricing(data: unknown) {
  const rates = new Map<string, ModelPricingRates>();
  if (!data || typeof data !== "object" || Array.isArray(data)) return rates;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const parsed = ratesFromLiteLlmEntry(value as Record<string, unknown>);
    if (parsed) rates.set(normalizePricingModel(key), parsed);
  }
  return rates;
}

function loadCachedDynamicPricing() {
  try {
    const parsed = JSON.parse(readFileSync(pricingCachePath(), "utf8")) as PricingCacheFile;
    if (parsed?.timestamp && parsed.rates && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
      return new Map(Object.entries(parsed.rates));
    }
  } catch { /* ignore cache misses */ }
  return null;
}

async function loadDynamicPricingRates() {
  if (dynamicPricingRates) return dynamicPricingRates;
  if (pendingDynamicPricingLoad) return pendingDynamicPricingLoad;
  pendingDynamicPricingLoad = (async () => {
    const cached = loadCachedDynamicPricing();
    if (cached) {
      dynamicPricingRates = cached;
      return cached;
    }
    try {
      const response = await fetch("https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json");
      if (!response.ok) throw new Error(`pricing_fetch_${response.status}`);
      const data = await response.json();
      const rates = parseLiteLlmPricing(data);
      if (rates.size > 0) {
        dynamicPricingRates = rates;
        try { writeFileSync(pricingCachePath(), JSON.stringify({ timestamp: Date.now(), rates: Object.fromEntries(rates) } satisfies PricingCacheFile), "utf8"); } catch { /* best effort */ }
        return rates;
      }
    } catch { /* fall back to embedded table */ }
    dynamicPricingRates = new Map();
    return dynamicPricingRates;
  })().finally(() => { pendingDynamicPricingLoad = null; });
  return pendingDynamicPricingLoad;
}

function findDynamicPricingRate(model: string) {
  const rates = dynamicPricingRates;
  if (!rates || rates.size === 0) return null;
  const normalized = normalizePricingModel(model).replace(/_/g, "-");
  if (rates.has(normalized)) return rates.get(normalized)!;
  const candidates = Array.from(rates.entries())
    .filter(([key]) => normalized === key || normalized.includes(key) || key.includes(normalized))
    .sort((a, b) => b[0].length - a[0].length);
  return candidates[0]?.[1] ?? null;
}

function modelPricingRates(model: string): ModelPricingRates | null {
  const dynamic = findDynamicPricingRate(model);
  if (dynamic) return dynamic;
  const normalized = normalizePricingModel(model).replace(/_/g, "-");

  if (normalized.includes("claude")) {
    if (normalized.includes("fable") || normalized.includes("mythos")) return { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 };
    if (normalized.includes("opus-4-8") || normalized.includes("opus-4.8") || normalized.includes("opus-4-7") || normalized.includes("opus-4.7") || normalized.includes("opus-4-6") || normalized.includes("opus-4.6") || normalized.includes("opus-4-5") || normalized.includes("opus-4.5")) return { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };
    if (normalized.includes("opus")) return { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 };
    if (normalized.includes("sonnet")) return { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };
    if (normalized.includes("haiku-4-5") || normalized.includes("haiku-4.5")) return { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
    if (normalized.includes("haiku")) return { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 };
  }

  if (normalized.includes("gpt-5.5") || normalized.includes("gpt-5-5")) return { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 5 };
  if (normalized.includes("gpt-5.4-mini") || normalized.includes("gpt-5-4-mini")) return { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0.75 };
  if (normalized.includes("gpt-5.4") || normalized.includes("gpt-5-4")) return { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 2.5 };
  if (normalized.includes("gpt-5-codex")) return { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 };
  if (normalized === "gpt-5" || normalized.startsWith("gpt-5-")) return { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 };
  if (normalized.includes("gpt-4.1-mini") || normalized.includes("gpt-4-1-mini")) return { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0.4 };
  if (normalized.includes("gpt-4.1-nano") || normalized.includes("gpt-4-1-nano")) return { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0.1 };
  if (normalized.includes("gpt-4.1") || normalized.includes("gpt-4-1")) return { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 };
  if (normalized.includes("gpt-4o-mini")) return { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0.15 };
  if (normalized.includes("gpt-4o")) return { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 };

  return null;
}

function computeClaudeCost(model: string, usage: TokenBreakdown) {
  const rates = modelPricingRates(model);
  if (!rates) return { costUsd: 0, priced: false };
  const cacheWrite = rates.cacheWrite ?? rates.input * 1.25;
  const cacheRead = rates.cacheRead ?? rates.input * 0.1;
  const costUsd = (
    usage.inputTokens * rates.input +
    usage.cacheCreationTokens * cacheWrite +
    usage.cacheReadTokens * cacheRead +
    usage.outputTokens * rates.output
  ) / 1_000_000;
  return { costUsd, priced: true };
}

function addTokenBreakdown<T extends TokenBreakdown>(target: T, usage: TokenBreakdown) {
  target.inputTokens += usage.inputTokens;
  target.outputTokens += usage.outputTokens;
  target.cacheReadTokens += usage.cacheReadTokens;
  target.cacheCreationTokens += usage.cacheCreationTokens;
  target.totalTokens += usage.totalTokens;
}

function cacheHitRatio(usage: TokenBreakdown) {
  const denominator = usage.inputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
  return denominator > 0 ? usage.cacheReadTokens / denominator : 0;
}

function createBreakdown(): TokenBreakdown {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0 };
}

function usageFromRecord(record: Record<string, unknown>): TokenBreakdown | null {
  const message = record.message && typeof record.message === "object" && !Array.isArray(record.message)
    ? record.message as Record<string, unknown>
    : null;
  const usage = message?.usage && typeof message.usage === "object" && !Array.isArray(message.usage)
    ? message.usage as Record<string, unknown>
    : null;
  if (!usage) return null;
  const inputTokens = positiveNumber(usage.input_tokens);
  const outputTokens = positiveNumber(usage.output_tokens);
  const cacheReadTokens = positiveNumber(usage.cache_read_input_tokens);
  const cacheCreationTokens = positiveNumber(usage.cache_creation_input_tokens);
  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  return totalTokens > 0 ? { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, totalTokens } : null;
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function claudeProjectName(projectPath: string | undefined, encodedProject: string) {
  return projectPath ? projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath : decodeClaudeProjectName(encodedProject);
}

function collectClaudeJsonlFilesRecursive(projectsDir: string) {
  const files: Array<{ filePath: string; encodedProject: string }> = [];
  const visit = (dir: string, encodedProject: string, depth: number) => {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath, encodedProject, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push({ filePath: fullPath, encodedProject });
    }
  };
  try {
    if (!existsSync(projectsDir)) return files;
    for (const projectEntry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (projectEntry.isDirectory()) visit(join(projectsDir, projectEntry.name), projectEntry.name, 0);
    }
  } catch {
    return files;
  }
  return files;
}

async function scanClaudeTokenFile(filePath: string, encodedProject: string): Promise<ClaudeTokenRequest[]> {
  const stat = statSync(filePath);
  const fallbackTime = stat.mtimeMs;
  let sessionId = sessionIdFromPath(filePath);
  let projectPath: string | undefined;
  let pendingUserTimestamp: number | undefined;
  const byDedup = new Map<string, ClaudeTokenRequest>();
  const requests: ClaudeTokenRequest[] = [];
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const rawLine of reader) {
      const line = rawLine.replace(/^﻿/, "").trim();
      if (!line) continue;
      if (line.includes('"type":"user"') || line.includes('"type": "user"')) {
        try {
          const userRecord = JSON.parse(line) as Record<string, unknown>;
          pendingUserTimestamp = timestampFromRecord(userRecord, fallbackTime);
          if (typeof userRecord.sessionId === "string") sessionId = userRecord.sessionId;
          if (typeof userRecord.cwd === "string") projectPath = userRecord.cwd;
        } catch { /* ignore bad user rows */ }
        continue;
      }
      if (!line.includes("assistant") || !line.includes("usage")) continue;
      let record: Record<string, unknown>;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        record = parsed as Record<string, unknown>;
      } catch {
        continue;
      }
      if (record.type !== "assistant") continue;
      if (typeof record.sessionId === "string") sessionId = record.sessionId;
      if (typeof record.session_id === "string") sessionId = record.session_id;
      if (typeof record.cwd === "string") projectPath = record.cwd;
      const message = record.message && typeof record.message === "object" && !Array.isArray(record.message)
        ? record.message as Record<string, unknown>
        : null;
      const model = typeof message?.model === "string" ? message.model : "unknown";
      if (!model || model === "unknown") continue;
      const usage = usageFromRecord(record);
      if (!usage) continue;
      const timestamp = timestampFromRecord(record, fallbackTime);
      const requestId = typeof record.requestId === "string" ? record.requestId : "";
      const messageId = typeof message?.id === "string" ? message.id : "";
      const dedupKey = messageId && requestId ? `${messageId}:${requestId}` : messageId ? `message:${messageId}` : `${filePath}:${timestamp}:${requests.length}`;
      const existing = byDedup.get(dedupKey);
      if (existing) {
        existing.inputTokens = Math.max(existing.inputTokens, usage.inputTokens);
        existing.outputTokens = Math.max(existing.outputTokens, usage.outputTokens);
        existing.cacheReadTokens = Math.max(existing.cacheReadTokens, usage.cacheReadTokens);
        existing.cacheCreationTokens = Math.max(existing.cacheCreationTokens, usage.cacheCreationTokens);
        existing.totalTokens = existing.inputTokens + existing.outputTokens + existing.cacheReadTokens + existing.cacheCreationTokens;
        const cost = computeClaudeCost(existing.model, existing);
        existing.costUsd = cost.costUsd;
        existing.priced = cost.priced;
        existing.timestamp = Math.max(existing.timestamp, timestamp);
        continue;
      }
      const cost = computeClaudeCost(model, usage);
      const request: ClaudeTokenRequest = {
        ...usage,
        ...cost,
        id: dedupKey,
        sessionId,
        filePath,
        projectPath,
        projectName: claudeProjectName(projectPath, encodedProject),
        model,
        timestamp,
        durationMs: pendingUserTimestamp && timestamp > pendingUserTimestamp ? timestamp - pendingUserTimestamp : undefined
      };
      byDedup.set(dedupKey, request);
      requests.push(request);
      pendingUserTimestamp = undefined;
    }
  } finally {
    reader.close();
    stream.destroy();
  }
  return requests;
}

async function scanClaudeTokenStatsFresh(): Promise<ClaudeTokenStats> {
  await loadDynamicPricingRates();
  const paths = getClaudePaths();
  const files = collectClaudeJsonlFilesRecursive(paths.projectsDir);
  const requests: ClaudeTokenRequest[] = [];
  for (let index = 0; index < files.length; index += CLAUDE_TOKEN_SCAN_CONCURRENCY) {
    const batch = files.slice(index, index + CLAUDE_TOKEN_SCAN_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(file => scanClaudeTokenFile(file.filePath, file.encodedProject).catch(() => [])));
    for (const result of batchResults) requests.push(...result);
  }
  return aggregateClaudeTokenStats(requests, Date.now());
}

function aggregateClaudeTokenStats(requests: ClaudeTokenRequest[], scannedAt: number): ClaudeTokenStats {
  const dailyMap = new Map<string, TokenBreakdown & { date: string; model: string; costUsd: number; sessionIds: Set<string>; requestCount: number; messageCount: number }>();
  const dailyTotalsMap = new Map<string, TokenBreakdown & { date: string; costUsd: number; sessionIds: Set<string>; requestCount: number; messageCount: number }>();
  const modelMap = new Map<string, TokenBreakdown & { model: string; costUsd: number; requestCount: number; sessionIds: Set<string>; messageCount: number; priced: boolean }>();
  const projectMap = new Map<string, TokenBreakdown & { projectPath: string; projectName: string; costUsd: number; requestCount: number; sessionIds: Set<string>; lastActivity: number; models: Set<string> }>();
  const sessionMap = new Map<string, TokenBreakdown & { sessionId: string; project: string; cwd: string; startTime: number; endTime: number; model: string; entrypoint: string; costUsd: number; requestCount: number; messageCount: number }>();
  const total = createBreakdown();
  let totalCostUsd = 0;

  for (const request of requests) {
    addTokenBreakdown(total, request);
    totalCostUsd += request.costUsd;
    const date = localDateKey(request.timestamp);
    const dailyKey = `${date}|${request.model}`;
    const daily = dailyMap.get(dailyKey) ?? { ...createBreakdown(), date, model: request.model, costUsd: 0, sessionIds: new Set<string>(), requestCount: 0, messageCount: 0 };
    addTokenBreakdown(daily, request);
    daily.costUsd += request.costUsd;
    daily.sessionIds.add(request.sessionId);
    daily.requestCount++;
    daily.messageCount++;
    dailyMap.set(dailyKey, daily);

    const dailyTotal = dailyTotalsMap.get(date) ?? { ...createBreakdown(), date, costUsd: 0, sessionIds: new Set<string>(), requestCount: 0, messageCount: 0 };
    addTokenBreakdown(dailyTotal, request);
    dailyTotal.costUsd += request.costUsd;
    dailyTotal.sessionIds.add(request.sessionId);
    dailyTotal.requestCount++;
    dailyTotal.messageCount++;
    dailyTotalsMap.set(date, dailyTotal);

    const model = modelMap.get(request.model) ?? { ...createBreakdown(), model: request.model, costUsd: 0, requestCount: 0, sessionIds: new Set<string>(), messageCount: 0, priced: request.priced };
    addTokenBreakdown(model, request);
    model.costUsd += request.costUsd;
    model.requestCount++;
    model.sessionIds.add(request.sessionId);
    model.messageCount++;
    model.priced = model.priced || request.priced;
    modelMap.set(request.model, model);

    const projectKey = request.projectPath || request.projectName;
    const project = projectMap.get(projectKey) ?? { ...createBreakdown(), projectPath: request.projectPath || request.projectName, projectName: request.projectName, costUsd: 0, requestCount: 0, sessionIds: new Set<string>(), lastActivity: 0, models: new Set<string>() };
    addTokenBreakdown(project, request);
    project.costUsd += request.costUsd;
    project.requestCount++;
    project.sessionIds.add(request.sessionId);
    project.lastActivity = Math.max(project.lastActivity, request.timestamp);
    project.models.add(request.model);
    projectMap.set(projectKey, project);

    const session = sessionMap.get(request.sessionId) ?? { ...createBreakdown(), sessionId: request.sessionId, project: request.projectPath || request.projectName, cwd: request.projectPath || "", startTime: request.timestamp, endTime: request.timestamp, model: request.model, entrypoint: "claude", costUsd: 0, requestCount: 0, messageCount: 0 };
    addTokenBreakdown(session, request);
    session.costUsd += request.costUsd;
    session.requestCount++;
    session.messageCount++;
    session.startTime = Math.min(session.startTime, request.timestamp);
    session.endTime = Math.max(session.endTime, request.timestamp);
    session.model = request.model;
    sessionMap.set(request.sessionId, session);
  }

  const daily = Array.from(dailyMap.values()).map(entry => ({ ...entry, sessionCount: entry.sessionIds.size, sessionIds: undefined as never })).map(({ sessionIds, ...entry }) => entry).sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model));
  const dailyTotals = Array.from(dailyTotalsMap.values()).map(entry => ({ ...entry, sessionCount: entry.sessionIds.size, sessionIds: undefined as never })).map(({ sessionIds, ...entry }) => entry).sort((a, b) => a.date.localeCompare(b.date));
  const modelTotals = Array.from(modelMap.values()).map(entry => ({
    model: entry.model,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheReadTokens: entry.cacheReadTokens,
    cacheCreationTokens: entry.cacheCreationTokens,
    totalTokens: entry.totalTokens,
    costUsd: entry.costUsd,
    requestCount: entry.requestCount,
    sessionCount: entry.sessionIds.size,
    messageCount: entry.messageCount,
    cacheHitRatio: cacheHitRatio(entry),
    priced: entry.priced
  })).sort((a, b) => b.totalTokens - a.totalTokens);
  const projectTotals = Array.from(projectMap.values()).map(entry => ({
    projectPath: entry.projectPath,
    projectName: entry.projectName,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheReadTokens: entry.cacheReadTokens,
    cacheCreationTokens: entry.cacheCreationTokens,
    totalTokens: entry.totalTokens,
    costUsd: entry.costUsd,
    requestCount: entry.requestCount,
    sessionCount: entry.sessionIds.size,
    lastActivity: entry.lastActivity,
    models: Array.from(entry.models).sort(),
    cacheHitRatio: cacheHitRatio(entry)
  })).sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 20);

  return {
    sessions: Array.from(sessionMap.values()).sort((a, b) => b.endTime - a.endTime).slice(0, 50),
    daily,
    modelTotals,
    dailyTotals,
    projectTotals,
    recentRequests: requests.sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 30),
    totalTokens: total.totalTokens,
    totalCostUsd,
    totalSessions: sessionMap.size,
    totalRequests: requests.length,
    cacheHitRatio: cacheHitRatio(total),
    lastScannedAt: scannedAt,
    scanning: false
  };
}

async function getClaudeTokenStats(force = false) {
  const now = Date.now();
  if (!force && claudeTokenStatsCache && now - claudeTokenStatsCache.timestamp < CLAUDE_TOKEN_CACHE_TTL) {
    return claudeTokenStatsCache.data;
  }
  if (!force && claudeTokenStatsCache && now - claudeTokenStatsCache.timestamp < CLAUDE_TOKEN_STALE_TTL) {
    if (!pendingClaudeTokenStatsScan) {
      pendingClaudeTokenStatsScan = scanClaudeTokenStatsFresh()
        .then(data => {
          claudeTokenStatsCache = { data, timestamp: Date.now() };
          return data;
        })
        .finally(() => { pendingClaudeTokenStatsScan = null; });
    }
    return claudeTokenStatsCache.data;
  }
  if (pendingClaudeTokenStatsScan) return pendingClaudeTokenStatsScan;
  pendingClaudeTokenStatsScan = scanClaudeTokenStatsFresh()
    .then(data => {
      claudeTokenStatsCache = { data, timestamp: Date.now() };
      return data;
    })
    .catch(() => emptyClaudeTokenStats())
    .finally(() => { pendingClaudeTokenStatsScan = null; });
  return pendingClaudeTokenStatsScan;
}

function collectClaudeJsonlFiles(projectsDir: string) {
  const files: Array<{ filePath: string; encodedProject: string }> = [];
  try {
    if (!existsSync(projectsDir)) return files;
    for (const projectEntry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!projectEntry.isDirectory()) continue;
      const projectDir = join(projectsDir, projectEntry.name);
      for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          files.push({ filePath: join(projectDir, entry.name), encodedProject: projectEntry.name });
        }
      }
    }
  } catch {
    return files;
  }
  return files;
}

function textFromClaudeContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map(block => {
      if (!block || typeof block !== "object") return "";
      const value = block as Record<string, unknown>;
      if (typeof value.text === "string") return value.text;
      if (typeof value.content === "string") return value.content;
      if (typeof value.name === "string") return value.name;
      if (typeof value.type === "string" && value.type !== "text") return `[${value.type}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function timestampFromRecord(record: Record<string, unknown>, fallback: number) {
  const raw = record.timestamp ?? record.created_at ?? record.updated_at;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 10_000_000_000 ? raw : raw * 1000;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function roleFromRecord(record: Record<string, unknown>): ClaudeSessionMessage["role"] {
  const message = record.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const role = (message as Record<string, unknown>).role;
    if (role === "user" || role === "assistant" || role === "system") return role;
  }
  const type = record.type;
  if (type === "system") return "system";
  if (type === "tool_result") return "tool";
  return "unknown";
}

function textFromRecord(record: Record<string, unknown>) {
  const message = record.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const value = message as Record<string, unknown>;
    const text = textFromClaudeContent(value.content);
    if (text) return text;
  }
  return textFromClaudeContent(record.content) || (typeof record.summary === "string" ? record.summary : "");
}

function sessionIdFromPath(filePath: string) {
  const name = filePath.split(/[\\/]/).pop() ?? "";
  return name.replace(/\.jsonl$/i, "") || name;
}

function scanSingleClaudeSession(filePath: string, encodedProject: string): ClaudeSessionIndexItem {
  const stat = statSync(filePath);
  const fallbackTime = stat.mtimeMs;
  let sessionId = sessionIdFromPath(filePath);
  let firstPrompt = "";
  let customTitle = "";
  let lastText = "";
  let lastMessageAt = fallbackTime;
  let createdAt = fallbackTime;
  let messageCount = 0;
  let corrupt = false;
  let model: string | undefined;
  let projectPath: string | undefined;
  let branch: string | undefined;

  const text = readTextIfExists(filePath);
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (let index = 0; index < lines.length; index++) {
    try {
      const parsed = JSON.parse(lines[index]) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const record = parsed as Record<string, unknown>;
      if (typeof record.sessionId === "string") sessionId = record.sessionId;
      if (typeof record.session_id === "string") sessionId = record.session_id;
      if (typeof record.cwd === "string") projectPath = record.cwd;
      if (typeof record.gitBranch === "string") branch = record.gitBranch;
      if (typeof record.customTitle === "string" && record.customTitle.trim()) customTitle = record.customTitle.trim();

      const message = record.message && typeof record.message === "object" && !Array.isArray(record.message)
        ? record.message as Record<string, unknown>
        : null;
      if (message && typeof message.model === "string") model = message.model;
      if (typeof record.model === "string") model = record.model;

      const body = textFromRecord(record);
      const role = roleFromRecord(record);
      if (body && (role === "user" || role === "assistant" || role === "system" || role === "tool")) {
        messageCount++;
        if (!firstPrompt && role === "user") firstPrompt = body;
        lastText = body;
        const ts = timestampFromRecord(record, fallbackTime);
        if (messageCount === 1) createdAt = ts;
        lastMessageAt = Math.max(lastMessageAt, ts);
      }
    } catch {
      if (index < lines.length - 1) corrupt = true;
    }
  }

  const projectName = projectPath ? projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath : decodeClaudeProjectName(encodedProject);
  const title = customTitle || firstPrompt || lastText || sessionId;
  return {
    sessionId,
    title: title.slice(0, 180),
    firstPrompt: firstPrompt ? firstPrompt.slice(0, 240) : undefined,
    projectName,
    projectPath,
    encodedProject,
    filePath,
    messageCount,
    lastMessageAt,
    createdAt,
    status: corrupt ? "corrupt" : messageCount > 0 ? "valid" : "empty",
    model,
    branch
  };
}

function isAllowedClaudeSessionFile(filePath: string) {
  try {
    const paths = getClaudePaths();
    const resolvedTarget = resolve(filePath);
    const resolvedProjects = resolve(paths.projectsDir);
    return resolvedTarget.endsWith(".jsonl") && (resolvedTarget === resolvedProjects || resolvedTarget.startsWith(`${resolvedProjects}\\`) || resolvedTarget.startsWith(`${resolvedProjects}/`));
  } catch {
    return false;
  }
}

function getClaudeSessionDetail(filePath: string) {
  if (typeof filePath !== "string" || !isAllowedClaudeSessionFile(filePath)) throw new Error("Invalid Claude session path");
  const paths = getClaudePaths();
  const resolved = resolve(filePath);
  const resolvedProjects = resolve(paths.projectsDir);
  const relative = resolved.slice(resolvedProjects.length + 1);
  const encodedProject = relative.split(/[\\/]/)[0] ?? "";
  const session = scanSingleClaudeSession(filePath, encodedProject);
  const lines = readTextIfExists(filePath).split(/\r?\n/).filter(Boolean);
  const messages: ClaudeSessionMessage[] = [];

  for (let index = 0; index < lines.length; index++) {
    try {
      const parsed = JSON.parse(lines[index]) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const record = parsed as Record<string, unknown>;
      const text = textFromRecord(record);
      if (!text) continue;
      const role = roleFromRecord(record);
      const message = record.message && typeof record.message === "object" && !Array.isArray(record.message)
        ? record.message as Record<string, unknown>
        : null;
      messages.push({
        id: `${session.sessionId}:${index}`,
        role,
        text: text.slice(0, 4000),
        timestamp: timestampFromRecord(record, session.lastMessageAt),
        model: typeof message?.model === "string" ? message.model : typeof record.model === "string" ? record.model : undefined,
        toolName: typeof record.toolName === "string" ? record.toolName : undefined
      });
    } catch {
      // Ignore broken JSONL rows in read-only viewer mode.
    }
  }

  return { session, messages: messages.slice(-240), totalMessages: messages.length };
}

function getSessionResumeCwd(projectPath?: string) {
  const requested = typeof projectPath === "string" ? projectPath.trim() : "";
  return requested && isDirectoryPath(requested) ? requested : homedir();
}

function resumeClaudeSession(sessionId: string, projectPath?: string) {
  const safeSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!/^[a-zA-Z0-9._:-]{6,200}$/.test(safeSessionId)) return { ok: false, command: "", error: "Invalid session id" };
  const command = `claude --resume ${safeSessionId}`;
  const cwd = getSessionResumeCwd(projectPath);

  if (process.platform === "win32") {
    try {
      const comspec = process.env.ComSpec || "cmd.exe";
      const child = spawn(comspec, ["/K", command], {
        cwd,
        detached: true,
        windowsHide: false,
        stdio: "ignore"
      });
      child.unref();
      return { ok: true, command, cwd };
    } catch (error) {
      return { ok: false, command, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { ok: false, command, error: "Terminal launch is only implemented on Windows in this build" };
}

function getCompanionEvents() {
  return eventHistory.map(toCompanionEvent);
}

function getClaudeSettingsPath() {
  const claudeDir = join(homedir(), ".claude");
  const settings = join(claudeDir, "settings.json");
  const legacy = join(claudeDir, "claude.json");
  if (existsSync(settings)) return settings;
  if (existsSync(legacy)) return legacy;
  return settings;
}

function readLiveJsonObject(path: string) {
  if (!existsSync(path)) return {} as Record<string, any>;
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return {} as Record<string, any>;
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, any> : {} as Record<string, any>;
}

function backupFile(path: string) {
  if (!existsSync(path)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.replace(/\.json$/i, `.clawd-backup-${stamp}.json`);
  copyFileSync(path, backupPath);
  return backupPath;
}

function sanitizeClaudeSettingsConfig(config: Record<string, any>) {
  const next = { ...config };
  delete next.api_format;
  delete next.apiFormat;
  delete next.openrouter_compat_mode;
  delete next.openrouterCompatMode;
  return next;
}

function applyClaudeProviderToLiveSettings(routeId: string) {
  const providers = companionSettings.claudeProviders && typeof companionSettings.claudeProviders === "object" ? companionSettings.claudeProviders as Record<string, Record<string, any>> : null;
  const provider = providers?.[routeId];
  if (!provider) return { ok: false, error: `Provider ${routeId} not found` };
  const settingsConfig = provider.settingsConfig && typeof provider.settingsConfig === "object" ? sanitizeClaudeSettingsConfig(provider.settingsConfig as Record<string, any>) : {};
  const path = getClaudeSettingsPath();
  mkdirSync(join(homedir(), ".claude"), { recursive: true });
  const existing = readLiveJsonObject(path);
  const backupPath = backupFile(path);
  const next = { ...existing, ...settingsConfig };
  if (existing.env || settingsConfig.env) {
    next.env = { ...(existing.env && typeof existing.env === "object" ? existing.env : {}), ...(settingsConfig.env && typeof settingsConfig.env === "object" ? settingsConfig.env : {}) };
  }
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return { ok: true, path, backupPath };
}

function getActiveClaudeRoute() {
  const providers = companionSettings.claudeProviders && typeof companionSettings.claudeProviders === "object" ? companionSettings.claudeProviders as Record<string, Record<string, unknown>> : null;
  if (providers && Object.keys(providers).length > 0) {
    const activeId = typeof companionSettings.currentClaudeProviderId === "string" ? companionSettings.currentClaudeProviderId : undefined;
    const provider = (activeId ? providers[activeId] : undefined) ?? Object.values(providers).sort((a, b) => Number(a.sortIndex ?? 0) - Number(b.sortIndex ?? 0))[0];
    const settingsConfig = provider?.settingsConfig && typeof provider.settingsConfig === "object" ? provider.settingsConfig as Record<string, unknown> : {};
    const env = settingsConfig.env && typeof settingsConfig.env === "object" ? settingsConfig.env as Record<string, unknown> : {};
    return provider ? {
      id: provider.id,
      name: provider.name,
      baseUrl: env.ANTHROPIC_BASE_URL,
      apiKeyMasked: env.ANTHROPIC_AUTH_TOKEN,
      headersText: settingsConfig.headers,
      modelAliasesText: settingsConfig.modelAliases,
      proxyUrl: settingsConfig.proxyUrl,
      prefix: settingsConfig.prefix,
      excludedModelsText: settingsConfig.excludedModels,
      enabled: true
    } : null;
  }

  const routes = Array.isArray(companionSettings.claudeRoutes) ? companionSettings.claudeRoutes as Array<Record<string, unknown>> : [];
  const activeId = typeof companionSettings.activeClaudeRouteId === "string" ? companionSettings.activeClaudeRouteId : undefined;
  return routes.find(route => route.id === activeId) ?? routes[0] ?? null;
}

function getClaudeRouteRuntimePreview() {
  const route = getActiveClaudeRoute();
  if (!route) return { activeRoute: null, env: {}, commandPrefix: "", note: "No Claude route configured" };
  const env: Record<string, string> = {};
  const baseUrl = typeof route.baseUrl === "string" ? route.baseUrl.trim() : "";
  const apiKeyMasked = typeof route.apiKeyMasked === "string" ? route.apiKeyMasked : "";
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  if (apiKeyMasked) env.ANTHROPIC_AUTH_TOKEN = apiKeyMasked;
  const headersText = typeof route.headersText === "string" ? route.headersText.trim() : "";
  const modelAliasesText = typeof route.modelAliasesText === "string" ? route.modelAliasesText.trim() : "";
  const proxyUrl = typeof route.proxyUrl === "string" ? route.proxyUrl.trim() : "";
  const prefix = typeof route.prefix === "string" ? route.prefix.trim() : "";
  if (proxyUrl) env.CLAWD_ROUTE_PROXY_URL = proxyUrl;
  if (prefix) env.CLAWD_ROUTE_PREFIX = prefix;
  if (headersText) env.CLAWD_ROUTE_HEADERS = headersText;
  if (modelAliasesText) env.CLAWD_ROUTE_MODEL_ALIASES = modelAliasesText;
  return {
    activeRoute: {
      id: route.id,
      name: route.name,
      baseUrl,
      enabled: route.enabled !== false,
      apiKeyMasked,
      hasHeaders: Boolean(headersText),
      hasModelAliases: Boolean(modelAliasesText),
      hasProxy: Boolean(proxyUrl),
      hasPrefix: Boolean(prefix)
    },
    env,
    commandPrefix: Object.entries(env).map(([key, value]) => `$env:${key}=${JSON.stringify(value)}`).join("; "),
    note: "Preview only. The app does not mutate your current Claude Code process automatically."
  };
}

function applyClaudeRoute(routeId: string) {
  const liveApply = applyClaudeProviderToLiveSettings(routeId);
  if (!liveApply.ok) return { ...getClaudeRouteRuntimePreview(), liveApply };
  companionSettings = { ...companionSettings, activeClaudeRouteId: routeId, currentClaudeProviderId: routeId };
  saveCompanionSettings();
  panelWindow?.webContents.send("companion:settings", companionSettings);
  return { ...getClaudeRouteRuntimePreview(), liveApply };
}

function testClaudeRoute(routeId: string) {
  const previousRoute = companionSettings.activeClaudeRouteId;
  const previousProvider = companionSettings.currentClaudeProviderId;
  companionSettings = { ...companionSettings, activeClaudeRouteId: routeId, currentClaudeProviderId: routeId };
  const preview = getClaudeRouteRuntimePreview();
  companionSettings = { ...companionSettings, activeClaudeRouteId: previousRoute, currentClaudeProviderId: previousProvider };
  return { ok: Boolean(preview.activeRoute), preview, message: "Dry-run only: generated Claude Code route environment without sending a model request." };
}

function openClaudeRouteTerminal(routeId: string) {
  const previousRoute = companionSettings.activeClaudeRouteId;
  const previousProvider = companionSettings.currentClaudeProviderId;
  companionSettings = { ...companionSettings, activeClaudeRouteId: routeId, currentClaudeProviderId: routeId };
  const preview = getClaudeRouteRuntimePreview() as any;
  companionSettings = { ...companionSettings, activeClaudeRouteId: previousRoute, currentClaudeProviderId: previousProvider };
  const prefix = preview.commandPrefix ? `${preview.commandPrefix}; ` : "";
  const command = `${prefix}claude`;
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "Claude Route", "powershell.exe", "-NoExit", "-Command", command], { detached: true, windowsHide: true, stdio: "ignore" }).unref();
    return { ok: true, command };
  }
  return { ok: false, command, error: "Terminal launch is only implemented on Windows in this build" };
}

function getConnectionStatus() {
  const latest = eventHistory[0] ? toCompanionEvent(eventHistory[0]) : undefined;
  return {
    port: eventPort,
    serverListening: Boolean(eventServer?.listening),
    tokenSet: true,
    privacyMode: companionSettings.privacyMode,
    connected: Boolean(latest),
    activeSessionId: sessionId,
    activeClientType: "desktop",
    activeClientLabel: "Minato Aqua Code Pet",
    lastEventAt: latest?.timestamp,
    lastEventTitle: latest?.title,
    lastEventType: latest?.event,
    lastEventSource: latest?.source
  };
}

function settingsPath() {
  return join(app.getPath("userData"), "companion-settings.json");
}

function loadCompanionSettings() {
  try {
    if (existsSync(settingsPath())) {
      const parsed = JSON.parse(readFileSync(settingsPath(), "utf8")) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        companionSettings = { ...companionSettings, ...parsed };
      }
    }
  } catch { /* ignore corrupt settings */ }
}

function saveCompanionSettings() {
  try { writeFileSync(settingsPath(), JSON.stringify(companionSettings, null, 2), "utf8"); } catch { /* best effort */ }
}

function localDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function runtimeStatsPath() {
  return join(app.getPath("userData"), "runtime-stats.json");
}

function createRuntimeStats(): RuntimeStats {
  return {
    toolUsage: {},
    eventTypeCounts: {},
    totalSessions: 0,
    dailyStats: {},
    errorCount: 0,
    permissionRequests: 0,
    permissionApproved: 0,
    permissionDenied: 0,
    totalRuntime: 0,
    hourlyActivity: new Array(24).fill(0),
    firstStartTime: appStartedAt,
    lastEventTime: 0
  };
}

function normalizeRuntimeStats(value: unknown): RuntimeStats {
  const base = createRuntimeStats();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const raw = value as Partial<RuntimeStats>;
  return {
    toolUsage: raw.toolUsage && typeof raw.toolUsage === "object" && !Array.isArray(raw.toolUsage) ? raw.toolUsage as Record<string, number> : {},
    eventTypeCounts: raw.eventTypeCounts && typeof raw.eventTypeCounts === "object" && !Array.isArray(raw.eventTypeCounts) ? raw.eventTypeCounts as Record<string, number> : {},
    totalSessions: typeof raw.totalSessions === "number" ? raw.totalSessions : 0,
    dailyStats: raw.dailyStats && typeof raw.dailyStats === "object" && !Array.isArray(raw.dailyStats) ? raw.dailyStats as Record<string, { events: number; toolCalls: number; sessions: number }> : {},
    errorCount: typeof raw.errorCount === "number" ? raw.errorCount : 0,
    permissionRequests: typeof raw.permissionRequests === "number" ? raw.permissionRequests : 0,
    permissionApproved: typeof raw.permissionApproved === "number" ? raw.permissionApproved : 0,
    permissionDenied: typeof raw.permissionDenied === "number" ? raw.permissionDenied : 0,
    totalRuntime: typeof raw.totalRuntime === "number" ? raw.totalRuntime : 0,
    hourlyActivity: Array.isArray(raw.hourlyActivity) && raw.hourlyActivity.length === 24 ? raw.hourlyActivity.map((value: unknown) => typeof value === "number" ? value : 0) : new Array(24).fill(0),
    firstStartTime: typeof raw.firstStartTime === "number" && raw.firstStartTime > 0 ? raw.firstStartTime : appStartedAt,
    lastEventTime: typeof raw.lastEventTime === "number" ? raw.lastEventTime : 0
  };
}

function loadRuntimeStats() {
  if (runtimeStats) return runtimeStats;
  try {
    if (existsSync(runtimeStatsPath())) {
      runtimeStats = normalizeRuntimeStats(JSON.parse(readFileSync(runtimeStatsPath(), "utf8")));
      return runtimeStats;
    }
  } catch { /* ignore corrupt stats */ }
  runtimeStats = createRuntimeStats();
  runtimeStatsDirty = true;
  return runtimeStats;
}

function saveRuntimeStats(force = false) {
  if (!runtimeStats || (!force && !runtimeStatsDirty)) return;
  try {
    writeFileSync(runtimeStatsPath(), JSON.stringify(runtimeStats, null, 2), "utf8");
    runtimeStatsDirty = false;
  } catch { /* best effort */ }
}

function recordRuntimeEvent(event: CompanionEvent) {
  const stats = loadRuntimeStats();
  stats.eventTypeCounts[event.event] = (stats.eventTypeCounts[event.event] ?? 0) + 1;
  if (event.tool) stats.toolUsage[event.tool] = (stats.toolUsage[event.tool] ?? 0) + 1;
  if (event.event === "error") stats.errorCount++;
  if (event.event === "permission_wait") stats.permissionRequests++;
  if (event.event === "session_start") stats.totalSessions++;
  const date = new Date(event.timestamp);
  const day = localDateKey(event.timestamp);
  stats.hourlyActivity[date.getHours()]++;
  stats.dailyStats[day] ??= { events: 0, toolCalls: 0, sessions: 0 };
  stats.dailyStats[day].events++;
  if (event.tool) stats.dailyStats[day].toolCalls++;
  if (event.event === "session_start") stats.dailyStats[day].sessions++;
  if (!stats.firstStartTime || stats.firstStartTime > event.timestamp) stats.firstStartTime = event.timestamp;
  stats.lastEventTime = Math.max(stats.lastEventTime ?? 0, event.timestamp);
  runtimeStatsDirty = true;
  saveRuntimeStats();
}

function recordPermissionDecision(decision?: string) {
  if (decision !== "allow" && decision !== "deny") return;
  const stats = loadRuntimeStats();
  if (decision === "allow") stats.permissionApproved++;
  else stats.permissionDenied++;
  runtimeStatsDirty = true;
  saveRuntimeStats();
}

function getStats() {
  const stats = { ...loadRuntimeStats(), totalRuntime: (loadRuntimeStats().totalRuntime ?? 0) + (Date.now() - appStartedAt) };
  return stats;
}

function getSessionHistory() {
  const events = getCompanionEvents().map(event => ({ id: event.id, event, timestamp: event.timestamp })).reverse();
  return [{
    sessionId,
    title: "Minato Aqua Code Pet",
    clientLabel: "Minato Aqua Code Pet",
    startedAt: appStartedAt,
    lastEventAt: eventHistory[0]?.timestamp ?? appStartedAt,
    eventCount: events.length,
    status: currentState === "completed" ? "done" : "active",
    events
  }];
}

const requiredClaudeHookEvents = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop"];

function getHookForwarderPath() {
  const candidates = [
    join(app.getAppPath(), "scripts", "hook-forwarder.js"),
    join(process.cwd(), "scripts", "hook-forwarder.js"),
    join(__dirname, "../../scripts/hook-forwarder.js")
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0];
}

function getHookCommand(eventName: string) {
  return [
    "node",
    JSON.stringify(getHookForwarderPath()),
    eventName,
    "--settings",
    JSON.stringify(settingsPath()),
    "--app-path",
    JSON.stringify(process.execPath),
    "--app-root",
    JSON.stringify(app.getAppPath()),
    "--port",
    String(eventPort)
  ].join(" ");
}

function isClawdHookCommand(command: unknown, eventName?: string) {
  if (typeof command !== "string") return false;
  const normalized = command.replace(/\\/g, "/");
  const scriptNameMatches = normalized.includes("hook-forwarder.js");
  return scriptNameMatches && (!eventName || normalized.includes(eventName));
}

function getHookEntries(settings: Record<string, any>, eventName: string): Array<Record<string, any>> {
  const eventConfig = settings.hooks?.[eventName];
  if (!Array.isArray(eventConfig)) return [];
  return eventConfig.filter(entry => entry && typeof entry === "object") as Array<Record<string, any>>;
}

function getHooksStatus() {
  const path = getClaudeSettingsPath();
  const configExists = existsSync(path);
  let settings: Record<string, any> = {};
  try {
    settings = readLiveJsonObject(path);
  } catch {
    settings = {};
  }

  const missingEvents = requiredClaudeHookEvents.filter(eventName => {
    const entries = getHookEntries(settings, eventName);
    return !entries.some(entry => Array.isArray(entry.hooks) && entry.hooks.some((hook: any) => isClawdHookCommand(hook?.command, eventName)));
  });
  const hookCount = requiredClaudeHookEvents.length - missingEvents.length;
  const commandMatches = missingEvents.length === 0;

  return {
    installed: commandMatches,
    configExists,
    hookCount,
    requiredCount: requiredClaudeHookEvents.length,
    missingEvents,
    commandMatches
  };
}

function installHooks() {
  const path = getClaudeSettingsPath();
  mkdirSync(join(homedir(), ".claude"), { recursive: true });
  const settings = readLiveJsonObject(path);
  backupFile(path);
  const hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks) ? { ...settings.hooks } : {};

  for (const eventName of requiredClaudeHookEvents) {
    const entries = Array.isArray(hooks[eventName]) ? [...hooks[eventName]] : [];
    const existingIndex = entries.findIndex(entry => entry && typeof entry === "object" && Array.isArray(entry.hooks) && entry.hooks.some((hook: any) => isClawdHookCommand(hook?.command)));
    const clawdEntry = { matcher: "*", hooks: [{ type: "command", command: getHookCommand(eventName) }] };
    if (existingIndex >= 0) entries[existingIndex] = clawdEntry;
    else entries.push(clawdEntry);
    hooks[eventName] = entries;
  }

  writeFileSync(path, `${JSON.stringify({ ...settings, hooks }, null, 2)}\n`, "utf-8");
  return { success: true, status: getHooksStatus() };
}

function repairHooks() {
  const before = getHooksStatus();
  const result = installHooks();
  const after = getHooksStatus();
  return { success: true, fixed: before.missingEvents, status: after, install: result };
}

function removeHooks() {
  const path = getClaudeSettingsPath();
  if (!existsSync(path)) return { success: true, removed: 0, status: getHooksStatus() };
  const settings = readLiveJsonObject(path);
  backupFile(path);
  let removed = 0;
  const hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks) ? { ...settings.hooks } : {};

  for (const eventName of Object.keys(hooks)) {
    if (!Array.isArray(hooks[eventName])) continue;
    hooks[eventName] = hooks[eventName].map((entry: any) => {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks)) return entry;
      const nextHooks = entry.hooks.filter((hook: any) => {
        const shouldRemove = isClawdHookCommand(hook?.command);
        if (shouldRemove) removed += 1;
        return !shouldRemove;
      });
      return { ...entry, hooks: nextHooks };
    }).filter((entry: any) => !entry || typeof entry !== "object" || !Array.isArray(entry.hooks) || entry.hooks.length > 0);
    if (hooks[eventName].length === 0) delete hooks[eventName];
  }

  const nextSettings = { ...settings, hooks };
  if (Object.keys(hooks).length === 0) delete nextSettings.hooks;
  writeFileSync(path, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf-8");
  return { success: true, removed, status: getHooksStatus() };
}

function getUpdateStatus() {
  return updateStatus;
}

function getDoctorReport() {
  const hooks = getHooksStatus();
  return {
    generatedAt: Date.now(),
    appVersion: app.getVersion(),
    connection: getConnectionStatus(),
    providers: {
      "claude-code": {
        hooks,
        forwarder: { expectedPath: join(app.getAppPath(), "scripts", "hook-forwarder.js"), exists: true }
      },
      codex: {
        hooks,
        forwarder: { expectedPath: join(app.getAppPath(), "scripts", "hook-forwarder.js"), exists: true }
      }
    },
    hooks,
    forwarder: {
      expectedPath: join(app.getAppPath(), "scripts", "hook-forwarder.js"),
      exists: true,
      autoStartMarkerPath: settingsPath(),
      autoStartMarkerExists: companionSettings.autoStartWithCli === true
    },
    update: {
      ...getUpdateStatus(),
      autoUpdateEnabled: companionSettings.autoUpdateEnabled
    },
    plugins: {
      total: companionSettings.customPlugins.length,
      enabled: companionSettings.customPlugins.filter((plugin: { enabled?: boolean }) => plugin.enabled).length,
      trusted: companionSettings.customPlugins.filter((plugin: { trusted?: boolean }) => plugin.trusted).length,
      manifestErrors: companionSettings.customPlugins.filter((plugin: { manifestError?: string }) => plugin.manifestError).length
    },
    recent: {
      lastEventAt: eventHistory[0]?.timestamp,
      lastEventTitle: eventHistory[0]?.title
    }
  };
}

function broadcastCompanionEvent(event: CompanionEvent) {
  panelWindow?.webContents.send("companion:event", event);
  panelWindow?.webContents.send("companion:connection", getConnectionStatus());
  if (event.event === "permission_wait") {
    activePermissionIds.add(event.id);
    panelWindow?.webContents.send("companion:permission-request", {
      id: event.id,
      toolName: normalizeTool(event.tool),
      toolDetail: event.detail ?? event.message,
      sessionId,
      timestamp: event.timestamp,
      rawPayload: {}
    });
    return;
  }

  if (activePermissionIds.size > 0 && ["tool_start", "tool_end", "prompt_submit", "done", "error"].includes(event.event)) {
    for (const id of activePermissionIds) {
      panelWindow?.webContents.send("companion:permission-resolved", { id });
    }
    activePermissionIds.clear();
  }
}

function publishPetEvent(event: PetEvent) {
  currentState = event.event;
  eventHistory = [event, ...eventHistory].slice(0, 100);
  const companionEvent = toCompanionEvent(event);
  recordRuntimeEvent(companionEvent);
  petWindow?.webContents.send("pet-event", event);
  panelWindow?.webContents.send("pet-event", event);
  panelWindow?.webContents.send("pet-snapshot", getSnapshot());
  broadcastCompanionEvent(companionEvent);
  handleCompanionAlerts(companionEvent);
  updateTrayMenu();
}

function startEventServer() {
  eventServer = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method !== "POST" || req.url !== "/event") {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }

    try {
      const value = await readJson(req);
      if (!isPetEvent(value)) {
        sendJson(res, 400, { ok: false, error: "invalid_event" });
        return;
      }

      publishPetEvent(value);
      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 400, { ok: false, error: "invalid_json" });
    }
  });

  eventServer.listen(eventPort, "127.0.0.1");
}

if (singleInstanceLock) {
app.whenReady().then(() => {
  loadCompanionSettings();
  loadRuntimeStats();
  ipcMain.handle("pet:get-event-port", () => eventPort);
  ipcMain.handle("pet:get-snapshot", () => getSnapshot());
  ipcMain.handle("pet:minimize-panel", () => panelWindow?.minimize());
  ipcMain.handle("pet:toggle-maximize-panel", () => {
    if (!panelWindow) return;
    if (panelWindow.isMaximized()) panelWindow.unmaximize();
    else panelWindow.maximize();
  });
  ipcMain.handle("pet:close-panel", () => hidePanelWindow());
  ipcMain.handle("companion:get-settings", () => companionSettings);
  ipcMain.handle("companion:save-settings", (_, next: Partial<typeof companionSettings>) => {
    const previousLaunchAtLogin = companionSettings.launchAtLogin;
    const previousPetEnabled = companionSettings.petEnabled;
    const previousAlwaysOnTop = companionSettings.alwaysOnTop;
    companionSettings = { ...companionSettings, ...next };
    saveCompanionSettings();
    if (previousLaunchAtLogin !== companionSettings.launchAtLogin) {
      applyLaunchAtLoginSetting();
    }
    if (previousPetEnabled !== companionSettings.petEnabled) {
      if (isPetEnabled()) showPetWindow();
      else hidePetWindow();
    } else if (previousAlwaysOnTop !== companionSettings.alwaysOnTop) {
      applyPetAlwaysOnTopSetting();
      updateTrayMenu();
    }
    panelWindow?.webContents.send("companion:settings", companionSettings);
    panelWindow?.webContents.send("companion:connection", getConnectionStatus());
    return companionSettings;
  });
  ipcMain.handle("companion:get-connection-status", () => getConnectionStatus());
  ipcMain.handle("companion:check-hooks", () => getHooksStatus());
  ipcMain.handle("companion:install-hooks", () => installHooks());
  ipcMain.handle("companion:repair-hooks", () => repairHooks());
  ipcMain.handle("companion:remove-hooks", () => removeHooks());
  ipcMain.handle("companion:open-settings", () => showPanelWindow());
  ipcMain.handle("companion:minimize-settings", () => panelWindow?.minimize());
  ipcMain.handle("companion:toggle-maximize-settings", () => {
    if (!panelWindow) return;
    if (panelWindow.isMaximized()) panelWindow.unmaximize();
    else panelWindow.maximize();
  });
  ipcMain.handle("companion:close-settings", () => hidePanelWindow());
  ipcMain.handle("companion:set-pet-interactive", (_, interactive: boolean) => petWindow?.setIgnoreMouseEvents(!interactive, { forward: true }));
  ipcMain.handle("companion:update-permission-card-rect", () => undefined);
  ipcMain.handle("companion:drag-pet-to", (_, position: { x: number; y: number }) => petWindow?.setPosition(position.x, position.y));
  ipcMain.handle("companion:move-pet-by", (_, delta: { x: number; y: number }) => {
    if (!petWindow) return;
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(x + delta.x, y + delta.y);
  });
  ipcMain.handle("companion:respond-permission", (_, response: { id: string; decision?: string }) => {
    recordPermissionDecision(response.decision);
    panelWindow?.webContents.send("companion:permission-resolved", { id: response.id });
  });
  ipcMain.handle("companion:get-claude-route-runtime", () => getClaudeRouteRuntimePreview());
  ipcMain.handle("companion:apply-claude-route", (_, routeId: string) => applyClaudeRoute(routeId));
  ipcMain.handle("companion:test-claude-route", (_, routeId: string) => testClaudeRoute(routeId));
  ipcMain.handle("companion:open-claude-route-terminal", (_, routeId: string) => openClaudeRouteTerminal(routeId));
  ipcMain.handle("companion:get-update-status", () => getUpdateStatus());
  ipcMain.handle("companion:check-for-updates", () => checkForUpdates());
  ipcMain.handle("companion:install-update", () => installUpdate());
  ipcMain.handle("companion:get-app-version", () => app.getVersion());
  ipcMain.handle("companion:get-token-stats", (_, force?: boolean) => getClaudeTokenStats(Boolean(force)));
  ipcMain.handle("companion:preview-sound", (_, name: unknown) => isBuiltInSound(name) ? previewSoundDataUrl(name) : { ok: false, error: "Unknown sound type." });
  ipcMain.handle("companion:get-default-sound-paths", () => ({
    done: windowsMediaSoundPath("done"),
    error: windowsMediaSoundPath("error"),
    permission: windowsMediaSoundPath("permission")
  }));
  ipcMain.handle("companion:preview-sound-file", (_, filePath: string) => previewSoundFile(filePath));
  ipcMain.handle("companion:pick-sound-file", async () => {
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters: [{ name: "Audio", extensions: ["wav", "mp3"] }]
    };
    const result = panelWindow && !panelWindow.isDestroyed()
      ? await dialog.showOpenDialog(panelWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("companion:sync-idle-bubble", (_, payload: unknown) => panelWindow?.webContents.send("companion:idle-bubble-sync", payload));
  ipcMain.handle("companion:get-event-history", () => getCompanionEvents().map(event => ({ id: event.id, event, timestamp: event.timestamp })));
  ipcMain.handle("companion:get-session-history", () => getSessionHistory());
  ipcMain.handle("companion:clear-event-history", () => {
    eventHistory = [];
    panelWindow?.webContents.send("pet-snapshot", getSnapshot());
  });
  ipcMain.handle("companion:export-event-history-file", () => undefined);
  ipcMain.handle("companion:get-monitors", () => screen.getAllDisplays().map(display => ({ id: String(display.id), label: display.label || `Display ${display.id}`, bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor })));
  ipcMain.handle("companion:get-plugins", () => companionSettings.customPlugins);
  ipcMain.handle("companion:get-claude-resources", () => getClaudeResourcesSnapshot());
  ipcMain.handle("companion:get-claude-sessions", (_, force?: boolean) => getClaudeSessionSnapshot(Boolean(force)));
  ipcMain.handle("companion:get-claude-session-detail", (_, filePath: string) => getClaudeSessionDetail(filePath));
  ipcMain.handle("companion:resume-claude-session", (_, targetSessionId: string, projectPath?: string) => resumeClaudeSession(targetSessionId, projectPath));
  ipcMain.handle("companion:open-claude-resource", (_, targetPath: string) => {
    if (typeof targetPath !== "string" || !isAllowedClaudeResourcePath(targetPath)) return false;
    if (existsSync(targetPath) && statSync(targetPath).isFile()) shell.showItemInFolder(targetPath);
    else void shell.openPath(targetPath);
    return true;
  });
  ipcMain.handle("companion:get-plugin-runs", () => []);
  ipcMain.handle("companion:run-plugin-now", () => undefined);
  ipcMain.handle("companion:open-plugin-data-dir", () => undefined);
  ipcMain.handle("companion:get-plugin-market", () => ({ version: 1, plugins: [] }));
  ipcMain.handle("companion:install-market-plugin", () => undefined);
  ipcMain.handle("companion:save-plugins", (_, plugins: unknown[]) => {
    companionSettings = { ...companionSettings, customPlugins: plugins };
    saveCompanionSettings();
    panelWindow?.webContents.send("companion:settings", companionSettings);
  });
  ipcMain.handle("companion:open-external", (_, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle("companion:get-stats", () => getStats());
  ipcMain.handle("companion:reset-stats", () => {
    eventHistory = [];
    runtimeStats = createRuntimeStats();
    runtimeStatsDirty = true;
    saveRuntimeStats(true);
  });
  ipcMain.handle("companion:export-settings-file", () => undefined);
  ipcMain.handle("companion:import-settings-file", () => null);
  ipcMain.handle("companion:export-stats-file", () => undefined);
  ipcMain.handle("companion:import-stats-file", () => null);
  ipcMain.handle("companion:get-doctor-report", () => getDoctorReport());
  if (isPetEnabled()) createPetWindow();
  createTray();
  startEventServer();
  runStartupBehaviors();

  app.on("activate", () => {
    if (isPetEnabled() && !petWindow) createPetWindow();
  });
});
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (runtimeStats) {
    runtimeStats.totalRuntime = (runtimeStats.totalRuntime ?? 0) + (Date.now() - appStartedAt);
    runtimeStatsDirty = true;
    saveRuntimeStats(true);
  }
  eventServer?.close();
});
