import { PetState } from "../../shared/events";
import { isPetAnimationKey, PetAnimationKey } from "../../shared/petAnimationKeys";

// Animation resolution for the floating pet window, kept pure so the
// action-mapping behavior (settings.stateAnimations) is unit-testable.
//
// The settings panel's Action Mapping picker stores canonical animation keys
// ("running" | "waiting_permission" | "done" → sprite key). The pet first maps
// its own state to that vocabulary, then applies the user's mapping, and a
// temporary preview (the panel's animation test) always wins over both.

export type { PetAnimationKey } from "../../shared/petAnimationKeys";

export const petStateAnimationKeys: Record<PetState, PetAnimationKey> = {
  idle: "idle",
  running: "running",
  "permission-prompt": "waiting_permission",
  completed: "done",
  error: "running"
};

// Validation only: a canonical key passes through unchanged; anything else —
// including historical alias names — is invalid and yields the fallback.
export function normalizeAnimationKey(value: string | null | undefined, fallback: PetAnimationKey): PetAnimationKey {
  return isPetAnimationKey(value) ? value : fallback;
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
  // An invalid mapping value falls back to the state's default animation
  // rather than breaking the pet.
  const mappedKey = normalizeAnimationKey(stateAnimations?.[stateKey], stateKey);
  if (previewAnimation) {
    const animationKey = normalizeAnimationKey(previewAnimation.key, mappedKey);
    return { animationKey, imageKey: `${animationKey}:${previewAnimation.nonce}` };
  }
  return { animationKey: mappedKey, imageKey: mappedKey };
}
