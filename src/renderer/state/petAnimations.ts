import { PetState } from "../../shared/events";

// Animation resolution for the floating pet window, kept pure so the
// action-mapping behavior (settings.stateAnimations) is unit-testable.
//
// The settings panel's Action Mapping picker stores canonical animation keys
// ("running" | "waiting_permission" | "done" → sprite key). The pet first maps
// its own state to that vocabulary, then applies the user's mapping, and a
// temporary preview (the panel's animation test) always wins over both.

export type PetAnimationKey =
  | "idle"
  | "running"
  | "waiting_permission"
  | "done"
  | "extra_action_5"
  | "extra_action_7"
  | "extra_action_8"
  | "extra_action_9"
  | "extra_action_aqua_bocchi"
  | "extra_action_aqua_pixel";

export const petStateAnimationKeys: Record<PetState, PetAnimationKey> = {
  idle: "idle",
  running: "running",
  "permission-prompt": "waiting_permission",
  completed: "done",
  error: "running"
};

const animationAliases: Record<string, PetAnimationKey> = {
  idle: "idle",
  running: "running",
  error: "running",
  waiting_permission: "waiting_permission",
  permission: "waiting_permission",
  permission_prompt: "waiting_permission",
  "permission-prompt": "waiting_permission",
  done: "done",
  completed: "done",
  complete: "done",
  extra_action_5: "extra_action_5",
  "extra-action-5": "extra_action_5",
  action_5: "extra_action_5",
  extra_action_7: "extra_action_7",
  "extra-action-7": "extra_action_7",
  action_7: "extra_action_7",
  extra_action_8: "extra_action_8",
  "extra-action-8": "extra_action_8",
  action_8: "extra_action_8",
  extra_action_9: "extra_action_9",
  "extra-action-9": "extra_action_9",
  action_9: "extra_action_9",
  extra_action_aqua_bocchi: "extra_action_aqua_bocchi",
  "extra-action-aqua-bocchi": "extra_action_aqua_bocchi",
  aqua_bocchi: "extra_action_aqua_bocchi",
  "aqua-bocchi": "extra_action_aqua_bocchi",
  extra_action_aqua_pixel: "extra_action_aqua_pixel",
  "extra-action-aqua-pixel": "extra_action_aqua_pixel",
  aqua_pixel: "extra_action_aqua_pixel",
  "aqua-pixel": "extra_action_aqua_pixel"
};

export function normalizeAnimationKey(value: string | null | undefined, fallback: PetAnimationKey): PetAnimationKey {
  if (!value) return fallback;
  return animationAliases[value] ?? fallback;
}

export interface ResolvedPetAnimation {
  animationKey: PetAnimationKey;
  /** Render key: previews stamp a nonce so re-triggering the same animation restarts it. */
  imageKey: string;
}

export function resolvePetAnimation(
  state: PetState,
  stateAnimations: Record<string, string> | null | undefined,
  previewAnimation: { key: string; nonce: number } | null | undefined
): ResolvedPetAnimation {
  const stateKey = petStateAnimationKeys[state];
  // An unknown or invalid mapping value falls back to the state's default
  // animation rather than breaking the pet.
  const mappedKey = normalizeAnimationKey(stateAnimations?.[stateKey], stateKey);
  if (previewAnimation) {
    const animationKey = normalizeAnimationKey(previewAnimation.key, mappedKey);
    return { animationKey, imageKey: `${animationKey}:${previewAnimation.nonce}` };
  }
  return { animationKey: mappedKey, imageKey: mappedKey };
}
