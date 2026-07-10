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

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalize(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return Number((Math.round(clamped / SETTING_STEP) * SETTING_STEP).toFixed(2));
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
    migrated.petScale = normalize(finiteNumber(settings.petScale) ?? DEFAULT_PET_SCALE, 0.7, 1.35);
  }
  if ("clawdOpacity" in settings) {
    migrated.clawdOpacity = normalize(finiteNumber(settings.clawdOpacity) ?? DEFAULT_PET_OPACITY, 0.5, 1);
  }
  if ("permissionScale" in settings) {
    migrated.permissionScale = normalize(finiteNumber(settings.permissionScale) ?? DEFAULT_PERMISSION_SCALE, 0.85, 1.25);
  }

  return migrated;
}
