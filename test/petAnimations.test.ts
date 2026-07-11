import { describe, it, expect } from "vitest";
import { resolvePetAnimation } from "../src/renderer/state/petAnimations";
import { PET_ANIMATION_KEYS } from "../src/shared/petAnimationKeys";

describe("resolvePetAnimation: action mapping reaches the real pet", () => {
  it("uses the built-in animation for each state when no mapping exists", () => {
    expect(resolvePetAnimation("idle", {}, null).animationKey).toBe("idle");
    expect(resolvePetAnimation("running", {}, null).animationKey).toBe("running");
    expect(resolvePetAnimation("permission-prompt", {}, null).animationKey).toBe("waiting_permission");
    expect(resolvePetAnimation("completed", {}, null).animationKey).toBe("done");
    expect(resolvePetAnimation("error", {}, null).animationKey).toBe("running");
  });

  it("applies the user's mapping for the running state", () => {
    // The regression this file exists for: a mapping saved in the panel must
    // change what the desktop pet shows, not just the panel's preview.
    const resolved = resolvePetAnimation("running", { running: "extra_action_5" }, null);
    expect(resolved.animationKey).toBe("extra_action_5");
    expect(resolved.imageKey).toBe("extra_action_5");
  });

  it("maps pet states onto the picker's vocabulary (completed→done, permission-prompt→waiting_permission)", () => {
    expect(resolvePetAnimation("completed", { done: "extra_action_aqua_bocchi" }, null).animationKey)
      .toBe("extra_action_aqua_bocchi");
    expect(resolvePetAnimation("permission-prompt", { waiting_permission: "extra_action_9" }, null).animationKey)
      .toBe("extra_action_9");
  });

  it("routes the error state through the running mapping, like the panel preview does", () => {
    expect(resolvePetAnimation("error", { running: "extra_action_7" }, null).animationKey).toBe("extra_action_7");
  });

  it("leaves unmapped states on their defaults", () => {
    expect(resolvePetAnimation("idle", { running: "extra_action_5" }, null).animationKey).toBe("idle");
    expect(resolvePetAnimation("completed", { running: "extra_action_5" }, null).animationKey).toBe("done");
  });

  it("accepts every canonical animation value in a mapping slot", () => {
    for (const key of PET_ANIMATION_KEYS) {
      expect(resolvePetAnimation("running", { running: key }, null).animationKey).toBe(key);
    }
  });

  it("rejects legacy alias names instead of translating them", () => {
    // Each case picks a state whose default differs from what alias
    // translation would have produced, so a translation bug cannot pass.
    expect(resolvePetAnimation("running", { running: "extra-action-5" }, null).animationKey).toBe("running");
    expect(resolvePetAnimation("completed", { done: "thinking" }, null).animationKey).toBe("done");
    expect(resolvePetAnimation("running", { running: "permission" }, null).animationKey).toBe("running");
    expect(resolvePetAnimation("permission-prompt", { waiting_permission: "aqua-pixel" }, null).animationKey)
      .toBe("waiting_permission");
    expect(resolvePetAnimation("completed", { done: "action_9" }, null).animationKey).toBe("done");
  });

  it("falls back to the state default when a mapping value is unknown", () => {
    expect(resolvePetAnimation("running", { running: "not-a-real-animation" }, null).animationKey).toBe("running");
  });

  it("tolerates a missing mapping object entirely", () => {
    expect(resolvePetAnimation("running", null, null).animationKey).toBe("running");
    expect(resolvePetAnimation("running", undefined, null).animationKey).toBe("running");
  });

  it("lets a preview override the mapping and stamps the nonce for restarts", () => {
    const resolved = resolvePetAnimation("running", { running: "extra_action_5" }, { key: "extra_action_9", nonce: 42 });
    expect(resolved.animationKey).toBe("extra_action_9");
    expect(resolved.imageKey).toBe("extra_action_9:42");
  });

  it("keeps the mapped animation when a preview key is invalid", () => {
    const resolved = resolvePetAnimation("running", { running: "extra_action_5" }, { key: "bogus", nonce: 7 });
    expect(resolved.animationKey).toBe("extra_action_5");
    expect(resolved.imageKey).toBe("extra_action_5:7");
  });
});
