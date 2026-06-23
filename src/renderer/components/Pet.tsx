import { PetState } from "../../shared/events";
import completedImage from "../assets/pet/completed.webp";
import extraAction5Image from "../assets/pet/extra-action-5.webp";
import extraAction7Image from "../assets/pet/extra-action-7.webp";
import extraAction8Image from "../assets/pet/extra-action-8.webp";
import extraAction9Image from "../assets/pet/extra-action-9.webp";
import extraActionAquaBocchiImage from "../assets/pet/extra-action-aqua-bocchi.png";
import extraActionAquaPixelImage from "../assets/pet/extra-action-aqua-pixel.gif";
import idleImage from "../assets/pet/idle.png";
import permissionPromptImage from "../assets/pet/permission-prompt.webp";
import runningImage from "../assets/pet/running.webp";

type AnimationKey =
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

const animationImages: Record<AnimationKey, string> = {
  idle: idleImage,
  running: runningImage,
  waiting_permission: permissionPromptImage,
  done: completedImage,
  extra_action_5: extraAction5Image,
  extra_action_7: extraAction7Image,
  extra_action_8: extraAction8Image,
  extra_action_9: extraAction9Image,
  extra_action_aqua_bocchi: extraActionAquaBocchiImage,
  extra_action_aqua_pixel: extraActionAquaPixelImage
};

const stateAnimationKeys: Record<PetState, AnimationKey> = {
  idle: "idle",
  running: "running",
  "permission-prompt": "waiting_permission",
  completed: "done",
  error: "running"
};

const animationAliases: Record<string, AnimationKey> = {
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

interface PetProps {
  state: PetState;
  previewAnimation?: { key: string; nonce: number } | null;
}

function normalizeAnimationKey(value: string | null | undefined, fallback: AnimationKey): AnimationKey {
  if (!value) return fallback;
  return animationAliases[value] ?? fallback;
}

export function Pet({ state, previewAnimation }: PetProps) {
  const stateKey = stateAnimationKeys[state];
  const animationKey = previewAnimation ? normalizeAnimationKey(previewAnimation.key, stateKey) : stateKey;
  const imageKey = previewAnimation ? `${animationKey}:${previewAnimation.nonce}` : animationKey;

  return (
    <div className={`pet pet-${state}`}>
      <img key={imageKey} src={animationImages[animationKey]} alt={animationKey} draggable={false} />
    </div>
  );
}
