export const DEFAULT_FEEDBACK_SCALE = 1;
export const DEFAULT_FEEDBACK_OPACITY = 1;
export const MIN_FEEDBACK_SCALE = 0.75;
export const MAX_FEEDBACK_SCALE = 1.35;
export const MIN_FEEDBACK_OPACITY = 0.5;
export const MAX_FEEDBACK_OPACITY = 1;

const LEGACY_FEEDBACK_BASE_SCALE = 0.75;
const SETTING_STEP = 0.05;
const DEFAULT_PET_SCALE = 1;
const DEFAULT_PET_OPACITY = 1;
const DEFAULT_PERMISSION_SCALE = 0.9;
const MIN_PET_SCALE = 0.7;
const MAX_PET_SCALE = 1.35;
const MIN_PET_OPACITY = 0.5;
const MAX_PET_OPACITY = 1;
const MIN_PERMISSION_SCALE = 0.85;
const MAX_PERMISSION_SCALE = 1.25;
const PET_BASE_WINDOW_HEIGHT = 300;
const PET_EXPANDED_WINDOW_HEIGHT = 470;
const PET_IMAGE_SIZE = 192;
const PET_BUBBLE_GAP = 12;
const PET_WINDOW_BASE_WIDTH = 260;
// Bubble content width at scale 1 (base window width minus the 12px side insets).
// The bubble renders at this fixed width, centered, and scales via transform;
// the window grows to fit so an upscaled bubble never clips. Keep in sync with
// --bubble-base-width and the .pet-bubble insets in styles.css.
const BUBBLE_BASE_WIDTH = 236;
const WINDOW_SIDE_MARGIN = 12;
// Generous max-height estimates for the tallest bubble in each mode, used to
// grow the window so an upscaled bubble keeps its headroom above the pet.
// Over-estimating only makes the transparent window slightly taller — harmless.
const STATUS_BUBBLE_MAX_HEIGHT = 130;
const PERMISSION_CARD_MAX_HEIGHT = 260;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalize(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return Number((Math.round(clamped / SETTING_STEP) * SETTING_STEP).toFixed(2));
}

export function clampPetScale(value: unknown): number {
  return Math.max(MIN_PET_SCALE, Math.min(MAX_PET_SCALE, finiteNumber(value) ?? DEFAULT_PET_SCALE));
}

export function clampPetOpacity(value: unknown): number {
  return Math.max(MIN_PET_OPACITY, Math.min(MAX_PET_OPACITY, finiteNumber(value) ?? DEFAULT_PET_OPACITY));
}

export function clampFeedbackScale(value: unknown): number {
  return Math.max(MIN_FEEDBACK_SCALE, Math.min(MAX_FEEDBACK_SCALE, finiteNumber(value) ?? DEFAULT_FEEDBACK_SCALE));
}

export function clampFeedbackOpacity(value: unknown): number {
  return Math.max(MIN_FEEDBACK_OPACITY, Math.min(MAX_FEEDBACK_OPACITY, finiteNumber(value) ?? DEFAULT_FEEDBACK_OPACITY));
}

export function clampPermissionScale(value: unknown): number {
  return Math.max(MIN_PERMISSION_SCALE, Math.min(MAX_PERMISSION_SCALE, finiteNumber(value) ?? DEFAULT_PERMISSION_SCALE));
}

export function getPetBubbleBottom(scale: unknown): number {
  return Math.round(PET_IMAGE_SIZE * clampPetScale(scale) + PET_BUBBLE_GAP);
}

// Window width grows so a scaled bubble stays fully visible. It tracks the wider
// of the two scalable bubbles (status vs permission) so the width stays stable
// when they swap in and out, and never shrinks below the base pet width.
export function getPetWindowWidth(feedbackScale: unknown, permissionScale: unknown): number {
  const maxBubbleScale = Math.max(clampFeedbackScale(feedbackScale), clampPermissionScale(permissionScale));
  const scaledBubble = BUBBLE_BASE_WIDTH * maxBubbleScale + WINDOW_SIDE_MARGIN * 2;
  return Math.max(PET_WINDOW_BASE_WIDTH, Math.round(scaledBubble));
}

// `bubbleScale` is the active bubble's scale (feedbackScale when collapsed,
// permissionScale when expanded). Defaults to 1 so existing 2-arg callers keep
// the pet-only sizing.
export function getPetWindowHeight(scale: unknown, expanded: boolean, bubbleScale: unknown = DEFAULT_FEEDBACK_SCALE): number {
  const baseHeight = expanded ? PET_EXPANDED_WINDOW_HEIGHT : PET_BASE_WINDOW_HEIGHT;
  const petGrowth = (clampPetScale(scale) - DEFAULT_PET_SCALE) * PET_IMAGE_SIZE;
  // Grow for an UPscaled bubble only — the base height already fits scale 1, and
  // a downscaled bubble needs no extra room. Use the estimate for the active mode.
  const bubbleMax = expanded ? PERMISSION_CARD_MAX_HEIGHT : STATUS_BUBBLE_MAX_HEIGHT;
  const clampedBubbleScale = expanded ? clampPermissionScale(bubbleScale) : clampFeedbackScale(bubbleScale);
  const bubbleGrowth = bubbleMax * Math.max(0, clampedBubbleScale - DEFAULT_FEEDBACK_SCALE);
  return Math.round(baseHeight + petGrowth + bubbleGrowth);
}

function average(values: Array<number | undefined>, fallback: number): number {
  const valid = values.filter((value): value is number => value !== undefined);
  return valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : fallback;
}

export function migratePetDisplaySettings(settings: Record<string, unknown>) {
  const unifiedScale = finiteNumber(settings.feedbackScale);
  const legacyScale = average([
    finiteNumber(settings.thoughtScale),
    finiteNumber(settings.cardScale)
  ].map(value => value === undefined ? undefined : value / LEGACY_FEEDBACK_BASE_SCALE), DEFAULT_FEEDBACK_SCALE);

  const unifiedOpacity = finiteNumber(settings.feedbackOpacity);
  const legacyOpacity = average([
    finiteNumber(settings.thoughtOpacity),
    finiteNumber(settings.cardOpacity)
  ], DEFAULT_FEEDBACK_OPACITY);

  const migrated: Record<string, number> = {
    feedbackScale: normalize(unifiedScale ?? legacyScale, MIN_FEEDBACK_SCALE, MAX_FEEDBACK_SCALE),
    feedbackOpacity: normalize(unifiedOpacity ?? legacyOpacity, MIN_FEEDBACK_OPACITY, MAX_FEEDBACK_OPACITY)
  };

  if ("petScale" in settings) {
    migrated.petScale = normalize(finiteNumber(settings.petScale) ?? DEFAULT_PET_SCALE, MIN_PET_SCALE, MAX_PET_SCALE);
  }
  if ("clawdOpacity" in settings) {
    migrated.clawdOpacity = normalize(finiteNumber(settings.clawdOpacity) ?? DEFAULT_PET_OPACITY, MIN_PET_OPACITY, MAX_PET_OPACITY);
  }
  if ("permissionScale" in settings) {
    migrated.permissionScale = normalize(finiteNumber(settings.permissionScale) ?? DEFAULT_PERMISSION_SCALE, MIN_PERMISSION_SCALE, MAX_PERMISSION_SCALE);
  }

  return migrated;
}
