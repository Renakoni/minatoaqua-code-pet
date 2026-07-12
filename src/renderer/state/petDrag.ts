import type { PetAnimationKey } from "../../shared/petAnimationKeys";
import { isCatalogAnimationKey, type PetThemeCatalog } from "../../shared/petThemeCatalog";

// Drag-direction locomotion, mirroring the reference codex-pet player: while
// the pet is dragged, each pointer sample whose screen delta reaches the
// threshold on either axis is accepted; the horizontal delta then picks
// running_right / running_left, and smaller horizontal motion holds the
// previous direction. The transient clears when the drag ends. Themes
// without locomotion rows (the built-in clips, sparse packs) keep their
// state animation while dragged.

/** Per-sample screen-pixel threshold used by the reference player. */
export const DRAG_SAMPLE_THRESHOLD_PX = 4;

export type DragDirection = "left" | "right";

export function nextDragDirection(current: DragDirection | null, deltaX: number, deltaY: number): DragDirection | null {
  if (Math.abs(deltaX) < DRAG_SAMPLE_THRESHOLD_PX && Math.abs(deltaY) < DRAG_SAMPLE_THRESHOLD_PX) return current;
  if (deltaX >= DRAG_SAMPLE_THRESHOLD_PX) return "right";
  if (deltaX <= -DRAG_SAMPLE_THRESHOLD_PX) return "left";
  return current;
}

/**
 * The interaction animation for the current drag direction, or null when not
 * dragging or when the active theme provides no row for that direction —
 * validated against the full catalog, since locomotion keys are exactly the
 * interaction-reserved keys the mappable subset excludes.
 */
export function dragAnimationForDirection(catalog: PetThemeCatalog, direction: DragDirection | null): PetAnimationKey | null {
  if (!direction) return null;
  const key: PetAnimationKey = direction === "right" ? "running_right" : "running_left";
  return isCatalogAnimationKey(catalog, key) ? key : null;
}
