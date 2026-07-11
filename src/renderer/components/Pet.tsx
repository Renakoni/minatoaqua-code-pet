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
import { PetAnimationKey, resolvePetAnimation } from "../state/petAnimations";

const animationImages: Record<PetAnimationKey, string> = {
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

interface PetProps {
  state: PetState;
  stateAnimations?: Record<string, string>;
  previewAnimation?: { key: string; nonce: number } | null;
  scale?: number;
  opacity?: number;
}

export function Pet({ state, stateAnimations, previewAnimation, scale = 1, opacity = 1 }: PetProps) {
  const { animationKey, imageKey } = resolvePetAnimation(state, stateAnimations, previewAnimation);

  return (
    <div className={`pet pet-${state}`} style={{ transform: `scale(${scale})`, opacity }}>
      <img key={imageKey} src={animationImages[animationKey]} alt={animationKey} draggable={false} />
    </div>
  );
}
