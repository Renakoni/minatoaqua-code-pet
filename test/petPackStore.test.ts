import { strToU8, zipSync, type Zippable } from "fflate";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PACK_MANIFEST_FILE,
  inspectPetPackZip,
  installPetPack,
  listPetPacks,
  removePetPack,
  resolvePetAssetPath
} from "../src/main/petPackStore";
import { makeDecodablePng, makePngHeader, makeVp8lHeader } from "./helpers/imageFixtures";

const SAMPLE_MANIFEST = {
  id: "yuexinmiao",
  displayName: "月薪喵",
  description: "A small white office cat mascot adapted as a Codex pet.",
  spritesheetPath: "spritesheet.webp"
};
// Visible frames per row in the verified sample sheet.
const FULL_COUNTS = [6, 8, 7, 5, 8, 8, 8, 8, 6];

let workDir: string;
let petsDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "pet-pack-test-"));
  petsDir = join(workDir, "pets");
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function writeZip(name: string, entries: Zippable): string {
  const zipPath = join(workDir, name);
  writeFileSync(zipPath, zipSync(entries));
  return zipPath;
}

/** Header-only WebP pack — valid for staging, not decodable pixels. */
function sampleWebpZip(overrides: Partial<typeof SAMPLE_MANIFEST> = {}): string {
  return writeZip("sample.codex-pet.zip", {
    "pet.json": strToU8(JSON.stringify({ ...SAMPLE_MANIFEST, ...overrides })),
    "spritesheet.webp": makeVp8lHeader(1536, 1872)
  });
}

/** Genuinely decodable PNG pack for install flows. */
function bobaPngZip(displayName = "Boba", alpha = 255): string {
  return writeZip("boba.codex-pet.zip", {
    "pet.json": strToU8(JSON.stringify({ id: "boba", displayName, spritesheetPath: "sheet.png" })),
    "sheet.png": makeDecodablePng(256, 288, alpha)
  });
}

function inspectedDigest(zipPath: string): string {
  const inspected = inspectPetPackZip(zipPath);
  if (!inspected.ok) throw new Error("fixture zip must inspect cleanly");
  return inspected.staged.packageSha256;
}

describe("inspectPetPackZip", () => {
  it("stages a valid flat package with derived geometry, digest, and a data URL", () => {
    const result = inspectPetPackZip(sampleWebpZip());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.staged.manifest.id).toBe("yuexinmiao");
    expect(result.staged.geometry).toEqual({ width: 1536, height: 1872, columns: 8, rows: 9, cellWidth: 192, cellHeight: 208 });
    expect(result.staged.sheetMime).toBe("image/webp");
    expect(result.staged.packageSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.staged.sheetDataUrl.startsWith("data:image/webp;base64,")).toBe(true);
  });

  it("accepts packages nested one folder deep and PNG sheets", () => {
    const zipPath = writeZip("nested.zip", {
      "boba/pet.json": strToU8(JSON.stringify({ id: "boba", displayName: "Boba", spritesheetPath: "sheet.png" })),
      "boba/sheet.png": makeDecodablePng(256, 288)
    });
    const result = inspectPetPackZip(zipPath);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.staged.sheetMime).toBe("image/png");
    expect(result.staged.geometry.cellWidth).toBe(32);
  });

  it("reports a missing or oversized pet.json as a manifest problem", () => {
    const noManifest = inspectPetPackZip(writeZip("no-manifest.zip", { "spritesheet.webp": makeVp8lHeader(1536, 1872) }));
    expect(noManifest.ok).toBe(false);
    if (!noManifest.ok) expect(noManifest.problems[0].field).toBe("pet.json");

    // Above the 64KB manifest cap the entry is never even inflated.
    const oversized = inspectPetPackZip(writeZip("big-manifest.zip", {
      "pet.json": strToU8(JSON.stringify(SAMPLE_MANIFEST) + " ".repeat(70 * 1024)),
      "spritesheet.webp": makeVp8lHeader(1536, 1872)
    }));
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.problems[0].field).toBe("pet.json");
  });

  it("rejects unreadable JSON, missing sheets, non-image sheets, and bad geometry", () => {
    const badJson = inspectPetPackZip(writeZip("bad-json.zip", {
      "pet.json": strToU8("{ not json"),
      "spritesheet.webp": makeVp8lHeader(1536, 1872)
    }));
    expect(badJson.ok).toBe(false);

    const missingSheet = inspectPetPackZip(writeZip("no-sheet.zip", { "pet.json": strToU8(JSON.stringify(SAMPLE_MANIFEST)) }));
    expect(missingSheet.ok).toBe(false);
    if (!missingSheet.ok) expect(missingSheet.problems[0].field).toBe("spritesheetPath");

    const garbageSheet = inspectPetPackZip(writeZip("garbage-sheet.zip", {
      "pet.json": strToU8(JSON.stringify(SAMPLE_MANIFEST)),
      "spritesheet.webp": strToU8("not an image at all, just text bytes")
    }));
    expect(garbageSheet.ok).toBe(false);
    if (!garbageSheet.ok) expect(garbageSheet.problems[0].field).toBe("spritesheet");

    const badGrid = inspectPetPackZip(writeZip("bad-grid.zip", {
      "pet.json": strToU8(JSON.stringify(SAMPLE_MANIFEST)),
      "spritesheet.webp": makeVp8lHeader(1537, 1872)
    }));
    expect(badGrid.ok).toBe(false);
    if (!badGrid.ok) expect(badGrid.problems[0].field).toBe("width");
  });

  it("rejects packages with more entries than the cap", () => {
    const entries: Zippable = { "pet.json": strToU8(JSON.stringify(SAMPLE_MANIFEST)) };
    for (let i = 0; i < 70; i++) entries[`extra-${i}.png`] = makePngHeader(8, 9);
    const result = inspectPetPackZip(writeZip("many-entries.zip", entries));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0].message).toContain("64");
  });

  it("rejects an aggregate decompression bomb whose entries are individually within limits", () => {
    // Five 7MB images: each far below the 25MB per-entry cap, 35MB combined.
    const entries: Zippable = {
      "pet.json": strToU8(JSON.stringify(SAMPLE_MANIFEST)),
      "spritesheet.webp": makeVp8lHeader(1536, 1872)
    };
    for (let i = 0; i < 5; i++) {
      const filler = new Uint8Array(7 * 1024 * 1024);
      filler.set(makePngHeader(8, 9));
      entries[`filler-${i}.png`] = filler;
    }
    const result = inspectPetPackZip(writeZip("aggregate-bomb.zip", entries));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0].field).toBe("zip");
      expect(result.problems[0].message).toContain("decompress");
    }
  });

  it("reports unreadable files and non-zip content as package problems", () => {
    expect(inspectPetPackZip(join(workDir, "does-not-exist.zip")).ok).toBe(false);
    const notZip = join(workDir, "not-a.zip");
    writeFileSync(notZip, "plain text");
    expect(inspectPetPackZip(notZip).ok).toBe(false);
  });
});

