import { PetEvent, PetState } from "../../shared/events";

export function nextPetState(current: PetState, event: PetEvent): PetState {
  if (event.event === "idle" || event.event === "completed") return event.event;
  if (current === "permission-prompt" && event.event === "running") return current;
  return event.event;
}
