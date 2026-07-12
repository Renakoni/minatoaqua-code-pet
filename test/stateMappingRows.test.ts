import { describe, expect, it } from "vitest";
import { resolvePetAnimation } from "../src/renderer/state/petAnimations";
import { displayedMappingKey, mappingRowMeta, stateMappingRowsFor } from "../src/renderer/clawd-migrated/utils/stateMappingRows";
import { MINATO_AQUA_CATALOG, catalogFromPetPack } from "../src/shared/petThemeCatalog";
import { makePackManifest } from "./helpers/packFixtures";

const packCatalog = catalogFromPetPack(makePackManifest());
const passthroughT = (key: string, fallback?: string) => fallback ?? key;

describe("stateMappingRowsFor", () => {
  it("keeps the built-in theme at three rows, with errors merged into running", () => {
    const rows = stateMappingRowsFor(MINATO_AQUA_CATALOG);
    expect(rows.map(row => row.key)).toEqual(["running", "waiting_permission", "done"]);
    const runningRow = rows[0];
    expect(runningRow.roles).toEqual(["running", "error"]);
    // The merged meta still tells the user this slot covers errors.
    expect(mappingRowMeta(runningRow, passthroughT)).toContain("错误");
  });

  it("gives a full imported catalog a dedicated error row mapped to failed", () => {
    const rows = stateMappingRowsFor(packCatalog);
    expect(rows.map(row => row.key)).toEqual(["running", "waiting_permission", "jumping", "failed"]);
    const errorRow = rows[3];
    expect(errorRow.roles).toEqual(["error"]);
    expect(errorRow.labelKey).toBe("animation.state.error");
    // Running no longer claims to include errors for this theme.
    expect(mappingRowMeta(rows[0], passthroughT)).not.toContain("错误");
  });

  it("deduplicates sparse-pack role defaults so no two rows share a key", () => {
    // Only idle, running-right, and waving rows exist: waiting_permission and
    // error both collapse onto idle.
    const sparseCatalog = catalogFromPetPack(makePackManifest([4, 6, 0, 5, 0, 0, 0, 0, 0]));
    const rows = stateMappingRowsFor(sparseCatalog);
    const keys = rows.map(row => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["running_right", "idle", "waving"]);
    const idleRow = rows.find(row => row.key === "idle");
    expect(idleRow?.roles).toEqual(["waiting_permission", "error"]);
  });
});

describe("displayedMappingKey agrees with runtime resolution", () => {
  it("shows the row default for stale built-in mappings under an imported theme", () => {
    // A stored profile can reference an animation the (re)imported pack no
    // longer provides, or a built-in key that never existed in the pack.
    const stale = { running: "extra_action_5", jumping: "extra_action_9" };
    const rows = stateMappingRowsFor(packCatalog);
    for (const row of rows) {
      expect(displayedMappingKey(packCatalog, stale, row)).toBe(row.key);
    }
  });

  it("matches resolvePetAnimation for every state, valid or stale", () => {
    const cases = [
      { catalog: MINATO_AQUA_CATALOG, mappings: { running: "extra_action_7", done: "extra_action_9" } },
      { catalog: MINATO_AQUA_CATALOG, mappings: { running: "jumping" } }, // foreign canonical key
      { catalog: packCatalog, mappings: { running: "waving", jumping: "review", failed: "waving" } },
      { catalog: packCatalog, mappings: { running: "extra_action_5", failed: "bogus" } } // stale + junk
    ] as const;

    const stateForRole = { running: "running", waiting_permission: "permission-prompt", done: "completed", error: "error" } as const;

    for (const { catalog, mappings } of cases) {
      for (const row of stateMappingRowsFor(catalog)) {
        for (const role of row.roles) {
          const state = stateForRole[role as keyof typeof stateForRole];
          const displayed = displayedMappingKey(catalog, mappings, row);
          const resolved = resolvePetAnimation(state, mappings, null, null, catalog).animationKey;
          expect(displayed, `${catalog.themeId} ${role}`).toBe(resolved);
        }
      }
    }
  });
});
