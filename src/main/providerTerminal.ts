// The launch for a Claude Code terminal pinned to a provider's config.
//
// The provider's env (ANTHROPIC_BASE_URL, tokens, ...) is handed to the child
// process through spawn's `env` option — never written to disk and never placed
// on the command line. That mirrors resumeClaudeSession(); it honors the
// ccSwitchStore invariant that API keys are never written outside the db and the
// live Claude settings file; and it sidesteps the nested-quote breakage that
// inlining `$env:X="url"; claude` through cmd/start used to cause (the old bug).

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 as pathWin32 } from "node:path";

/** The provider's env as a plain string map: string values kept, finite
 *  numbers stringified, everything else dropped. */
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
 * Merge the provider env over the inherited environment. spawn's `env` replaces
 * the environment wholesale, so start from the inherited one (PATH, SystemRoot,
 * ...) and overlay the provider's routing. Windows env vars are case-insensitive,
 * so an inherited "Path" and a provider "PATH" collapse to a single key with the
 * provider's value — otherwise the OS would arbitrate between duplicates.
 * Credentials live only here, never on the command line.
 */
export function mergeTerminalEnv(
  providerEnv: Record<string, string>,
  baseEnv: Record<string, string | undefined>
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === "string") env[key] = value;
  }
  for (const [key, value] of Object.entries(providerEnv)) {
    const clash = Object.keys(env).find(existing => existing.toLowerCase() === key.toLowerCase());
    if (clash && clash !== key) delete env[clash];
    env[key] = value;
  }
  return env;
}

/**
 * Normalize a working directory so cmd.exe accepts it. cmd.exe rejects the
 * extended-length `\\?\` prefix the same way it rejects UNC — it warns and
 * silently runs from C:\Windows — so strip it: `\\?\C:\p` -> `C:\p`, and
 * `\\?\UNC\srv\share` -> `\\srv\share` (still UNC, rejected downstream by isUncPath).
 */
export function normalizeWorkingDirectory(dir: string): string {
  const trimmed = dir.trim();
  if (/^\\\\\?\\unc\\/i.test(trimmed)) return `\\\\${trimmed.slice(8)}`;
  if (/^\\\\\?\\/.test(trimmed)) return trimmed.slice(4);
  return trimmed;
}

/**
 * Resolve `claude` to a trusted absolute path from PATH + PATHEXT in `env`, NEVER
 * the working directory. cmd.exe searches the current directory before PATH for an
 * unqualified name, so launching this resolved absolute path is what stops a
 * project-local claude.cmd/.bat/.exe from shadowing the real CLI and stealing the
 * provider credentials we pass in the environment. PATHEXT order matches how cmd
 * would resolve it. Returns null when claude is not found on PATH.
 */
export function resolveClaudeExecutable(
  env: Record<string, string | undefined>,
  fileExists: (path: string) => boolean = existsSync
): string | null {
  const pathValue = envValue(env, "PATH") ?? "";
  const pathExt = envValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD";
  const exts = pathExt.split(";").map(ext => ext.trim()).filter(Boolean);
  for (const rawDir of pathValue.split(";")) {
    const dir = rawDir.trim().replace(/^"|"$/g, "");
    if (!dir) continue;
    for (const ext of exts) {
      // PATHEXT entries are conventionally uppercase; lower-case the extension so
      // the resolved path is predictable. Windows' filesystem is case-insensitive,
      // so this still matches a claude.CMD/claude.EXE on disk.
      const candidate = pathWin32.join(dir, `claude${ext.toLowerCase()}`);
      if (fileExists(candidate)) return candidate;
    }
  }
  return null;
}

/** Read a variable from an env map case-insensitively (Windows keys vary in case). */
function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(env).find(candidate => candidate.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
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

/**
 * True if `dir` is a UNC network path — `\\server\share`, `//server/share`, or
 * the extended `\\?\UNC\...` form. cmd.exe can't use a UNC path as its working
 * directory: it warns "UNC paths are not supported" and silently falls back to
 * C:\Windows, so a network folder the user picked would launch the terminal in
 * the wrong place while still reporting success. Callers reject these instead.
 * (`\\?\C:\...` is a local extended-length path, not UNC.)
 */
export function isUncPath(dir: string): boolean {
  const path = dir.trim();
  if (/^\\\\\?\\/.test(path)) return /^\\\\\?\\unc\\/i.test(path);
  return /^[\\/]{2}/.test(path);
}

export interface TerminalLaunchResult {
  ok: boolean;
  error?: string;
}

/**
 * Spawn a detached terminal and resolve only once it has actually launched. Both
 * the provider terminal and session resume go through here so a launch failure
 * (spawn reports these asynchronously via 'error', not by throwing) becomes a
 * clean { ok:false, error } for the renderer instead of a false success plus an
 * unhandled ChildProcess 'error' that could take down the main process.
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
