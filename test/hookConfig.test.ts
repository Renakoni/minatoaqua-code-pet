import { describe, it, expect } from "vitest";
import { evaluateHookConfig, isClawdHookCommand } from "../src/main/hookConfig";

const REQUIRED = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop"];
const CURRENT = "/app/scripts/hook-forwarder.js";
const PRETOOLUSE_TIMEOUT = 75;

function commandFor(eventName: string, forwarderPath = CURRENT) {
  return `node "${forwarderPath}" ${eventName} --settings "/home/user/.claude/settings.json"`;
}

// Build a Claude settings object whose hooks reference our forwarder for the
// given events. `path` lets a test simulate a drifted (outdated) forwarder path.
function settingsWith(events: string[], opts: { path?: string; preToolUseTimeout?: number } = {}) {
  const hooks: Record<string, unknown> = {};
  for (const eventName of events) {
    const hook: Record<string, unknown> = { type: "command", command: commandFor(eventName, opts.path ?? CURRENT) };
    if (eventName === "PreToolUse") hook.timeout = opts.preToolUseTimeout ?? PRETOOLUSE_TIMEOUT;
    hooks[eventName] = [{ matcher: "*", hooks: [hook] }];
  }
  return { hooks };
}

const baseOptions = { requiredEvents: REQUIRED, currentForwarderPath: CURRENT, preToolUseEvent: "PreToolUse", preToolUseTimeout: PRETOOLUSE_TIMEOUT };

describe("evaluateHookConfig", () => {
  it("reports a complete, current configuration as installed", () => {
    const result = evaluateHookConfig(settingsWith(REQUIRED), baseOptions);
    expect(result.missingEvents).toEqual([]);
    expect(result.hookCount).toBe(6);
    expect(result.commandMatches).toBe(true);
    expect(result.installed).toBe(true);
  });

  it("evaluates configuration purely from settings, independent of forwarder-file existence", () => {
    // The evaluator never touches the filesystem: a config pointing at a path
    // that does not exist on disk is still fully configured. Forwarder existence
    // is a separate fact reported elsewhere.
    const result = evaluateHookConfig(settingsWith(REQUIRED), baseOptions);
    expect(result.missingEvents).toEqual([]);
    expect(result.commandMatches).toBe(true);
  });

  it("lists exactly the events that are not configured", () => {
    const result = evaluateHookConfig(settingsWith(["SessionStart", "PreToolUse", "Stop"]), baseOptions);
    expect(result.missingEvents).toEqual(["UserPromptSubmit", "PostToolUse", "Notification"]);
    expect(result.hookCount).toBe(3);
    expect(result.installed).toBe(false);
  });

  it("detects a command that points at an outdated forwarder path (config present, command stale)", () => {
    const result = evaluateHookConfig(settingsWith(REQUIRED, { path: "/old/location/hook-forwarder.js" }), baseOptions);
    // Every required event is still configured...
    expect(result.missingEvents).toEqual([]);
    expect(result.hookCount).toBe(6);
    // ...but the command no longer points at the current forwarder.
    expect(result.commandMatches).toBe(false);
    expect(result.installed).toBe(false);
  });

  it("detects an incorrect PreToolUse timeout even when every event is present", () => {
    const result = evaluateHookConfig(settingsWith(REQUIRED, { preToolUseTimeout: 60 }), baseOptions);
    expect(result.missingEvents).toEqual([]);
    expect(result.commandMatches).toBe(false);
    expect(result.installed).toBe(false);
  });

  it("treats empty or hookless settings as fully unconfigured", () => {
    expect(evaluateHookConfig({}, baseOptions)).toMatchObject({ hookCount: 0, commandMatches: false, installed: false });
    expect(evaluateHookConfig({ hooks: {} }, baseOptions).missingEvents).toEqual(REQUIRED);
    expect(evaluateHookConfig(null, baseOptions).installed).toBe(false);
  });
});

describe("isClawdHookCommand", () => {
  it("recognizes our forwarder command for a given event", () => {
    expect(isClawdHookCommand(commandFor("PreToolUse"), "PreToolUse")).toBe(true);
    expect(isClawdHookCommand(commandFor("PreToolUse"), "Stop")).toBe(false);
    expect(isClawdHookCommand("node other-script.js PreToolUse", "PreToolUse")).toBe(false);
  });

  it("only reports a path match when the configured path equals the current one", () => {
    expect(isClawdHookCommand(commandFor("Stop", CURRENT), "Stop", { matchesCurrentPath: true, currentForwarderPath: CURRENT })).toBe(true);
    expect(isClawdHookCommand(commandFor("Stop", "/old/hook-forwarder.js"), "Stop", { matchesCurrentPath: true, currentForwarderPath: CURRENT })).toBe(false);
    // Without a current path to compare against, a match cannot be asserted.
    expect(isClawdHookCommand(commandFor("Stop"), "Stop", { matchesCurrentPath: true })).toBe(false);
  });
});
