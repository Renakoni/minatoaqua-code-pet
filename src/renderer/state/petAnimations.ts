import { PetState } from "../../shared/events";
import { PetAnimationKey } from "../../shared/petAnimationKeys";
import {
  MINATO_AQUA_CATALOG,
  isCatalogAnimationKey,
  normalizeCatalogAnimationKey,
  type PetThemeCatalog,
  type PetThemeRoleDefaults
} from "../../shared/petThemeCatalog";

// Animation resolution for the floating pet window, kept pure so the
// action-mapping behavior (settings.stateAnimations) is unit-testable.
//
// The settings panel's Action Mapping picker stores canonical animation keys
// ("running" | "waiting_permission" | "done" → sprite key). The pet first maps
// its own state to a role, the active theme's catalog turns the role into
// that theme's default key, the user's mapping is applied on top, and a
// temporary preview (the panel's animation test) always wins over all of it.
// Every value is validated against the active catalog: a canonical key the
// theme does not provide falls back exactly like an unknown string.

export type { PetAnimationKey } from "../../shared/petAnimationKeys";

export const petStateRoles: Record<PetState, keyof PetThemeRoleDefaults> = {
  idle: "idle",
  running: "running",
  "permission-prompt": "waiting_permission",
  completed: "done",
  error: "error"
};

export interface ResolvedPetAnimation {
  animationKey: PetAnimationKey;
  /** Render key: previews stamp a nonce so re-triggering the same animation restarts it. */
  imageKey: string;
}

export function resolvePetAnimation(
  state: PetState,
  stateAnimations: Record<string, string> | null | undefined,
  previewAnimation: { key: string; nonce: number } | null | undefined,
  idleAnimation?: PetAnimationKey | null,
  catalog: PetThemeCatalog = MINATO_AQUA_CATALOG
): ResolvedPetAnimation {
  // While idling, a running idle-rotation sprite replaces the state's base
  // animation; the user's mapping is then applied on top of that base key,
  // mirroring the settings panel's preview semantics.
  const roleKey = catalog.roleDefaults[petStateRoles[state]];
  const stateKey = state === "idle" && idleAnimation && isCatalogAnimationKey(catalog, idleAnimation)
    ? idleAnimation
    : roleKey;
  // An invalid mapping value falls back to the state's default animation
  // rather than breaking the pet.
  const mappedKey = normalizeCatalogAnimationKey(catalog, stateAnimations?.[stateKey], stateKey);
  if (previewAnimation) {
    const animationKey = normalizeCatalogAnimationKey(catalog, previewAnimation.key, mappedKey);
    return { animationKey, imageKey: `${animationKey}:${previewAnimation.nonce}` };
  }
  return { animationKey: mappedKey, imageKey: mappedKey };
}
