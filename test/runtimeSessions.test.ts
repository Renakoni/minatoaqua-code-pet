import { describe, expect, it } from "vitest";
import { MAX_DAILY_SESSION_IDS, noteDailySession } from "../src/main/runtimeSessions";

describe("noteDailySession (distinct-session-per-day counting)", () => {
  it("counts a brand-new session id and records it", () => {
    const seen: string[] = [];
    expect(noteDailySession(seen, "sess-A")).toBe(true);
    expect(seen).toEqual(["sess-A"]);
  });

  it("counts two concurrent sessions as two — the core fix (SessionStart-only counting gave 1)", () => {
    const seen: string[] = [];
    expect(noteDailySession(seen, "sess-A")).toBe(true);
    expect(noteDailySession(seen, "sess-B")).toBe(true);
    expect(seen.length).toBe(2); // dailyStats[day].sessions is set to this
  });

  it("does not double-count a session on its later events (any event marks it, once)", () => {
    const seen = ["sess-A"];
    expect(noteDailySession(seen, "sess-A")).toBe(false);
    expect(seen).toEqual(["sess-A"]);
  });

  it("ignores a missing/empty id — internal pet events carry none and must not inflate the count", () => {
    const seen: string[] = [];
    expect(noteDailySession(seen, undefined)).toBe(false);
    expect(noteDailySession(seen, null)).toBe(false);
    expect(noteDailySession(seen, "")).toBe(false);
    expect(seen).toEqual([]);
  });

  it("stops counting past the per-day cap so a pathological day can't grow unbounded", () => {
    const seen = Array.from({ length: MAX_DAILY_SESSION_IDS }, (_, index) => `s${index}`);
    expect(noteDailySession(seen, "one-more")).toBe(false);
    expect(seen.length).toBe(MAX_DAILY_SESSION_IDS);
  });
});
