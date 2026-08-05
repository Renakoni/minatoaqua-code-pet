import { describe, expect, it } from "vitest";
import { resolveCurrentPointerBase } from "../src/main/ccSwitchPointer";

describe("resolveCurrentPointerBase (cc-switch write path)", () => {
  it("treats a genuinely missing file (null) as a fresh, non-corrupt base", () => {
    expect(resolveCurrentPointerBase(null)).toEqual({ base: {}, corrupt: false });
  });

  it("treats an existing but empty/whitespace file as an anomalous (corrupt) read, not a fresh start", () => {
    // cc-switch never leaves settings.json empty; an empty read is a mid-write truncation
    // race, so it must go through the backup/warn path rather than silently reset config.
    expect(resolveCurrentPointerBase("")).toEqual({ base: {}, corrupt: true });
    expect(resolveCurrentPointerBase("   \n  ")).toEqual({ base: {}, corrupt: true });
  });

  it("preserves every existing field so writing the Claude pointer keeps sibling apps' pointers", () => {
    const raw = JSON.stringify({
      currentProviderClaude: "old-claude",
      currentProviderCodex: "cdx",
      currentProviderGemini: "gem",
      theme: "dark"
    });
    const { base, corrupt } = resolveCurrentPointerBase(raw);
    expect(corrupt).toBe(false);

    // Simulate the writeCurrentPointer merge: only the Claude pointer changes.
    base.currentProviderClaude = "new-claude";
    expect(base).toEqual({
      currentProviderClaude: "new-claude",
      currentProviderCodex: "cdx",
      currentProviderGemini: "gem",
      theme: "dark"
    });
  });

  it("flags corrupt / partially-written JSON so the caller backs it up instead of clobbering it", () => {
    // A truncated concurrent write.
    expect(resolveCurrentPointerBase('{"currentProviderClaude":"x","currentProvi')).toEqual({ base: {}, corrupt: true });
    // Not JSON at all.
    expect(resolveCurrentPointerBase("not json at all")).toEqual({ base: {}, corrupt: true });
  });

  it("flags valid JSON that is not an object (array / scalar) as corrupt rather than merging into it", () => {
    expect(resolveCurrentPointerBase('["a","b"]')).toEqual({ base: {}, corrupt: true });
    expect(resolveCurrentPointerBase("42")).toEqual({ base: {}, corrupt: true });
  });
});
