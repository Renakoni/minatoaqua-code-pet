import { PetAnimationKey } from "../../shared/petAnimationKeys";
import { MINATO_AQUA_CATALOG, normalizeCatalogAnimationKeys, type PetThemeCatalog } from "../../shared/petThemeCatalog";

// Random idle-animation rotation for the floating pet window, mirroring the
// settings panel's preview scheduler: wait a uniform random interval, pick one
// random sprite from the pool, show it for a fixed beat, repeat it a random
// number of times with a fixed gap, then schedule the next batch.
//
// The scheduler is React-free with injectable timers/rng so the choreography
// is unit-testable with fake timers.

export const IDLE_SPRITE_SHOW_MS = 2500;
export const IDLE_SPRITE_GAP_MS = 1500;

export interface IdleAnimationConfig {
  enabled?: boolean;
  selectedSprites?: string[];
  intervalMin?: number;
  intervalMax?: number;
  repeatMin?: number;
  repeatMax?: number;
}

export interface IdleAnimationPlan {
  pool: PetAnimationKey[];
  intervalMinMs: number;
  intervalMaxMs: number;
  repeatMin: number;
  repeatMax: number;
}

function toSeconds(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function toRepeat(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

// Turn the persisted config into a runnable plan, or null when rotation should
// not run at all. Pool entries are validated against the active theme's
// catalog: invalid or theme-foreign values are dropped, and an empty pool
// disables rotation rather than inventing sprites.
export function planIdleAnimation(
  config: IdleAnimationConfig | null | undefined,
  catalog: PetThemeCatalog = MINATO_AQUA_CATALOG
): IdleAnimationPlan | null {
  if (!config?.enabled) return null;
  const pool = normalizeCatalogAnimationKeys(catalog, config.selectedSprites);
  if (pool.length === 0) return null;
  const intervalMin = toSeconds(config.intervalMin, 20);
  const intervalMax = Math.max(intervalMin, toSeconds(config.intervalMax, intervalMin));
  const repeatMin = toRepeat(config.repeatMin, 1);
  const repeatMax = Math.max(repeatMin, toRepeat(config.repeatMax, repeatMin));
  return {
    pool,
    intervalMinMs: intervalMin * 1000,
    intervalMaxMs: intervalMax * 1000,
    repeatMin,
    repeatMax
  };
}

// Start the rotation. onAnimation receives the sprite to show, or null to
// return to the plain idle pose. Returns a stop function that cancels any
// pending timer and clears the current sprite.
export function startIdleAnimator(
  plan: IdleAnimationPlan,
  onAnimation: (key: PetAnimationKey | null) => void,
  rng: () => number = Math.random
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function schedule(fn: () => void, delayMs: number) {
    timer = setTimeout(() => { if (!stopped) fn(); }, delayMs);
  }

  function scheduleNext() {
    schedule(playBatch, plan.intervalMinMs + rng() * (plan.intervalMaxMs - plan.intervalMinMs));
  }

  function playBatch() {
    // One sprite per batch, repeated a random number of times — matching the
    // panel preview's rhythm exactly (show beat, then gap between repeats).
    const sprite = plan.pool[Math.floor(rng() * plan.pool.length)];
    const span = plan.repeatMax - plan.repeatMin;
    const repeats = plan.repeatMin + (span > 0 ? Math.floor(rng() * (span + 1)) : 0);
    let count = 0;
    function show() {
      onAnimation(sprite);
      schedule(() => {
        onAnimation(null);
        count++;
        if (count < repeats) schedule(show, IDLE_SPRITE_GAP_MS);
        else scheduleNext();
      }, IDLE_SPRITE_SHOW_MS);
    }
    show();
  }

  scheduleNext();

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    onAnimation(null);
  };
}
