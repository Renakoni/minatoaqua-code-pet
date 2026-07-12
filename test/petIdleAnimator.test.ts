import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDLE_SPRITE_GAP_MS,
  IDLE_SPRITE_SHOW_MS,
  planIdleAnimation,
  startIdleAnimator,
  type IdleAnimationPlan
} from "../src/renderer/state/petIdleAnimator";
import { catalogFromPetPack } from "../src/shared/petThemeCatalog";
import { makePackManifest } from "./helpers/packFixtures";

// Deterministic rng: yields the given values in order, then 0.
function rngSequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("planIdleAnimation: config → runnable plan", () => {
  const baseConfig = {
    enabled: true,
    selectedSprites: ["extra_action_5", "extra_action_9"],
    intervalMin: 10,
    intervalMax: 20,
    repeatMin: 1,
    repeatMax: 2
  };

  it("returns null when disabled or missing", () => {
    expect(planIdleAnimation(null)).toBeNull();
    expect(planIdleAnimation(undefined)).toBeNull();
    expect(planIdleAnimation({ ...baseConfig, enabled: false })).toBeNull();
  });

  it("builds the plan with seconds converted to milliseconds", () => {
    expect(planIdleAnimation(baseConfig)).toEqual({
      pool: ["extra_action_5", "extra_action_9"],
      intervalMinMs: 10_000,
      intervalMaxMs: 20_000,
      repeatMin: 1,
      repeatMax: 2
    });
  });

  it("drops non-canonical pool entries (canonical-only, no alias translation) and dedupes", () => {
    const plan = planIdleAnimation({
      ...baseConfig,
      selectedSprites: ["extra-action-5", "thinking", "extra_action_9", "extra_action_9", "bogus"]
    });
    expect(plan?.pool).toEqual(["extra_action_9"]);
  });

  it("disables rotation entirely when no valid sprite remains", () => {
    expect(planIdleAnimation({ ...baseConfig, selectedSprites: [] })).toBeNull();
    expect(planIdleAnimation({ ...baseConfig, selectedSprites: ["extra-action-5", "nope"] })).toBeNull();
  });

  it("keeps the interval ordered and the repeat counts sane", () => {
    const plan = planIdleAnimation({ ...baseConfig, intervalMin: 30, intervalMax: 10, repeatMin: 0, repeatMax: -2 });
    expect(plan).toMatchObject({ intervalMinMs: 30_000, intervalMaxMs: 30_000, repeatMin: 1, repeatMax: 1 });
  });

  it("scopes the pool to the active theme's catalog", () => {
    const packCatalog = catalogFromPetPack(makePackManifest());
    const mixed = { ...baseConfig, selectedSprites: ["idle", "jumping", "extra_action_5"] };
    // Under the pack catalog the built-in-only key drops out; under the
    // default built-in catalog the pack-only key drops out instead.
    expect(planIdleAnimation(mixed, packCatalog)?.pool).toEqual(["idle", "jumping"]);
    expect(planIdleAnimation(mixed)?.pool).toEqual(["idle", "extra_action_5"]);
    // A pool of purely foreign keys halts rotation, same as an empty pool.
    expect(planIdleAnimation({ ...baseConfig, selectedSprites: ["extra_action_5"] }, packCatalog)).toBeNull();
  });
});

describe("startIdleAnimator: panel-preview choreography", () => {
  const plan: IdleAnimationPlan = {
    pool: ["extra_action_5", "extra_action_9"],
    intervalMinMs: 10_000,
    intervalMaxMs: 20_000,
    repeatMin: 2,
    repeatMax: 2
  };

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("waits the random interval, then shows one sprite per batch with show/gap beats", () => {
    const seen: Array<string | null> = [];
    // rng: 0.5 → delay 15s; 0.9 → sprite index 1 (extra_action_9); span is 0 so
    // no repeat roll.
    const stop = startIdleAnimator(plan, key => seen.push(key), rngSequence([0.5, 0.9]));

    vi.advanceTimersByTime(14_999);
    expect(seen).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["extra_action_9"]);

    vi.advanceTimersByTime(IDLE_SPRITE_SHOW_MS);
    expect(seen).toEqual(["extra_action_9", null]);

    // Second repeat of the SAME sprite after the gap.
    vi.advanceTimersByTime(IDLE_SPRITE_GAP_MS);
    expect(seen).toEqual(["extra_action_9", null, "extra_action_9"]);

    vi.advanceTimersByTime(IDLE_SPRITE_SHOW_MS);
    expect(seen).toEqual(["extra_action_9", null, "extra_action_9", null]);

    stop();
  });

  it("schedules the next batch after a batch completes", () => {
    const seen: Array<string | null> = [];
    // Batch 1: delay 10s (rng 0), sprite 0; batch 2: delay 10s, sprite index 1.
    const singleRepeat: IdleAnimationPlan = { ...plan, repeatMin: 1, repeatMax: 1 };
    const stop = startIdleAnimator(singleRepeat, key => seen.push(key), rngSequence([0, 0, 0, 0.9]));

    vi.advanceTimersByTime(10_000 + IDLE_SPRITE_SHOW_MS);
    expect(seen).toEqual(["extra_action_5", null]);

    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual(["extra_action_5", null, "extra_action_9"]);

    stop();
  });

  it("rolls the repeat count within repeatMin..repeatMax", () => {
    const seen: Array<string | null> = [];
    const variable: IdleAnimationPlan = { ...plan, repeatMin: 1, repeatMax: 3 };
    // delay rng 0 → 10s; sprite rng 0 → extra_action_5; repeat rng 0.99 → 1 + floor(0.99*3) = 3.
    const stop = startIdleAnimator(variable, key => seen.push(key), rngSequence([0, 0, 0.99]));

    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(3 * IDLE_SPRITE_SHOW_MS + 2 * IDLE_SPRITE_GAP_MS);
    expect(seen).toEqual(["extra_action_5", null, "extra_action_5", null, "extra_action_5", null]);

    stop();
  });

  it("stop() cancels pending work and clears the current sprite", () => {
    const seen: Array<string | null> = [];
    const stop = startIdleAnimator(plan, key => seen.push(key), rngSequence([0, 0]));

    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual(["extra_action_5"]);

    stop();
    expect(seen).toEqual(["extra_action_5", null]);

    // Nothing fires after stop, even across a long horizon.
    vi.advanceTimersByTime(600_000);
    expect(seen).toEqual(["extra_action_5", null]);
  });
});
