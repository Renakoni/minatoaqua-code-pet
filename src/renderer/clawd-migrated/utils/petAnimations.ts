import type { PetState } from "../../shared/events";

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

export const petAnimationOptions: Array<{ key: PetAnimationKey; labelKey: string; fallback: string }> = [
  { key: "idle", labelKey: "animation.sprite.idle", fallback: "待机" },
  { key: "running", labelKey: "animation.sprite.running", fallback: "运行中" },
  { key: "waiting_permission", labelKey: "animation.sprite.permission", fallback: "权限请求" },
  { key: "done", labelKey: "animation.sprite.done", fallback: "完成" },
  { key: "extra_action_5", labelKey: "animation.sprite.extra5", fallback: "附加动作 5" },
  { key: "extra_action_7", labelKey: "animation.sprite.extra7", fallback: "附加动作 7" },
  { key: "extra_action_8", labelKey: "animation.sprite.extra8", fallback: "附加动作 8" },
  { key: "extra_action_9", labelKey: "animation.sprite.extra9", fallback: "附加动作 9" },
  { key: "extra_action_aqua_bocchi", labelKey: "animation.sprite.aquaBocchi", fallback: "Aqua 趴姿" },
  { key: "extra_action_aqua_pixel", labelKey: "animation.sprite.aquaPixel", fallback: "Aqua 像素" }
];

const legacyAnimationKeyMap: Record<string, PetAnimationKey> = {
  idle: "idle",
  running: "running",
  thinking: "running",
  tool_read: "running",
  tool_edit: "running",
  tool_bash: "running",
  tool_search: "running",
  tool_mcp: "running",
  skill: "running",
  task: "running",
  agent: "running",
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

export function normalizeAnimationKey(value: string | null | undefined, fallback: PetAnimationKey = "running"): PetAnimationKey {
  if (!value) return fallback;
  return legacyAnimationKeyMap[value] ?? fallback;
}

export function normalizeAnimationKeys(values: string[] | undefined, fallback: PetAnimationKey[] = ["idle"]): PetAnimationKey[] {
  const keys = (values ?? []).map(value => normalizeAnimationKey(value, "idle"));
  const unique = [...new Set(keys)];
  return unique.length > 0 ? unique : fallback;
}

export function animationKeyForPetState(state: PetState): PetAnimationKey {
  if (state === "idle") return "idle";
  if (state === "waiting_permission") return "waiting_permission";
  if (state === "done") return "done";
  return "running";
}
