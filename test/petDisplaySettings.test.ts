import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDBACK_OPACITY,
  DEFAULT_FEEDBACK_SCALE,
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
});
