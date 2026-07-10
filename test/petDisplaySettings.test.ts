import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDBACK_OPACITY,
  DEFAULT_FEEDBACK_SCALE,
  clampFeedbackOpacity,
  clampFeedbackScale,
  clampPermissionScale,
  clampPetOpacity,
  clampPetScale,
  getPetBubbleBottom,
  getPetWindowHeight,
  getPetWindowWidth,
  migratePetDisplaySettings
} from "../src/shared/petDisplaySettings";

describe("migratePetDisplaySettings", () => {
  it("keeps valid unified settings", () => {
    expect(migratePetDisplaySettings({ feedbackScale: 1.2, feedbackOpacity: 0.8 })).toEqual({
      feedbackScale: 1.2,
      feedbackOpacity: 0.8
    });
  });

  it("derives unified values from legacy thought and card settings", () => {
    expect(migratePetDisplaySettings({
      thoughtScale: 0.9,
      cardScale: 0.6,
      bubbleScale: 2,
      thoughtOpacity: 0.9,
      cardOpacity: 0.7,
      bubbleOpacity: 0.45
    })).toEqual({
      feedbackScale: 1,
      feedbackOpacity: 0.8
    });
  });

  it("maps legacy defaults to the new defaults", () => {
    expect(migratePetDisplaySettings({
      thoughtScale: 0.75,
      cardScale: 0.75,
      thoughtOpacity: 1,
      cardOpacity: 1
    })).toEqual({
      feedbackScale: DEFAULT_FEEDBACK_SCALE,
      feedbackOpacity: DEFAULT_FEEDBACK_OPACITY
    });
  });

  it("uses safe defaults for missing or invalid values", () => {
    expect(migratePetDisplaySettings({ feedbackScale: "large", feedbackOpacity: null })).toEqual({
      feedbackScale: DEFAULT_FEEDBACK_SCALE,
      feedbackOpacity: DEFAULT_FEEDBACK_OPACITY
    });
  });

  it("clamps persisted unified values to supported UI ranges", () => {
    expect(migratePetDisplaySettings({ feedbackScale: 9, feedbackOpacity: 0.1 })).toEqual({
      feedbackScale: 1.35,
      feedbackOpacity: 0.5
    });
  });

  it("normalizes legacy display values to the new control ranges", () => {
    expect(migratePetDisplaySettings({ petScale: 1.45, clawdOpacity: 0.45, permissionScale: 2 })).toEqual({
      feedbackScale: DEFAULT_FEEDBACK_SCALE,
      feedbackOpacity: DEFAULT_FEEDBACK_OPACITY,
      petScale: 1.35,
      clawdOpacity: 0.5,
      permissionScale: 1.25
    });
  });

  it("keeps bubbles above the scaled pet without scaling the bubble itself", () => {
    expect(getPetBubbleBottom(0.7)).toBe(146);
    expect(getPetBubbleBottom(1)).toBe(204);
    expect(getPetBubbleBottom(1.35)).toBe(271);
  });

  it("grows the bottom-anchored pet window when the pet is larger than default", () => {
    expect(getPetWindowHeight(0.7, false)).toBe(242);
    expect(getPetWindowHeight(1, false)).toBe(300);
    expect(getPetWindowHeight(1.35, false)).toBe(367);
    expect(getPetWindowHeight(0.7, true)).toBe(412);
    expect(getPetWindowHeight(1.35, true)).toBe(537);
  });

  it("clamps externally supplied pet display values before rendering", () => {
    expect(clampPetScale(2)).toBe(1.35);
    expect(clampPetOpacity(1.4)).toBe(1);
    expect(clampPetOpacity(0)).toBe(0.5);
  });
});

describe("bubble scale window sizing", () => {
  it("clamps feedback and permission controls to their UI ranges", () => {
    expect(clampFeedbackScale(9)).toBe(1.35);
    expect(clampFeedbackScale(0)).toBe(0.75);
    expect(clampFeedbackOpacity(2)).toBe(1);
    expect(clampFeedbackOpacity(0)).toBe(0.5);
    expect(clampPermissionScale(9)).toBe(1.25);
    expect(clampPermissionScale(0)).toBe(0.85);
    expect(clampPermissionScale(undefined)).toBe(0.9);
  });

  it("widens the window to fit the wider of the two scaled bubbles, never below base", () => {
    expect(getPetWindowWidth(1, 0.9)).toBe(260); // defaults → base width
    expect(getPetWindowWidth(0.75, 0.85)).toBe(260); // downscaled → still base
    expect(getPetWindowWidth(1.35, 1)).toBe(343); // 236*1.35 + 24
    expect(getPetWindowWidth(1, 1.25)).toBe(319); // 236*1.25 + 24
    expect(getPetWindowWidth(1.35, 1.25)).toBe(343); // wider (feedback) wins
  });

  it("grows the window height for an upscaled bubble, on top of the pet growth", () => {
    expect(getPetWindowHeight(1, false, 1)).toBe(300); // no bubble growth at scale 1
    expect(getPetWindowHeight(1, false, 0.75)).toBe(300); // downscaled needs no room
    expect(getPetWindowHeight(1, false, 1.35)).toBe(346); // 300 + 130*0.35
    expect(getPetWindowHeight(1, true, 1.25)).toBe(535); // 470 + 260*0.25
    expect(getPetWindowHeight(1.35, false, 1.35)).toBe(413); // pet + bubble growth stack
  });
});
