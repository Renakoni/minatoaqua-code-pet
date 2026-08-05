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

/**
 * Whether renaming `previousId` -> `newId` should move the device pointer to `newId`.
 *
 * True only for an actual rename where the renamed provider was the effective current
 * one. `currentProviderId` must be the SSOT current id (device pointer, else db
 * is_current) captured BEFORE the rename — deriving "was it current?" from the settings
 * file *after* the rename misses the case where that file was unreadable from the start
 * (it reads back as {} and never matches previousId), which would silently skip the
 * pointer update, backup and warning.
 */
export function shouldUpdatePointerAfterRename(previousId: string, newId: string, currentProviderId: string): boolean {
  return newId !== previousId && currentProviderId === previousId;
}
