export type JsonObject = Record<string, unknown>;

export interface PointerBase {
  /** The object to merge the new pointer into — existing fields are preserved. */
  base: JsonObject;
  /**
   * True when the existing file could not be read back as a JSON object — corrupt,
   * a partial concurrent write, a non-object/array, OR present-but-empty. The caller
   * should back the original up and warn before overwriting so it never *silently*
   * drops sibling fields such as other apps' pointers (currentProviderCodex /
   * currentProviderGemini) or unrelated cc-switch settings.
   */
  corrupt: boolean;
}

/**
 * Decide the base object for a cc-switch settings write on the WRITE path.
 *
 * A resilient read that collapses every failure to {} is fine when *reading* a
 * pointer (a missing pointer just falls back to the db is_current flag), but on the
 * write path it is dangerous: rewriting the whole file from {} erases every other
 * key. This keeps the cases distinct — a genuinely absent file (fresh start) vs an
 * unreadable existing one (corrupt) — so the caller preserves the original before
 * healing rather than reducing it to a single pointer without warning.
 *
 * Only a truly missing file (`raw === null`) is a fresh start. An existing but empty
 * file is treated as corrupt: cc-switch never leaves settings.json empty, so an empty
 * read is an anomaly (e.g. observing the file mid-write, right after a truncate) and
 * must not be mistaken for a clean slate to overwrite.
 */
export function resolveCurrentPointerBase(raw: string | null): PointerBase {
  if (raw === null) return { base: {}, corrupt: false }; // missing file → genuinely new
  if (!raw.trim()) return { base: {}, corrupt: true };   // exists but empty → anomalous read
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { base: parsed as JsonObject, corrupt: false }; // preserve every field
    }
    return { base: {}, corrupt: true }; // valid JSON but not an object (e.g. an array)
  } catch {
    return { base: {}, corrupt: true }; // corrupt or partially-written JSON
  }
}

export type PointerWritePlan =
  | { action: "write"; content: string }
  | { action: "refuse" };

/**
 * Decide what to do with the shared settings file when setting the Claude pointer.
 *
 * - Readable object (or a genuinely missing file → {}): merge the pointer in, keeping
 *   every existing field, and return the serialized content to write.
 * - Unreadable (empty/corrupt/partial/non-object): REFUSE. Rebuilding from {} would
 *   drop sibling pointers (currentProviderCodex / currentProviderGemini) and could
 *   clobber a concurrent cc-switch write. The caller preserves the file (backup) and
 *   relies on the db is_current flag, which is authoritative when the pointer is
 *   unreadable — so the switch/rename still takes effect without destroying data.
 */
export function planCurrentPointerWrite(raw: string | null, id: string): PointerWritePlan {
  const { base, corrupt } = resolveCurrentPointerBase(raw);
  if (corrupt) return { action: "refuse" };
  base.currentProviderClaude = id;
  return { action: "write", content: JSON.stringify(base, null, 2) };
}

export type PointerRenamePlan =
  | { action: "write"; content: string }
  | { action: "skip" }
  | { action: "refuse" };

/**
 * Decide how to migrate the device pointer after renaming `previousId` -> `newId`.
 *
 * Reads the LIVE settings content (post-rename) so an external switch — e.g. cc-switch
 * itself moving the current provider between our db snapshot and this write — is
 * respected instead of clobbered:
 *   - pointer === previousId: migrate it to newId.
 *   - pointer names another provider: skip; that switch is newer, don't overwrite it.
 *   - pointer absent, but the db said previousId was current: migrate (write newId).
 *   - file unreadable: refuse (caller backs up + warns) only when the db said previousId
 *     was current; otherwise skip and leave the file untouched.
 *
 * `wasDbCurrent` is whether previousId held the db is_current flag BEFORE the rename —
 * a fallback used only when the live pointer can't be read. The live pointer, when
 * readable, is authoritative (it reflects the newest switch).
 */
export function planPointerRename(raw: string | null, previousId: string, newId: string, wasDbCurrent: boolean): PointerRenamePlan {
  if (newId === previousId) return { action: "skip" };
  const { base, corrupt } = resolveCurrentPointerBase(raw);
  if (corrupt) return wasDbCurrent ? { action: "refuse" } : { action: "skip" };
  const pointer = base.currentProviderClaude;
  const pointsToOther = typeof pointer === "string" && pointer !== "" && pointer !== previousId;
  if (pointsToOther) return { action: "skip" }; // a newer external switch — never clobber it
  if (pointer === previousId || wasDbCurrent) {
    base.currentProviderClaude = newId;
    return { action: "write", content: JSON.stringify(base, null, 2) };
  }
  return { action: "skip" };
}
