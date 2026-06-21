import type { App } from "electron";
import electronUpdater from "electron-updater";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { UpdateStatus } from "../shared/events.js";

const { autoUpdater } = electronUpdater;

export interface AutoUpdaterController {
  setup: () => void;
  checkForUpdates: () => ReturnType<typeof autoUpdater.checkForUpdates>;
  quitAndInstall: () => void;
  getDownloadedInstallerPath: () => string | undefined;
}

interface AutoUpdaterOptions {
  app: App;
  getStatus: () => UpdateStatus;
  setStatus: (status: UpdateStatus) => void;
  broadcastStatus: () => void;
  log: (message: string) => void;
}

export function createAutoUpdaterController(options: AutoUpdaterOptions): AutoUpdaterController {
  let downloadedInstallerPath: string | undefined;
  let configured = false;

  function update(next: UpdateStatus) {
    options.setStatus(next);
    options.broadcastStatus();
  }

  function setup() {
    if (configured) return;
    configured = true;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.setFeedURL({
      provider: "github",
      owner: "Doulor",
      repo: "Clawd-Companion",
      releaseType: "release"
    });

    autoUpdater.on("checking-for-update", () => {
      options.log("autoUpdater: checking-for-update");
      update({ ...options.getStatus(), checking: true, upToDate: false, error: undefined, lastCheckedAt: Date.now() });
    });

    autoUpdater.on("update-available", info => {
      options.log(`autoUpdater: update-available v${info.version}`);
      update({ ...options.getStatus(), checking: false, available: true, version: info.version });
    });

    autoUpdater.on("update-not-available", () => {
      options.log("autoUpdater: update-not-available");
      update({ checking: false, available: false, upToDate: true, downloaded: false, downloading: false, version: undefined, lastCheckedAt: Date.now() });
    });

    autoUpdater.on("download-progress", progress => {
      update({ ...options.getStatus(), downloading: true, progress: progress.percent });
    });

    autoUpdater.on("update-downloaded", info => {
      downloadedInstallerPath = (info as { downloadedFile?: string }).downloadedFile;
      options.log(`update-downloaded: info.downloadedFile = ${downloadedInstallerPath}`);
      if (!downloadedInstallerPath) {
        downloadedInstallerPath = findDownloadedInstaller(options.app, options.log);
      }
      if (!downloadedInstallerPath) {
        options.log("update-downloaded: FAILED to find installer path");
      }
      update({ checking: false, available: true, upToDate: false, downloading: false, downloaded: true, version: info.version, progress: 100 });
    });

    autoUpdater.on("error", error => {
      update({ ...options.getStatus(), checking: false, downloading: false, error: error.message, lastCheckedAt: Date.now() });
      options.log(`autoUpdater error: ${error.message}`);
    });
  }

  return {
    setup,
    checkForUpdates: () => autoUpdater.checkForUpdates(),
    quitAndInstall: () => autoUpdater.quitAndInstall(),
    getDownloadedInstallerPath: () => downloadedInstallerPath
  };
}

function findDownloadedInstaller(app: App, log: (message: string) => void): string | undefined {
  const possibleDirs = [
    join(app.getPath("userData"), "..", "Cache", "Clawd Companion", "pending"),
    join(app.getPath("userData"), "Cache", "pending"),
    join(app.getPath("temp"), "Clawd Companion", "pending"),
    join(app.getPath("appData"), "Cache", "Clawd Companion", "pending")
  ];

  for (const cacheDir of possibleDirs) {
    try {
      log(`update-downloaded: searching ${cacheDir}`);
      const files = readdirSync(cacheDir)
        .filter(file => file.endsWith(".exe"))
        .map(file => ({ name: file, time: statSync(join(cacheDir, file)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
      if (files.length > 0) {
        const installerPath = join(cacheDir, files[0].name);
        log(`update-downloaded: found ${installerPath}`);
        return installerPath;
      }
    } catch (error) {
      log(`update-downloaded: search failed for ${cacheDir}: ${error}`);
    }
  }

  return undefined;
}
