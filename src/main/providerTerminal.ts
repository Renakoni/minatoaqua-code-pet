// The launch for a Claude Code terminal pinned to a provider's config.
//
// The provider's env (ANTHROPIC_BASE_URL, tokens, ...) is handed to the child
// process through spawn's `env` option — never written to disk and never placed
// on the command line. That mirrors resumeClaudeSession(); it honors the
// ccSwitchStore invariant that API keys are never written outside the db and the
// live Claude settings file; and it sidesteps the nested-quote breakage that
// inlining `$env:X="url"; claude` through cmd/start used to cause (the old bug).

import type { ChildProcess } from "node:child_process";

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
