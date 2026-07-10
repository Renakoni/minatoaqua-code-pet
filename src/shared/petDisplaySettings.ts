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
const PET_BASE_WINDOW_HEIGHT = 300;
const PET_EXPANDED_WINDOW_HEIGHT = 470;
const PET_IMAGE_SIZE = 192;
const PET_BUBBLE_GAP = 12;

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

export function getPetBubbleBottom(scale: unknown): number {
  return Math.round(PET_IMAGE_SIZE * clampPetScale(scale) + PET_BUBBLE_GAP);
}

export function getPetWindowHeight(scale: unknown, expanded: boolean): number {
  const baseHeight = expanded ? PET_EXPANDED_WINDOW_HEIGHT : PET_BASE_WINDOW_HEIGHT;
  const scaleGrowth = (clampPetScale(scale) - DEFAULT_PET_SCALE) * PET_IMAGE_SIZE;
  return Math.round(baseHeight + scaleGrowth);
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
    migrated.permissionScale = normalize(finiteNumber(settings.permissionScale) ?? DEFAULT_PERMISSION_SCALE, 0.85, 1.25);
  }

  return migrated;
}