describe("installPetPack", () => {
  it("persists the pack directory with the genuine sheet bytes and the app manifest", () => {
    const zipPath = bobaPngZip();
    const result = installPetPack(zipPath, FULL_COUNTS, inspectedDigest(zipPath), petsDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pack.id).toBe("boba");
    expect(result.pack.animations).toHaveLength(9);
    expect(result.pack.roleDefaults.done).toBe("jumping");
    expect(result.pack.roleDefaults.error).toBe("failed");

    const packDir = join(petsDir, "boba");
    expect(new Uint8Array(readFileSync(join(packDir, "sheet.png")))).toEqual(makeDecodablePng(256, 288));
    const persisted = JSON.parse(readFileSync(join(packDir, PACK_MANIFEST_FILE), "utf8"));
    expect(persisted).toEqual(result.pack);
  });

  it("requires the digest from a completed inspection", () => {
    // A header-valid but undecodable sheet can never reach install through
    // the real flow: the renderer scan fails, so no digest+counts pair
    // exists. At the store level that gate is the digest requirement.
    const result = installPetPack(sampleWebpZip(), FULL_COUNTS, "", petsDir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0].message).toContain("inspection");

    const madeUp = installPetPack(sampleWebpZip(), FULL_COUNTS, "0".repeat(64), petsDir);
    expect(madeUp.ok).toBe(false);
    if (!madeUp.ok) expect(madeUp.problems[0].message).toContain("changed after inspection");
  });

  it("rejects a package that was replaced between inspect and install", () => {
    const zipPath = bobaPngZip();
    const digest = inspectedDigest(zipPath);

    // Same path, different sheet pixels.
    writeFileSync(zipPath, zipSync({
      "pet.json": strToU8(JSON.stringify({ id: "boba", displayName: "Boba", spritesheetPath: "sheet.png" })),
      "sheet.png": makeDecodablePng(256, 288, 128)
    }));

    const stale = installPetPack(zipPath, FULL_COUNTS, digest, petsDir);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.problems[0].message).toContain("changed after inspection");

    // Re-inspecting the replaced package yields a working digest again.
    const fresh = installPetPack(zipPath, FULL_COUNTS, inspectedDigest(zipPath), petsDir);
    expect(fresh.ok).toBe(true);
  });

  it("rejects a manifest-only replacement even when the sheet bytes are identical", () => {
    const zipPath = bobaPngZip();
    const digest = inspectedDigest(zipPath);

    // Same sheet bytes, different identity in pet.json.
    writeFileSync(zipPath, zipSync({
      "pet.json": strToU8(JSON.stringify({ id: "impostor", displayName: "Impostor", spritesheetPath: "sheet.png" })),
      "sheet.png": makeDecodablePng(256, 288)
    }));

    const swapped = installPetPack(zipPath, FULL_COUNTS, digest, petsDir);
    expect(swapped.ok).toBe(false);
    if (!swapped.ok) {
      expect(swapped.problems[0].field).toBe("package");
      expect(swapped.problems[0].message).toContain("changed after inspection");
    }
    expect(existsSync(join(petsDir, "impostor"))).toBe(false);
  });

  it("refuses to overwrite an installed pack unless asked to", () => {
    const zipPath = bobaPngZip();
    expect(installPetPack(zipPath, FULL_COUNTS, inspectedDigest(zipPath), petsDir).ok).toBe(true);

    const duplicate = installPetPack(zipPath, FULL_COUNTS, inspectedDigest(zipPath), petsDir);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.problems[0].field).toBe("id");

    const v2 = bobaPngZip("Boba v2");
    const overwrite = installPetPack(v2, FULL_COUNTS, inspectedDigest(v2), petsDir, { overwrite: true });
    expect(overwrite.ok).toBe(true);
    const persisted = JSON.parse(readFileSync(join(petsDir, "boba", PACK_MANIFEST_FILE), "utf8"));
    expect(persisted.displayName).toBe("Boba v2");
  });

  it("propagates domain validation, e.g. an empty idle row", () => {
    const zipPath = bobaPngZip();
    const result = installPetPack(zipPath, [0, 8, 8, 8, 8, 8, 8, 8, 8], inspectedDigest(zipPath), petsDir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0].field).toBe("idle");
  });
});

