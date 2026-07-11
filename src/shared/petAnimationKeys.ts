// Canonical animation keys for the pet sprite library — the single source of
// truth for what may be persisted in settings (action mappings and the idle
// pool). Legacy or alternative names are intentionally NOT supported: an
// unknown value is invalid and callers fall back, never translated.
export const PET_ANIMATION_KEYS = [
  "idle",
  "running",
  "waiting_permission",
  "done",
  "extra_action_5",
  "extra_action_7",
  "extra_action_8",
  "extra_action_9",
  "extra_action_aqua_bocchi",
  "extra_action_aqua_pixel"
] as const;

export type PetAnimationKey = (typeof PET_ANIMATION_KEYS)[number];

export function isPetAnimationKey(value: unknown): value is PetAnimationKey {
  return typeof value === "string" && (PET_ANIMATION_KEYS as readonly string[]).includes(value);
}
