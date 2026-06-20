import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { isPetEvent, PetEvent } from "../shared/events";

const eventPort = 17321;
let petWindow: BrowserWindow | null = null;
let eventServer: ReturnType<typeof createServer> | null = null;
let tray: Tray | null = null;

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

function createPetWindow() {
  const bounds = getPetWindowBounds();

  petWindow = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: "#00000000",
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setBackgroundColor("#00000000");
  petWindow.setAlwaysOnTop(true, "screen-saver");

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    petWindow.loadURL(devServerUrl);
  } else {
    petWindow.loadFile(join(__dirname, "../../dist/index.html"));
  }

  petWindow.on("closed", () => {
    petWindow = null;
  });
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
  if (!petWindow) createPetWindow();
  if (!petWindow) return;

  petWindow.setBounds(getPetWindowBounds());
  petWindow.setOpacity(1);
  petWindow.setIgnoreMouseEvents(false);
  if (petWindow.isMinimized()) petWindow.restore();
  petWindow.show();
  petWindow.focus();
  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.moveTop();
}

function createTray() {
  const trayIcon = createTrayIcon();

  tray = new Tray(trayIcon);
  tray.setToolTip("Claude Codex Pet is running");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示桌宠",
        click: showPetWindow
      },
      {
        label: "隐藏桌宠",
        click: () => petWindow?.hide()
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => app.quit()
      }
    ])
  );

  tray.on("click", showPetWindow);
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

function publishPetEvent(event: PetEvent) {
  petWindow?.webContents.send("pet-event", event);
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

app.whenReady().then(() => {
  ipcMain.handle("pet:get-event-port", () => eventPort);
  createPetWindow();
  createTray();
  startEventServer();

  app.on("activate", () => {
    if (!petWindow) createPetWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  eventServer?.close();
});
