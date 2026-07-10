import { describe, it, expect } from "vitest";
import { deriveConnectionState, type HookStatusInput } from "../src/renderer/clawd-migrated/features/overview/connectionState";

// A fully-installed, current, present-forwarder status: the "everything is wired"
// baseline that individual tests degrade one link at a time.
const healthyHooks: HookStatusInput = {
  installed: true,
  configExists: true,
  hookCount: 6,
  requiredCount: 6,
  missingEvents: [],
  commandMatches: true,
  forwarder: { expectedPath: "C:/app/hook-forwarder.js", exists: true }
};

describe("deriveConnectionState: lifecycle states", () => {
  it("reports loading before the hook status has arrived", () => {
    const facts = deriveConnectionState(null, { serverListening: true });
    expect(facts.loading).toBe(true);
    expect(facts.firstRun).toBe(false);
    expect(facts.healthy).toBe(false);
  });

  it("treats a never-configured status as genuine first-run onboarding", () => {
    const facts = deriveConnectionState(
      { installed: false, configExists: false, hookCount: 0, requiredCount: 6, missingEvents: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop"], commandMatches: false },
      { serverListening: true }
    );
    expect(facts.loading).toBe(false);
    expect(facts.firstRun).toBe(true);
  });

  it("keeps an installed-but-partial config in the workbench, not onboarding", () => {
    const facts = deriveConnectionState(
      { installed: false, configExists: true, hookCount: 4, requiredCount: 6, missingEvents: ["Notification", "Stop"], commandMatches: true, forwarder: { expectedPath: "C:/app/hook-forwarder.js", exists: true } },
      { serverListening: true }
    );
    expect(facts.firstRun).toBe(false);
    expect(facts.configComplete).toBe(false);
    expect(facts.configState).toBe("partial");
    expect(facts.configuredCount).toBe(4);
    expect(facts.healthy).toBe(false);
  });
});

describe("deriveConnectionState: independent link facts", () => {
  it("flags a command/path-or-timeout mismatch as repair without touching config completeness", () => {
    const facts = deriveConnectionState({ ...healthyHooks, commandMatches: false }, { serverListening: true });
    expect(facts.configComplete).toBe(true);
    expect(facts.configState).toBe("healthy");
    expect(facts.commandOk).toBe(false);
    expect(facts.commandState).toBe("repair");
    expect(facts.healthy).toBe(false);
  });

  it("reports a missing forwarder file separately from hook configuration", () => {
    const facts = deriveConnectionState(
      { ...healthyHooks, forwarder: { expectedPath: "C:/app/hook-forwarder.js", exists: false } },
      { serverListening: true }
    );
    expect(facts.configComplete).toBe(true);
    expect(facts.forwarderKnown).toBe(true);
    expect(facts.forwarderOk).toBe(false);
    expect(facts.forwarderState).toBe("unavailable");
    expect(facts.healthy).toBe(false);
  });

  it("does not flag the forwarder as broken while its existence is still unknown", () => {
    const { forwarder, ...withoutForwarder } = healthyHooks;
    const facts = deriveConnectionState(withoutForwarder, { serverListening: true });
    expect(facts.forwarderKnown).toBe(false);
    expect(facts.forwarderOk).toBe(true);
    expect(facts.forwarderState).toBe("healthy");
  });
});

describe("deriveConnectionState: listener availability vs recent-event history", () => {
  it("stays healthy while listening with no event yet, and marks the event row as waiting (a non-failure)", () => {
    const facts = deriveConnectionState(healthyHooks, { serverListening: true, lastEventAt: null });
    expect(facts.listening).toBe(true);
    expect(facts.listenerState).toBe("healthy");
    expect(facts.hasRecentEvent).toBe(false);
    expect(facts.recentEventState).toBe("waiting");
    expect(facts.recentEventState).not.toBe("unavailable");
    // A missing recent event never drags overall health down.
    expect(facts.healthy).toBe(true);
  });

  it("does not treat a past event as proof the live listener is up", () => {
    const facts = deriveConnectionState(healthyHooks, { serverListening: false, lastEventAt: 1_000 });
    expect(facts.hasRecentEvent).toBe(true);
    expect(facts.recentEventState).toBe("healthy");
    // The listener is down regardless of a historical event, so health is false.
    expect(facts.listening).toBe(false);
    expect(facts.listenerState).toBe("unavailable");
    expect(facts.healthy).toBe(false);
  });

  it("is healthy end-to-end only when every live link is up", () => {
    const facts = deriveConnectionState(healthyHooks, { serverListening: true, lastEventAt: 2_000, port: 8765 });
    expect(facts.healthy).toBe(true);
    expect([facts.configState, facts.commandState, facts.forwarderState, facts.listenerState, facts.recentEventState])
      .toEqual(["healthy", "healthy", "healthy", "healthy", "healthy"]);
  });
});
