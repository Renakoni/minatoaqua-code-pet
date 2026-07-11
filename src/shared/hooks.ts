// Single source of truth for the hook IPC contract, shared by the Electron main
// process (which produces these), the browser compatibility mock, and the
// renderer components (which consume them). Keeping one definition here prevents
// the three hand-written copies from drifting — especially since several
// renderer files use // @ts-nocheck and would not catch a mismatch.

export interface HookStatus {
  /** Config complete AND every command current. */
  installed: boolean;
  /** The Claude settings file exists on disk. */
  configExists: boolean;
  /** The settings file exists but could not be read/parsed. */
  configReadError: boolean;
  /** How many required events have a Clawd command configured. */
  hookCount: number;
  requiredCount: number;
  /** Required events with no Clawd command. */
  missingEvents: string[];
  /** Every configured event has exactly one current, canonical command. */
  commandMatches: boolean;
  settingsPath: string;
  forwarder: { expectedPath: string; exists: boolean };
}

// Category for a structured hook-operation failure. The renderer maps this to a
// localized message and only reveals a concrete path when hiding is disabled.
export type HookOperationErrorKind = "forwarder-missing";

export interface HookOperationResult {
  success: boolean;
  error?: string;
  errorKind?: HookOperationErrorKind;
  /** Present (unredacted) with forwarder-missing so the renderer can decide. */
  forwarderPath?: string;
  /** Number of hooks removed (removeHooks only). */
  removed?: number;
  status: HookStatus;
}

// How a failed hook operation should be displayed. This is the authoritative
// privacy decision for hook-operation errors: when hiding is enabled an unknown
// failure resolves to `hidden` (a generic localized message with NO raw text),
// rather than trying to scrub arbitrary paths out of free-form error strings.
export type HookErrorDisplay =
  | { kind: "forwarder-missing"; path?: string }
  | { kind: "hidden" }
  | { kind: "raw"; text: string };

export function describeHookOperationError(
  result: Pick<HookOperationResult, "error" | "errorKind" | "forwarderPath"> | undefined,
  hide: boolean
): HookErrorDisplay {
  if (result?.errorKind === "forwarder-missing") {
    // Only reveal the concrete forwarder path when hiding is off.
    return hide || !result.forwarderPath ? { kind: "forwarder-missing" } : { kind: "forwarder-missing", path: result.forwarderPath };
  }
  // Unknown failure text may embed absolute paths from any root; when hiding,
  // never display it — show a generic category instead.
  if (hide) return { kind: "hidden" };
  return { kind: "raw", text: result?.error ?? "" };
}
