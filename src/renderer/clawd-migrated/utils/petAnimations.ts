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

export function normalizeAnimationKeys(values: string[] | undefined, fallback: PetAnimationKey[] = ["idle"]): PetAnimationKey[] {
  // Invalid entries are dropped, not translated; an empty result falls back.
  const unique = [...new Set((values ?? []).filter(isPetAnimationKey))];
  return unique.length > 0 ? unique : fallback;
}

export function animationKeyForPetState(state: PetState): PetAnimationKey {
  if (state === "idle") return "idle";
  if (state === "waiting_permission") return "waiting_permission";
  if (state === "done") return "done";
  return "running";
}
