// PowerShell terminal launch for a Claude provider or a session resume.
//
// Chara Desk opens a real, direct Windows PowerShell — never cmd.exe. The user's
// provider env (ANTHROPIC_BASE_URL, tokens, ...) is passed through spawn's `env`
// (never argv, never disk). The trusted Claude executable path and the validated
// session id are passed as dedicated child-only env vars and invoked with a FIXED
// PowerShell call-operator command, so no dynamic value is ever interpolated into a
// PowerShell source string or the argv. PowerShell loads the user's normal profile
// (so Conda init etc. work) and stays open after Claude exits (-NoExit).

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { win32 as pathWin32 } from "node:path";

/** The provider's env as a plain string map: string values kept, finite numbers
 *  stringified, everything else dropped. */
export function providerTerminalEnv(settingsConfig: unknown): Record<string, string> {
  const env = settingsConfig && typeof settingsConfig === "object" && !Array.isArray(settingsConfig)
    ? (settingsConfig as Record<string, unknown>).env
    : undefined;
  const out: Record<string, string> = {};
  if (env && typeof env === "object" && !Array.isArray(env)) {
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) out[key] = String(value);
    }
  }
  return out;
}

/**
 * Overlay `overlay` onto `baseEnv`, case-insensitively. spawn's `env` replaces the
 * environment wholesale, so start from the inherited one (PATH, SystemRoot, ...) and
 * layer the provider's routing (and our child-only vars) on top. Windows env keys are
 * case-insensitive, so an inherited "Path" and an overlaid "PATH" collapse to a single
 * key with the overlay's value — otherwise the OS would arbitrate between duplicates.
 * Credentials live only here, never on the command line.
 */
export function mergeTerminalEnv(
  overlay: Record<string, string>,
  baseEnv: Record<string, string | undefined>
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === "string") env[key] = value;
  }
  for (const [key, value] of Object.entries(overlay)) {
    const clash = Object.keys(env).find(existing => existing.toLowerCase() === key.toLowerCase());
    if (clash && clash !== key) delete env[clash];
    env[key] = value;
  }
  return env;
}

/**
 * True only for a genuinely fully-qualified Windows path — drive-absolute (`C:\...`)
 * or UNC (`\\server\share...`). Rejects relative (`.`, `tools`, `.\bin`),
 * drive-root-relative (`\tools`, which resolves against the current drive) and
 * drive-relative (`C:tools`, which resolves against the drive's current directory).
 * `path.win32.isAbsolute` is NOT sufficient: it returns true for `\tools`.
 */
export function isFullyQualifiedWindowsPath(candidate: string): boolean {
  const value = candidate.trim();
  return /^[a-zA-Z]:[\\/]/.test(value) || /^[\\/][\\/]/.test(value);
}

