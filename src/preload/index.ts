import { contextBridge, ipcRenderer } from "electron";
import { PetEvent, PetState } from "../shared/events";

export interface PetSnapshot {
  state: PetState;
  events: PetEvent[];
  startedAt: number;
  eventPort: number;
}

type Unsubscribe = () => void;

function onChannel<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("petAPI", {
  onPetEvent(callback: (event: PetEvent) => void) {
    return onChannel<PetEvent>("pet-event", callback);
  },
  onSnapshot(callback: (snapshot: PetSnapshot) => void) {
    return onChannel<PetSnapshot>("pet-snapshot", callback);
  },
  getSnapshot() {
    return ipcRenderer.invoke("pet:get-snapshot") as Promise<PetSnapshot>;
  },
  minimizePanel() {
    return ipcRenderer.invoke("pet:minimize-panel") as Promise<void>;
  },
  toggleMaximizePanel() {
    return ipcRenderer.invoke("pet:toggle-maximize-panel") as Promise<void>;
  },
  closePanel() {
    return ipcRenderer.invoke("pet:close-panel") as Promise<void>;
  }
});

contextBridge.exposeInMainWorld("companion", {
  getSettings: () => ipcRenderer.invoke("companion:get-settings"),
  saveSettings: (next: unknown) => ipcRenderer.invoke("companion:save-settings", next),
  getConnectionStatus: () => ipcRenderer.invoke("companion:get-connection-status"),
  sendTestEvent: (event?: unknown) => ipcRenderer.invoke("companion:send-test-event", event),
  checkHooks: (provider?: unknown) => ipcRenderer.invoke("companion:check-hooks", provider),
  installHooks: (provider?: unknown) => ipcRenderer.invoke("companion:install-hooks", provider),
  repairHooks: (provider?: unknown) => ipcRenderer.invoke("companion:repair-hooks", provider),
  removeHooks: (provider?: unknown) => ipcRenderer.invoke("companion:remove-hooks", provider),
  openSettings: () => ipcRenderer.invoke("companion:open-settings"),
  minimizeSettings: () => ipcRenderer.invoke("companion:minimize-settings"),
  toggleMaximizeSettings: () => ipcRenderer.invoke("companion:toggle-maximize-settings"),
  closeSettings: () => ipcRenderer.invoke("companion:close-settings"),
  onEvent: (callback: (event: unknown) => void) => onChannel("companion:event", callback),
  onSettings: (callback: (settings: unknown) => void) => onChannel("companion:settings", callback),
  onConnection: (callback: (connection: unknown) => void) => onChannel("companion:connection", callback),
  setPetInteractive: (interactive: boolean) => ipcRenderer.invoke("companion:set-pet-interactive", interactive),
  updatePermissionCardRect: (rect: unknown) => ipcRenderer.invoke("companion:update-permission-card-rect", rect),
  dragPetTo: (position: unknown) => ipcRenderer.invoke("companion:drag-pet-to", position),
  movePetBy: (delta: unknown) => ipcRenderer.invoke("companion:move-pet-by", delta),
  onPermissionRequest: (callback: (request: unknown) => void) => onChannel("companion:permission-request", callback),
  onPermissionResolved: (callback: (payload: unknown) => void) => onChannel("companion:permission-resolved", callback),
  respondPermission: (response: unknown) => ipcRenderer.invoke("companion:respond-permission", response),
  checkForUpdates: () => ipcRenderer.invoke("companion:check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("companion:install-update"),
  getClaudeRouteRuntime: () => ipcRenderer.invoke("companion:get-claude-route-runtime"),
  applyClaudeRoute: (routeId: string) => ipcRenderer.invoke("companion:apply-claude-route", routeId),
  testClaudeRoute: (routeId: string) => ipcRenderer.invoke("companion:test-claude-route", routeId),
  openClaudeRouteTerminal: (routeId: string) => ipcRenderer.invoke("companion:open-claude-route-terminal", routeId),
  getUpdateStatus: () => ipcRenderer.invoke("companion:get-update-status"),
  getAppVersion: () => ipcRenderer.invoke("companion:get-app-version"),
  getTokenStats: (force?: boolean) => ipcRenderer.invoke("companion:get-token-stats", force),
  previewSound: () => ipcRenderer.invoke("companion:preview-sound"),
  getDefaultSoundPaths: () => ipcRenderer.invoke("companion:get-default-sound-paths"),
  previewSoundFile: (path: string) => ipcRenderer.invoke("companion:preview-sound-file", path),
  pickSoundFile: () => ipcRenderer.invoke("companion:pick-sound-file"),
  triggerIdleBubble: () => ipcRenderer.invoke("companion:trigger-idle-bubble"),
  syncIdleBubble: (payload: unknown) => ipcRenderer.invoke("companion:sync-idle-bubble", payload),
  onIdleBubbleSync: (callback: (payload: unknown) => void) => onChannel("companion:idle-bubble-sync", callback),
  getEventHistory: () => ipcRenderer.invoke("companion:get-event-history"),
  getSessionHistory: () => ipcRenderer.invoke("companion:get-session-history"),
  clearEventHistory: () => ipcRenderer.invoke("companion:clear-event-history"),
  exportEventHistoryFile: () => ipcRenderer.invoke("companion:export-event-history-file"),
  getMonitors: () => ipcRenderer.invoke("companion:get-monitors"),
  getPlugins: () => ipcRenderer.invoke("companion:get-plugins"),
  getClaudeResources: () => ipcRenderer.invoke("companion:get-claude-resources"),
  getClaudeSessions: (force?: boolean) => ipcRenderer.invoke("companion:get-claude-sessions", force),
  getClaudeSessionDetail: (filePath: string) => ipcRenderer.invoke("companion:get-claude-session-detail", filePath),
  resumeClaudeSession: (sessionId: string, projectPath?: string) => ipcRenderer.invoke("companion:resume-claude-session", sessionId, projectPath),
  openClaudeResource: (path: string) => ipcRenderer.invoke("companion:open-claude-resource", path),
  getPluginRuns: () => ipcRenderer.invoke("companion:get-plugin-runs"),
  runPluginNow: (pluginId: string) => ipcRenderer.invoke("companion:run-plugin-now", pluginId),
  openPluginDataDir: (pluginId: string) => ipcRenderer.invoke("companion:open-plugin-data-dir", pluginId),
  getPluginMarket: () => ipcRenderer.invoke("companion:get-plugin-market"),
  installMarketPlugin: (pluginId: string) => ipcRenderer.invoke("companion:install-market-plugin", pluginId),
  savePlugins: (plugins: unknown[]) => ipcRenderer.invoke("companion:save-plugins", plugins),
  openExternal: (url: string) => ipcRenderer.invoke("companion:open-external", url),
  getStats: () => ipcRenderer.invoke("companion:get-stats"),
  resetStats: () => ipcRenderer.invoke("companion:reset-stats"),
  exportSettingsFile: () => ipcRenderer.invoke("companion:export-settings-file"),
  importSettingsFile: () => ipcRenderer.invoke("companion:import-settings-file"),
  exportStatsFile: () => ipcRenderer.invoke("companion:export-stats-file"),
  importStatsFile: () => ipcRenderer.invoke("companion:import-stats-file"),
  getDoctorReport: () => ipcRenderer.invoke("companion:get-doctor-report"),
  onTriggerIdleBubble: (callback: () => void) => onChannel("companion:trigger-idle-bubble", callback),
  onUpdateStatus: (callback: (status: unknown) => void) => onChannel("companion:update-status", callback),
  onPlaySound: (callback: (dataUrl: string) => void) => onChannel("companion:play-sound", callback),
  onOpenSection: (callback: (section: string) => void) => onChannel("companion:open-section", callback)
});