describe("listPetPacks", () => {
  it("lists installed packs and skips corrupt or mismatched directories", () => {
    expect(listPetPacks(petsDir)).toEqual([]);
    const zipPath = bobaPngZip();
    installPetPack(zipPath, FULL_COUNTS, inspectedDigest(zipPath), petsDir);

    mkdirSync(join(petsDir, "broken"), { recursive: true });
    writeFileSync(join(petsDir, "broken", PACK_MANIFEST_FILE), "not json");
    mkdirSync(join(petsDir, "mismatched"), { recursive: true });
    writeFileSync(join(petsDir, "mismatched", PACK_MANIFEST_FILE), JSON.stringify({ formatVersion: 1, sourceFormat: "codex-pet-v1", id: "other", displayName: "x", spritesheetFile: "s.webp", animations: [], sheet: {}, roleDefaults: {} }));

    const packs = listPetPacks(petsDir);
    expect(packs).toHaveLength(1);
    expect(packs[0].id).toBe("boba");
  });
});

describe("removePetPack", () => {
  it("removes an installed pack exactly once", () => {
    const zipPath = bobaPngZip();
    installPetPack(zipPath, FULL_COUNTS, inspectedDigest(zipPath), petsDir);
    expect(removePetPack("boba", petsDir)).toEqual({ ok: true });
    expect(existsSync(join(petsDir, "boba"))).toBe(false);
    expect(removePetPack("boba", petsDir).ok).toBe(false);
  });

  it("rejects ids that are not exact sanitized slugs", () => {
    expect(removePetPack("../evil", petsDir).ok).toBe(false);
    expect(removePetPack("BOBA", petsDir).ok).toBe(false);
    expect(removePetPack("con", petsDir).ok).toBe(false);
  });
});

describe("resolvePetAssetPath", () => {
  it("resolves valid pack asset URLs inside the pets directory", () => {
    const resolved = resolvePetAssetPath("pet-asset://packs/boba/sheet.png", petsDir);
    expect(resolved).not.toBeNull();
    expect(resolved?.startsWith(petsDir + sep)).toBe(true);
    expect(resolved?.endsWith(join("boba", "sheet.png"))).toBe(true);
  });

  it("rejects every malformed or escaping URL shape", () => {
    for (const url of [
      "pet-asset://other/boba/sheet.webp", // wrong host
      "pet-asset://packs/boba", // missing file
      "pet-asset://packs/boba/a/b.webp", // extra segment
      "pet-asset://packs/%2e%2e/sheet.webp", // encoded traversal id
      "pet-asset://packs/boba/..%2fsecret.webp", // encoded traversal file
      "pet-asset://packs/%zz/sheet.webp", // malformed percent-encoding (id)
      "pet-asset://packs/boba/%e0%a4%a.webp", // malformed percent-encoding (file)
      "pet-asset://packs/boba/script.js", // foreign extension
      "pet-asset://packs/UPPER/sheet.webp", // non-slug id
      "https://packs/boba/sheet.webp", // wrong scheme
      "not a url"
    ]) {
      expect(resolvePetAssetPath(url, petsDir), url).toBeNull();
    }
  });
});
