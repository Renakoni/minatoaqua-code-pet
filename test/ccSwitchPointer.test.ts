import { describe, expect, it } from "vitest";
import { planCurrentPointerWrite, planPointerRename, resolveCurrentPointerBase } from "../src/main/ccSwitchPointer";

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

describe("planPointerRename (external-switch aware)", () => {
  const A = "prov-A";
  const A2 = "prov-A2";
  const B = "prov-B";

  it("migrates the pointer when the live pointer still names the renamed provider (keeps siblings)", () => {
    const plan = planPointerRename(JSON.stringify({ currentProviderClaude: A, currentProviderCodex: "cdx" }), A, A2, true);
    expect(plan.action).toBe("write");
    expect(JSON.parse(plan.action === "write" ? plan.content : "{}")).toEqual({ currentProviderClaude: A2, currentProviderCodex: "cdx" });
  });

  it("skips when the live pointer already names another provider — a newer external switch is never clobbered", () => {
    // Even though the db said A was current before the rename, the live pointer is B now.
    expect(planPointerRename(JSON.stringify({ currentProviderClaude: B }), A, A2, true).action).toBe("skip");
  });

  it("uses the db fallback when the pointer is absent: migrate iff the provider was db-current", () => {
    expect(planPointerRename(JSON.stringify({ theme: "dark" }), A, A2, true).action).toBe("write");
    expect(planPointerRename(JSON.stringify({ theme: "dark" }), A, A2, false).action).toBe("skip");
  });

  it("refuses (so the caller backs up + warns) only when unreadable AND the provider was db-current", () => {
    expect(planPointerRename("", A, A2, true).action).toBe("refuse");
    expect(planPointerRename("garbage{", A, A2, true).action).toBe("refuse");
    expect(planPointerRename("", A, A2, false).action).toBe("skip"); // not current → leave the unreadable file alone
  });

  it("skips a no-op (not actually a rename)", () => {
    expect(planPointerRename(JSON.stringify({ currentProviderClaude: A }), A, A, true).action).toBe("skip");
  });
});
