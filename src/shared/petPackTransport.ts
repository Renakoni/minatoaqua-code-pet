/**
 * IPC transport shapes for the pet-pack import pipeline, shared by the main
 * process, preload surface, and both renderer entries.
 *
 * Import is stateless and two-phase because only the renderer can decode
 * WebP pixels (Chromium is this app's single image decoder):
 *
 *   1. inspect(zipPath)  — main validates the package and returns the staged
 *      manifest, derived geometry, the sheet bytes as a data URL, and the
 *      SHA-256 of the entire archive;
 *   2. the renderer decodes the sheet and runs scanRowFrameCounts();
 *   3. install(zipPath, rowFrameCounts, packageSha256) — main revalidates
 *      the same zip, rejects it if the archive changed in any way since
 *      inspection (sheet OR manifest), and persists the pack under
 *      userData/pets/<id>/.
 *
 * Trust model: the digest binds the submitted frame counts to an unchanged
 * package — it does NOT itself prove that decoding succeeded. The import UI
 * must never call install after a failed decode/scan; main additionally
 * refuses any install without the digest of a completed inspection.
 */

import type { CodexPetManifest, PetPackManifest, PetPackProblem, SheetGeometry } from "./petPack";

export interface StagedPetPack {
  manifest: CodexPetManifest;
  geometry: SheetGeometry;
  sheetMime: "image/webp" | "image/png";
  /** Lowercase hex SHA-256 of the raw zip bytes; required again by install. */
  packageSha256: string;
  /** data: URL of the spritesheet, ready for Image/createImageBitmap. */
  sheetDataUrl: string;
}

export type PetPackInspectResult =
  | { ok: true; staged: StagedPetPack }
  | { ok: false; problems: PetPackProblem[] };

export type PetPackInstallResult =
  | { ok: true; pack: PetPackManifest; warning?: string }
  | { ok: false; problems: PetPackProblem[] };

export interface PetPackRemoveResult {
  ok: boolean;
  error?: string;
}
