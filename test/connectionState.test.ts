import { describe, it, expect } from "vitest";
import { deriveConnectionState, resolveRecheck, type HookStatusInput } from "../src/renderer/clawd-migrated/features/overview/connectionState";

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

describe("deriveConnectionState: mode selection", () => {
  it("is loading before the hook status has arrived", () => {
    const facts = deriveConnectionState(null, { serverListening: true });
    expect(facts.mode).toBe("loading");
    expect(facts.healthy).toBe(false);
  });

  it("is a transient check-failed error when a Recheck request failed", () => {
    const facts = deriveConnectionState(healthyHooks, { serverListening: true }, true);
    expect(facts.mode).toBe("error");
    expect(facts.errorReason).toBe("check-failed");
  });

  it("is a distinct settings-unreadable error for a corrupt/unreadable settings file", () => {
    // A successful refresh that reports configReadError is NOT a transient retry
    // failure — it needs its own factual remediation, not "try again".
    const facts = deriveConnectionState(
      { ...healthyHooks, hookCount: 0, missingEvents: healthyHooks.missingEvents, configReadError: true },
      { serverListening: true }
    );
    expect(facts.mode).toBe("error");
    expect(facts.errorReason).toBe("settings-unreadable");
  });

  it("a check failure outranks configReadError (the fetch itself did not complete)", () => {
    const facts = deriveConnectionState({ ...healthyHooks, configReadError: true }, { serverListening: true }, true);
    expect(facts.errorReason).toBe("check-failed");
  });

  it("has no error reason outside error mode", () => {
    expect(deriveConnectionState(null, { serverListening: true }).errorReason).toBeNull();
    expect(deriveConnectionState(healthyHooks, { serverListening: true }).errorReason).toBeNull();
  });

  it("is notConfigured when no Clawd hooks are configured", () => {
    const facts = deriveConnectionState(
      { installed: false, configExists: true, hookCount: 0, requiredCount: 6, missingEvents: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop"], commandMatches: false, forwarder: { expectedPath: "C:/app/hook-forwarder.js", exists: true } },
      { serverListening: true }
    );
    expect(facts.mode).toBe("notConfigured");
  });

  it("keeps an installed-but-partial config in the workbench, not onboarding", () => {
    const facts = deriveConnectionState(
      { installed: false, configExists: true, hookCount: 4, requiredCount: 6, missingEvents: ["Notification", "Stop"], commandMatches: true, forwarder: { expectedPath: "C:/app/hook-forwarder.js", exists: true } },
      { serverListening: true }
    );
    expect(facts.mode).toBe("workbench");
    expect(facts.configComplete).toBe(false);
    expect(facts.configState).toBe("partial");
    expect(facts.configuredCount).toBe(4);
  });
});

describe("deriveConnectionState: action gating by failed link", () => {
  it("offers Repair for a hook command/timeout mismatch (config side is fine)", () => {
    const facts = deriveConnectionState({ ...healthyHooks, commandMatches: false }, { serverListening: true });
    expect(facts.configState).toBe("healthy");
    expect(facts.commandState).toBe("repair");
    expect(facts.needsHookRepair).toBe(true);
    expect(facts.canRepair).toBe(true);
    expect(facts.healthy).toBe(false);
  });

  it("does NOT offer Repair for a listener-only failure", () => {
    const facts = deriveConnectionState(healthyHooks, { serverListening: false });
    expect(facts.needsHookRepair).toBe(false);
    expect(facts.canRepair).toBe(false);
    expect(facts.listenerDown).toBe(true);
    expect(facts.listenerState).toBe("unavailable");
    expect(facts.healthy).toBe(false);
  });

  it("does NOT offer a doomed Repair when the forwarder file is missing", () => {
    const facts = deriveConnectionState(
      { ...healthyHooks, installed: false, missingEvents: ["Stop"], hookCount: 5, forwarder: { expectedPath: "C:/app/hook-forwarder.js", exists: false } },
      { serverListening: true }
    );
    // Config needs work, but Repair reinstalls via the forwarder — which is gone.
    expect(facts.needsHookRepair).toBe(true);
    expect(facts.forwarderMissing).toBe(true);
    expect(facts.forwarderState).toBe("unavailable");
    expect(facts.canRepair).toBe(false);
  });

  it("treats an unknown forwarder as not-ok rather than healthy", () => {
    const { forwarder, ...withoutForwarder } = healthyHooks;
    const facts = deriveConnectionState(withoutForwarder, { serverListening: true });
    expect(facts.forwarderKnown).toBe(false);
    expect(facts.forwarderOk).toBe(false);
    expect(facts.forwarderState).toBe("unavailable");
    expect(facts.healthy).toBe(false);
  });
});

describe("deriveConnectionState: listener availability vs recent-event history", () => {
  it("stays healthy while listening with no event yet, and marks the event row as waiting (non-failure)", () => {
    const facts = deriveConnectionState(healthyHooks, { serverListening: true, lastEventAt: null });
    expect(facts.listenerState).toBe("healthy");
    expect(facts.hasRecentEvent).toBe(false);
    expect(facts.recentEventState).toBe("waiting");
    expect(facts.recentEventState).not.toBe("unavailable");
    expect(facts.healthy).toBe(true);
  });

  it("does not treat a past event as proof the live listener is up", () => {
    const facts = deriveConnectionState(healthyHooks, { serverListening: false, lastEventAt: 1_000 });
    expect(facts.recentEventState).toBe("healthy");
    expect(facts.listenerState).toBe("unavailable");
    expect(facts.healthy).toBe(false);
  });

  it("is healthy end-to-end only when every live link is up", () => {
    const facts = deriveConnectionState(healthyHooks, { serverListening: true, lastEventAt: 2_000, port: 8765 });
    expect(facts.mode).toBe("workbench");
    expect(facts.healthy).toBe(true);
    expect(facts.canRepair).toBe(false);
    expect([facts.configState, facts.commandState, facts.forwarderState, facts.listenerState, facts.recentEventState])
      .toEqual(["healthy", "healthy", "healthy", "healthy", "healthy"]);
  });
});

describe("resolveRecheck: full-chain combine semantics", () => {
  const ok = (value: string) => ({ status: "fulfilled", value }) as PromiseFulfilledResult<string>;
  const fail = () => ({ status: "rejected", reason: new Error("boom") }) as PromiseRejectedResult;

  it("applies both and clears the error when both requests succeed", () => {
    expect(resolveRecheck(ok("S"), ok("C"))).toEqual({ status: "S", connection: "C", error: false });
  });

  it("keeps the error and does not apply hook status when the hook check fails", () => {
    expect(resolveRecheck(fail(), ok("C"))).toEqual({ status: undefined, connection: "C", error: true });
  });

  it("keeps the error and preserves previous connection when the connection check fails", () => {
    // A hook success paired with a connection failure must NOT clear the error,
    // and the failed connection is not applied (previous data is preserved).
    expect(resolveRecheck(ok("S"), fail())).toEqual({ status: "S", connection: undefined, error: true });
  });

  it("is an error and applies neither when both fail", () => {
    expect(resolveRecheck(fail(), fail())).toEqual({ status: undefined, connection: undefined, error: true });
  });
});