/** Read a variable from an env map case-insensitively (Windows keys vary in case). */
function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(env).find(candidate => candidate.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

/**
 * The trusted Windows PowerShell executable
 * (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`), resolved from
 * SystemRoot only — never PATH or the selected project — so a project-local
 * `powershell.exe` can never shadow the trusted shell. Returns null if it is absent.
 */
export function trustedPowerShellPath(
  env: Record<string, string | undefined>,
  fileExists: (path: string) => boolean = existsSync
): string | null {
  const systemRoot = envValue(env, "SystemRoot") || envValue(env, "windir") || "C:\\Windows";
  const candidate = pathWin32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return fileExists(candidate) ? candidate : null;
}

export type ClaudeResolution =
  | { ok: true; path: string }
  | { ok: false; reason: "not-found" | "batch-only" };

/**
 * Resolve `claude` to a trusted, fully-qualified NATIVE entry point from PATH only —
 * `claude.exe` or PowerShell-native `claude.ps1`. It deliberately never resolves
 * `claude.cmd`/`claude.bat`, because PowerShell delegates batch files to cmd.exe;
 * if only a batch shim exists it reports `batch-only` instead of silently falling
 * back to cmd. It never searches the working directory and only accepts genuinely
 * fully-qualified PATH entries, so a project-local shim can't shadow the CLI or
 * receive the provider credentials. The same absolute path is validated here and
 * executed later, so they always identify the same file.
 */
export function resolveClaudeExecutable(
  env: Record<string, string | undefined>,
  fileExists: (path: string) => boolean = existsSync
): ClaudeResolution {
  const dirs = (envValue(env, "PATH") ?? "")
    .split(";")
    .map(dir => dir.trim().replace(/^"|"$/g, ""))
    .filter(dir => isFullyQualifiedWindowsPath(dir));
  for (const dir of dirs) {
    for (const ext of [".exe", ".ps1"]) {
      const candidate = pathWin32.join(dir, `claude${ext}`);
      if (isFullyQualifiedWindowsPath(candidate) && fileExists(candidate)) return { ok: true, path: candidate };
    }
  }
  // A batch shim on its own is not usable without cmd.exe — report it specifically.
  for (const dir of dirs) {
    for (const ext of [".cmd", ".bat"]) {
      if (fileExists(pathWin32.join(dir, `claude${ext}`))) return { ok: false, reason: "batch-only" };
    }
  }
  return { ok: false, reason: "not-found" };
}

/**
 * Decide the working directory for a session resume. Only fall back to the home
 * directory when the session recorded NO cwd at all; a recorded-but-unavailable cwd
 * (offline share, deleted/moved project) fails with the path so the caller can format
 * an actionable, copyable error instead of silently resuming in the home directory.
 * No cmd-era UNC/extended rejection: PowerShell can open those, and an unusable form
 * fails at spawn rather than launching elsewhere.
 */
export function resolveSessionCwd(
  projectPath: string | undefined,
  homeDir: string,
  isDir: (path: string) => boolean = isExistingDirectory
): { ok: true; cwd: string } | { ok: false; path: string } {
  const requested = typeof projectPath === "string" ? projectPath.trim() : "";
  if (!requested) return { ok: true, cwd: homeDir };
  if (!isDir(requested)) return { ok: false, path: requested };
  return { ok: true, cwd: requested };
}

function isExistingDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Child-only env vars carrying the trusted Claude path and validated session id.
export const CHARA_DESK_CLAUDE_ENV = "CHARA_DESK_CLAUDE";
export const CHARA_DESK_RESUME_ID_ENV = "CHARA_DESK_RESUME_ID";

// FIXED PowerShell commands — the call operator runs the scalar path/id from the
// child environment, so spaces or `& ( ) ^ %` in the Claude path never re-parse and
// no dynamic value is interpolated into the command string.
export const PS_RUN_CLAUDE = `& $env:${CHARA_DESK_CLAUDE_ENV}`;
export const PS_RESUME_CLAUDE = `& $env:${CHARA_DESK_CLAUDE_ENV} --resume $env:${CHARA_DESK_RESUME_ID_ENV}`;

export interface PowerShellLaunch {
  file: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Build the direct PowerShell launch: `powershell.exe -NoExit -Command <fixed>`.
 * `-NoExit` keeps the window open after Claude exits; the user's normal profile
 * loads (no `-NoProfile` / `-NonInteractive` / `-ExecutionPolicy` override), so the
 * shell behaves like a normal user session (Conda etc.).
 */
export function buildPowerShellLaunch(powershellExe: string, command: string, env: Record<string, string>): PowerShellLaunch {
  return { file: powershellExe, args: ["-NoExit", "-Command", command], env };
}

/** "Not a folder" message, path omitted when paths are hidden. */
export function notAFolderMessage(path: string, hidePaths: boolean): string {
  if (hidePaths) return "That folder can't be used.";
  return `Not a folder: ${path || "(none selected)"}`;
}

/** Session-cwd-unavailable message, path omitted when paths are hidden. */
export function sessionFolderUnavailableMessage(path: string, hidePaths: boolean): string {
  if (hidePaths) return "This session's folder isn't available. Reconnect or reopen the project, or run the copied command there.";
  return `This session's folder isn't available (${path}). Reconnect or reopen the project, or run the copied command there.`;
}

/** Async launch-failure message, reason omitted when paths are hidden (it may embed the cwd). */
export function launchFailedMessage(reason: string | undefined, hidePaths: boolean): string {
  if (hidePaths) return "Couldn't open the terminal — check the folder and try again.";
  return `Couldn't open the terminal: ${reason ?? "unknown error"}`;
}

/**
 * Resolve once the terminal process has actually spawned; reject if it fails to
 * launch. child_process.spawn reports launch failures asynchronously through the
 * 'error' event instead of throwing, so a caller that returns right after spawn()
 * would claim a false success — and the unhandled 'error' event would crash the
 * main process. Awaiting this collapses both outcomes into a normal resolve/reject.
 */
export function awaitTerminalLaunch(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("spawn", () => resolve());
    child.once("error", (error) => reject(error));
  });
}

export interface TerminalLaunchResult {
  ok: boolean;
  error?: string;
}

/**
 * Spawn a detached terminal and resolve only once it has actually launched. Both the
 * provider terminal and session resume go through here, so a launch failure (spawn
 * reports these asynchronously via 'error', not by throwing) becomes a clean
 * { ok:false, error } for the renderer instead of a false success plus an unhandled
 * ChildProcess 'error' that could take down the main process. The window stays open.
 */
export async function launchDetachedTerminal(
  file: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> },
  spawnFn: typeof spawn = spawn
): Promise<TerminalLaunchResult> {
  try {
    const child = spawnFn(file, args, { ...options, detached: true, windowsHide: false, stdio: "ignore" });
    await awaitTerminalLaunch(child);
    child.unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
