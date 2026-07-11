import type { PetState } from "../../shared/events";
import { isPetAnimationKey, PET_ANIMATION_KEYS, type PetAnimationKey } from "../../../shared/petAnimationKeys";

export type { PetAnimationKey } from "../../../shared/petAnimationKeys";

// Labels are keyed by the shared canonical set, so adding a key there forces a
// label here and the options list can never drift from the source of truth.
const animationLabels: Record<PetAnimationKey, { labelKey: string; fallback: string }> = {
  idle: { labelKey: "animation.sprite.idle", fallback: "待机" },
  running: { labelKey: "animation.sprite.running", fallback: "运行中" },
  waiting_permission: { labelKey: "animation.sprite.permission", fallback: "权限请求" },
  done: { labelKey: "animation.sprite.done", fallback: "完成" },
  extra_action_5: { labelKey: "animation.sprite.extra5", fallback: "附加动作 5" },
  extra_action_7: { labelKey: "animation.sprite.extra7", fallback: "附加动作 7" },
  extra_action_8: { labelKey: "animation.sprite.extra8", fallback: "附加动作 8" },
  extra_action_9: { labelKey: "animation.sprite.extra9", fallback: "附加动作 9" },
  extra_action_aqua_bocchi: { labelKey: "animation.sprite.aquaBocchi", fallback: "Aqua 趴姿" },
  extra_action_aqua_pixel: { labelKey: "animation.sprite.aquaPixel", fallback: "Aqua 像素" }
};

export const petAnimationOptions: Array<{ key: PetAnimationKey; labelKey: string; fallback: string }> =
  PET_ANIMATION_KEYS.map(key => ({ key, ...animationLabels[key] }));

// Validation only: a canonical key passes through unchanged; anything else —
// including historical alias names — is invalid and yields the fallback.
export function normalizeAnimationKey(value: string | null | undefined, fallback: PetAnimationKey = "running"): PetAnimationKey {
  return isPetAnimationKey(value) ? value : fallback;
}

export function normalizeAnimationKeys(values: string[] | undefined): PetAnimationKey[] {
  // Validation only: invalid entries are dropped, never translated, and an
  // empty result stays empty. An empty pool means rotation cannot run — the
  // same rule for the settings UI, the panel preview, and the live pet.
  return [...new Set((values ?? []).filter(isPetAnimationKey))];
}

// Toggle a sprite in the idle pool. The pool never drops below one sprite:
// turning rotation off is the master switch's job, not an implicit side
// effect of emptying the pool. Returns the SAME array when the toggle is
// blocked so callers can skip saving.
export function toggleIdlePoolSprite(pool: PetAnimationKey[], key: PetAnimationKey): PetAnimationKey[] {
  if (pool.includes(key)) {
    return pool.length === 1 ? pool : pool.filter(sprite => sprite !== key);
  }
  return [...pool, key];
}

export function animationKeyForPetState(state: PetState): PetAnimationKey {
  if (state === "idle") return "idle";
  if (state === "waiting_permission") return "waiting_permission";
  if (state === "done") return "done";
  return "running";
}
