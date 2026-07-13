// The launch for a Claude Code terminal pinned to a provider's config.
//
// The provider's env (ANTHROPIC_BASE_URL, tokens, ...) is handed to the child
// process through spawn's `env` option — never written to disk and never placed
// on the command line. That mirrors resumeClaudeSession(); it honors the
// ccSwitchStore invariant that API keys are never written outside the db and the
// live Claude settings file; and it sidesteps the nested-quote breakage that
// inlining `$env:X="url"; claude` through cmd/start used to cause (the old bug).

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

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

export interface ProviderTerminalLaunch {
  file: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * The child-process launch: `cmd.exe /K claude` in a fresh visible console, with
 * the provider's env layered over the inherited environment. Credentials live
 * only in `env` — `args` are constant and never carry provider values, so there
 * is nothing to quote-escape and nothing written to disk. Each call returns a
 * fresh, self-contained launch with no shared temp paths, so repeated opens of
 * the same provider can never collide or delete each other's files.
 */
export function buildProviderTerminalLaunch(
  providerEnv: Record<string, string>,
  baseEnv: Record<string, string | undefined>,
  comspec: string
): ProviderTerminalLaunch {
  // spawn's `env` replaces the environment wholesale, so start from the inherited
  // one (PATH, SystemRoot, ...) and overlay the provider's routing on top.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === "string") env[key] = value;
  }
  for (const [key, value] of Object.entries(providerEnv)) {
    // Windows env vars are case-insensitive: drop any inherited key that differs
    // only in case (inherited "Path" vs a provider "PATH") so the provider value
    // actually overrides, rather than leaving a duplicate the OS chooses between.
    const clash = Object.keys(env).find(existing => existing.toLowerCase() === key.toLowerCase());
    if (clash && clash !== key) delete env[clash];
    env[key] = value;
  }
  return {
    file: comspec || "cmd.exe",
    args: ["/K", "claude"],
    env
  };
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

/**
 * True if the `claude` CLI resolves in `env`'s PATH. Runs where.exe — by its
 * absolute path, so a provider PATH override can't hide where.exe itself — with
 * the exact env the terminal will get, so "'claude' is not recognized" is caught
 * before we report success (missing CLI, a PATH the app inherited before claude
 * was installed, or a provider env that overrides PATH). where.exe honors PATHEXT,
 * so it matches what `cmd /K claude` would actually run. Fails open (true) if the
 * probe can't run at all, so a broken probe never blocks a legitimate launch.
 */
export function claudeIsAvailable(
  env: Record<string, string | undefined>,
  spawnFn: typeof spawn = spawn
): Promise<boolean> {
  const systemRoot = env.SystemRoot || env.windir || "C:\\Windows";
  const whereExe = join(systemRoot, "System32", "where.exe");
  return new Promise(resolve => {
    let child: ChildProcess;
    try {
      child = spawnFn(whereExe, ["claude"], { env, windowsHide: true, stdio: "ignore" });
    } catch {
      resolve(true);
      return;
    }
    child.once("error", () => resolve(true));
    child.once("close", code => resolve(code === 0));
  });
}
