import { describe, expect, it } from "vitest";
import { planCurrentPointerWrite, resolveCurrentPointerBase, shouldUpdatePointerAfterRename } from "../src/main/ccSwitchPointer";

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

describe("planCurrentPointerWrite (write vs refuse)", () => {
  it("creates a fresh file for a genuinely missing settings file", () => {
    const plan = planCurrentPointerWrite(null, "prov-1");
    expect(plan.action).toBe("write");
    expect(JSON.parse(plan.action === "write" ? plan.content : "{}")).toEqual({ currentProviderClaude: "prov-1" });
  });

  it("merges into a valid object, keeping every sibling field", () => {
    const raw = JSON.stringify({ currentProviderClaude: "old", currentProviderCodex: "cdx", currentProviderGemini: "gem", theme: "dark" });
    const plan = planCurrentPointerWrite(raw, "new");
    expect(plan.action).toBe("write");
    expect(JSON.parse(plan.action === "write" ? plan.content : "{}")).toEqual({
      currentProviderClaude: "new",
      currentProviderCodex: "cdx",
      currentProviderGemini: "gem",
      theme: "dark"
    });
  });

  it("REFUSES (never rebuilds from {}) when the existing file is empty, partial, corrupt or non-object", () => {
    // The empty-file race: rebuilding from {} here would drop sibling pointers.
    expect(planCurrentPointerWrite("", "x").action).toBe("refuse");
    expect(planCurrentPointerWrite("   \n ", "x").action).toBe("refuse");
    expect(planCurrentPointerWrite('{"currentProviderClaude":"x","currentProvi', "x").action).toBe("refuse");
    expect(planCurrentPointerWrite("not json", "x").action).toBe("refuse");
    expect(planCurrentPointerWrite('["a"]', "x").action).toBe("refuse");
  });
});

describe("shouldUpdatePointerAfterRename", () => {
  it("updates the pointer when the renamed provider was the current one", () => {
    expect(shouldUpdatePointerAfterRename("old", "new", "old")).toBe(true);
  });

  it("skips when the renamed provider was not current (so an unreadable file isn't touched needlessly)", () => {
    expect(shouldUpdatePointerAfterRename("old", "new", "other")).toBe(false);
    expect(shouldUpdatePointerAfterRename("old", "new", "")).toBe(false);
  });

  it("skips when it isn't actually a rename", () => {
    expect(shouldUpdatePointerAfterRename("same", "same", "same")).toBe(false);
  });

  it("keys off the current id (SSOT), so an unreadable settings file still triggers the update when db is_current matched", () => {
    // currentBefore is getCurrentCcSwitchProviderId(), which falls back to db is_current
    // when the settings pointer is unreadable — so a rename of the current provider is
    // detected even though the old settings-pointer guard would have read {} and missed it.
    expect(shouldUpdatePointerAfterRename("old", "new", "old")).toBe(true);
  });
});
