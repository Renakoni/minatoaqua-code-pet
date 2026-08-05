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
