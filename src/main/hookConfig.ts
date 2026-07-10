// Pure hook-configuration evaluation, extracted from the Electron main process so
// it can be unit-tested without booting the app or touching the filesystem.
//
// The delivery-chain model reports three INDEPENDENT facts about the Claude Code
// settings: which required events reference our forwarder command (configuration),
// whether those commands point at the current forwarder path with the right
// PreToolUse timeout (command correctness), and — reported separately elsewhere —
// whether the forwarder file itself exists. Configuration completeness never
// depends on the forwarder file existing.
import { resolve } from "node:path";

export function extractHookForwarderPath(command: string): string {
  const match = command.match(/(?:"([^"]*hook-forwarder\.js)"|'([^']*hook-forwarder\.js)'|([^\s"']*hook-forwarder\.js))/i);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

export function normalizeComparablePath(path: string): string {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export interface ClawdHookCommandOptions {
  /** Require the configured forwarder path to equal `currentForwarderPath`. */
  matchesCurrentPath?: boolean;
  currentForwarderPath?: string;
}

// A command is one of ours when it invokes hook-forwarder.js for `eventName`.
// Command correctness (matchesCurrentPath) is a pure string comparison against
// the current forwarder path — file existence is deliberately NOT considered here.
export function isClawdHookCommand(command: unknown, eventName?: string, options: ClawdHookCommandOptions = {}): boolean {
  if (typeof command !== "string") return false;
  const normalized = command.replace(/\\/g, "/");
  if (!normalized.includes("hook-forwarder.js")) return false;
  if (!eventName) return true;
  if (!new RegExp(`(^|[\\s"'])${eventName}($|[\\s"'])`).test(normalized)) return false;

  if (options.matchesCurrentPath) {
    if (!options.currentForwarderPath) return false;
    return normalizeComparablePath(extractHookForwarderPath(command)) === normalizeComparablePath(options.currentForwarderPath);
  }
  return true;
}

export interface HookConfigEvaluationOptions {
  requiredEvents: string[];
  currentForwarderPath: string;
  preToolUseEvent?: string;
  preToolUseTimeout?: number;
}

export interface HookConfigEvaluation {
  /** Required events that do NOT yet reference our forwarder command. */
  missingEvents: string[];
  /** How many required events are configured. */
  hookCount: number;
  /** Every configured command points at the current path (+ correct PreToolUse timeout). */
  commandMatches: boolean;
  /** Config complete AND commands current — the settings-side "installed" fact. */
  installed: boolean;
}

function hookEntriesFor(settings: Record<string, any> | null | undefined, eventName: string): Array<Record<string, any>> {
  const eventConfig = settings?.hooks?.[eventName];
  if (!Array.isArray(eventConfig)) return [];
  return eventConfig.filter(entry => entry && typeof entry === "object") as Array<Record<string, any>>;
}

export function evaluateHookConfig(settings: Record<string, any> | null | undefined, options: HookConfigEvaluationOptions): HookConfigEvaluation {
  const { requiredEvents, currentForwarderPath, preToolUseEvent = "PreToolUse", preToolUseTimeout } = options;

  const missingEvents = requiredEvents.filter(eventName => {
    const entries = hookEntriesFor(settings, eventName);
    return !entries.some(entry => Array.isArray(entry.hooks) && entry.hooks.some((hook: any) => hook?.type === "command" && isClawdHookCommand(hook?.command, eventName)));
  });
  const hookCount = requiredEvents.length - missingEvents.length;

  const configuredEvents = requiredEvents.filter(eventName => !missingEvents.includes(eventName));
  const commandMatches = configuredEvents.length > 0 && configuredEvents.every(eventName => {
    const entries = hookEntriesFor(settings, eventName);
    return entries.some(entry => Array.isArray(entry.hooks) && entry.hooks.some((hook: any) =>
      hook?.type === "command"
      && isClawdHookCommand(hook?.command, eventName, { matchesCurrentPath: true, currentForwarderPath })
      && (eventName !== preToolUseEvent || preToolUseTimeout === undefined || hook?.timeout === preToolUseTimeout)));
  });

  return { missingEvents, hookCount, commandMatches, installed: missingEvents.length === 0 && commandMatches };
}
