import { PetState } from "../../shared/events";
import idleImage from "../assets/pet/idle.png";
import runningImage from "../assets/pet/running.webp";
import permissionPromptImage from "../assets/pet/permission-prompt.webp";
import completedImage from "../assets/pet/completed.webp";

const petImages: Record<PetState, string> = {
  idle: idleImage,
  running: runningImage,
  "permission-prompt": permissionPromptImage,
  completed: completedImage,
  error: runningImage
};

interface PetProps {
  state: PetState;
}

export function Pet({ state }: PetProps) {
  return (
    <div className={`pet pet-${state}`}>
      <img src={petImages[state]} alt={state} draggable={false} />
    </div>
  );
}
