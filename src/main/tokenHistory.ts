// Durable per-day token history for the request heatmap.
//
// The heatmap is otherwise derived from a live scan of ~/.claude/projects, so a day's
// data vanishes once Claude Code rotates away that day's session logs. Past days are
// immutable, though: once a day is over and its logs were complete, re-scanning yields
// the same totals. So we persist each day's totals and merge every fresh scan into that
// history, keeping whichever entry has MORE requests per day — the live value while today
// still grows (and for a complete past day it equals what we stored), and the last
// complete value for a day whose source logs have since been deleted (a fresh scan would
// under-count or omit it). The stored history then survives log rotation.

export interface DatedTokenEntry {
  date: string;
  requestCount: number;
}

/** Merge freshly-scanned day totals into the persisted history (higher requestCount wins). */
export function mergeTokenDailyHistory<T extends DatedTokenEntry>(
  persisted: Record<string, T>,
  fresh: readonly T[]
): Record<string, T> {
  const out: Record<string, T> = { ...persisted };
  for (const entry of fresh) {
    if (!entry || typeof entry.date !== "string") continue;
    const existing = out[entry.date];
    if (!existing || (Number(entry.requestCount) || 0) >= (Number(existing.requestCount) || 0)) {
      out[entry.date] = entry;
    }
  }
  return out;
}

/** History map → date-ascending array (the shape the renderer's heatmap consumes). */
export function historyToSortedArray<T extends { date: string }>(history: Record<string, T>): T[] {
  return Object.values(history).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Parse a persisted history file back into a map. Tolerates the `{ version, days }`
 * envelope or a bare map, drops anything that isn't a YYYY-MM-DD → object entry, and
 * coerces requestCount so a corrupt field can't poison the merge.
 */
export function normalizeTokenDailyHistory(raw: unknown): Record<string, DatedTokenEntry & Record<string, unknown>> {
  const envelope = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const source = envelope && envelope.days && typeof envelope.days === "object" && !Array.isArray(envelope.days)
    ? envelope.days as Record<string, unknown>
    : envelope;
  const out: Record<string, DatedTokenEntry & Record<string, unknown>> = {};
  if (!source) return out;
  for (const [date, value] of Object.entries(source)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    out[date] = {
      ...entry,
      date,
      requestCount: typeof entry.requestCount === "number" && Number.isFinite(entry.requestCount) ? entry.requestCount : 0
    };
  }
  return out;
}
