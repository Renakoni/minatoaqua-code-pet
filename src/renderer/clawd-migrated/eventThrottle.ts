import type { CompanionEvent } from "../shared/events";

/**
 * When a burst of events is coalesced by the 100ms throttle, the pet's state must
 * reflect the LATEST meaningful event in the burst, not an arbitrary earlier one.
 *
 * The previous logic picked the first `tool_start` it found, so a burst that ended
 * in `done`/`error` left the pet showing "using tool" after the turn had finished.
 * It was also order-dependent (an in-place `reverse()` for the event list ran first
 * only when keepEventList was on), so the chosen state differed between the pet and
 * panel. Selecting by max timestamp is correct and order-independent.
 *
 * `tool_end` (ends a tool) and `git_operation` (a transient toast) don't drive pet
 * state, so they're excluded from the selection.
 */
export function pickThrottledStateEvent(pending: readonly CompanionEvent[]): CompanionEvent | null {
  let latest: CompanionEvent | null = null;
  for (const event of pending) {
    if (event.event === "tool_end" || event.event === "git_operation") continue;
    if (!latest || event.timestamp >= latest.timestamp) latest = event;
  }
  return latest;
}
