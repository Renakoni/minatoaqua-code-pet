// Detect a double-click on the pet from WM_PARENTNOTIFY.
//
// In Electron (39+) a click on the pet's `-webkit-app-region: drag` element is
// delivered to Chromium's child render-widget HWND, not the outer BrowserWindow —
// so hookWindowMessage on the outer window never sees WM_NCLBUTTONDBLCLK, or even
// WM_LBUTTONDOWN. The one message the outer window does receive is WM_PARENTNOTIFY,
// emitted once per real child WM_LBUTTONDOWN. We reconstruct a double-click from two
// of those (within the system double-click time and a small distance) and hand the
// click point to the renderer, which hit-tests it against the actual pet element
// (document.elementFromPoint). That excludes the status/notification bubble, the
// permission card and its Allow/Deny buttons, plugin widgets and the transparent
// background for free, and native dragging (one down then movement, never two quick
// stationary downs) is preserved.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 as pathWin32 } from "node:path";

export const WM_PARENTNOTIFY = 0x0210;
export const WM_LBUTTONDOWN = 0x0201;

export interface ParentNotifyEvent {
  /** The child mouse message (low word of wParam), e.g. WM_LBUTTONDOWN. */
  message: number;
  /** Cursor position in the parent's client area, in physical pixels. */
  x: number;
  y: number;
}

/** Decode a WM_PARENTNOTIFY (wParam, lParam) pair into the child mouse event. */
export function decodeParentNotify(wParam: Buffer, lParam: Buffer): ParentNotifyEvent {
  return {
    message: wParam.readUInt16LE(0),
    x: lParam.readInt16LE(0),
    y: lParam.readInt16LE(2)
  };
}

export interface DoubleClickPoint {
  x: number;
  y: number;
}

export interface DoubleClickDetectorOptions {
  /** System double-click time in ms (GetDoubleClickTime / registry DoubleClickSpeed). */
  doubleClickMs: number;
  /** Max movement (physical px) between the two downs for a double-click. */
  maxDistancePx: number;
  /** Injected clock (Date.now). */
  now: () => number;
}

export interface DoubleClickDetector {
  /** Feed a left-button-down point; returns the point iff it completes a double-click. */
  push(x: number, y: number): DoubleClickPoint | null;
}

export function createDoubleClickDetector(options: DoubleClickDetectorOptions): DoubleClickDetector {
  let previous: { t: number; x: number; y: number } | null = null;
  return {
    push(x, y) {
      const t = options.now();
      const isPair = previous !== null
        && t - previous.t <= options.doubleClickMs
        && Math.abs(x - previous.x) <= options.maxDistancePx
        && Math.abs(y - previous.y) <= options.maxDistancePx;
      if (isPair) {
        previous = null; // consume the pair, so a triple-click isn't two double-clicks
        return { x, y };
      }
      previous = { t, x, y };
      return null;
    }
  };
}

export interface ParentNotifyHookWindow {
  hookWindowMessage(message: number, callback: (wParam: Buffer, lParam: Buffer) => void): void;
}

/**
 * Hook WM_PARENTNOTIFY on the pet window and call `onDoubleClick(x, y)` (physical
 * client px) when two child left-button-downs form a double-click. Register once per
 * pet window (createPetWindow's single-instance guard ensures that); the hook is
 * released when the window is destroyed, so recreations don't accumulate handlers.
 */
export function installPetParentNotifyWatcher(
  window: ParentNotifyHookWindow,
  detector: DoubleClickDetector,
  onDoubleClick: (x: number, y: number) => void
): void {
  window.hookWindowMessage(WM_PARENTNOTIFY, (wParam, lParam) => {
    const event = decodeParentNotify(wParam, lParam);
    if (event.message !== WM_LBUTTONDOWN) return;
    const hit = detector.push(event.x, event.y);
    if (hit) onDoubleClick(hit.x, hit.y);
  });
}

// --- System double-click time (read from the registry via a TRUSTED reg.exe) ---

/** Read a variable from an env map case-insensitively (Windows keys vary in case). */
function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(env).find(candidate => candidate.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

/**
 * The trusted `reg.exe` — `%SystemRoot%\System32\reg.exe`, resolved from SystemRoot
 * only. A bare "reg" would be searched in the process cwd first, so a project-local
 * reg.exe could run arbitrary code as soon as the pet window is created; a
 * fully-qualified absolute path can't be shadowed. Returns null if it isn't there.
 */
export function trustedRegExePath(
  env: Record<string, string | undefined>,
  fileExists: (path: string) => boolean = existsSync
): string | null {
  const systemRoot = envValue(env, "SystemRoot") || envValue(env, "windir") || "C:\\Windows";
  const candidate = pathWin32.join(systemRoot, "System32", "reg.exe");
  return pathWin32.isAbsolute(candidate) && fileExists(candidate) ? candidate : null;
}

/** Parse the DoubleClickSpeed (ms) from `reg query ... /v DoubleClickSpeed` output,
 *  clamped to a sane range; returns `fallbackMs` when it's absent or out of range. */
export function parseDoubleClickSpeed(regOutput: string, fallbackMs: number): number {
  const match = regOutput.match(/DoubleClickSpeed\s+REG_[A-Z_]+\s+(\d+)/i);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 100 && value <= 2000) return value;
  }
  return fallbackMs;
}

function runReg(regExe: string): string | null {
  try {
    // Short timeout so a wedged reg.exe can't block pet-window creation indefinitely.
    const out = spawnSync(regExe, ["query", "HKCU\\Control Panel\\Mouse", "/v", "DoubleClickSpeed"], {
      encoding: "utf8", windowsHide: true, timeout: 2000
    });
    return typeof out.stdout === "string" ? out.stdout : null;
  } catch {
    return null;
  }
}

/**
 * The user's system double-click time in ms (GetDoubleClickTime), read from the
 * registry via the TRUSTED absolute reg.exe (never a cwd-local one), clamped, with a
 * 500 ms fallback. `runRegQuery` / `fileExists` are injectable for tests.
 */
export function readSystemDoubleClickMs(
  env: Record<string, string | undefined>,
  runRegQuery: (regExe: string) => string | null = runReg,
  fileExists: (path: string) => boolean = existsSync
): number {
  const fallback = 500;
  const regExe = trustedRegExePath(env, fileExists);
  if (!regExe) return fallback;
  const output = runRegQuery(regExe);
  return output === null ? fallback : parseDoubleClickSpeed(output, fallback);
}
