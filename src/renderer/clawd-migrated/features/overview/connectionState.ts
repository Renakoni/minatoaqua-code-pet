// Pure derivation for the Overview connection workbench. Kept out of the
// (@ts-nocheck) component so the delivery-chain model can be unit-tested.
//
// Each link in the chain is an INDEPENDENT fact: hook configuration, hook
// command/timeout correctness, the forwarder file, the local listener, and the
// recent-event history are reported separately. A listening server with no
// events yet is a healthy, non-failure state ("waiting for the first event") —
// a past event is never treated as proof the live link is currently up, and its
// absence never marks the link down. Repair/Remove are offered ONLY for the
// links Repair can actually fix (hook configuration / command), never for a
// forwarder-file or listener problem that Repair cannot resolve.
import type { HookStatus } from "../../../../shared/hooks";

export type ConnectionRowState = "healthy" | "waiting" | "partial" | "repair" | "unavailable";

// Which surface the connection area shows. These are mutually exclusive:
//  - loading:       the hook check has not resolved yet
//  - error:         the check failed, or the settings file is unreadable/corrupt
//  - notConfigured: no Clawd hooks are currently configured (prominent one-click Connect)
//  - workbench:     the factual delivery-chain rows (+ contextual actions)
export type ConnectionMode = "loading" | "error" | "notConfigured" | "workbench";

// Why the area is in `error` mode. These are materially different problems:
//  - check-failed:        a Recheck IPC request failed — retrying may fix it
//  - settings-unreadable: the settings file is present but corrupt/unreadable —
//                         retrying will not help; the file needs attention
export type ConnectionErrorReason = "check-failed" | "settings-unreadable";

// The derivation intentionally needs only a subset of the shared HookStatus; a
// Pick keeps it tied to the single source of truth so it cannot silently drift.
export type HookStatusInput = Pick<HookStatus, "hookCount" | "requiredCount" | "missingEvents" | "commandMatches" | "configReadError" | "forwarder">;

export interface ConnectionInput {
  serverListening?: boolean;
  lastEventAt?: number | null;
  port?: number | null;
}

export interface ConnectionFacts {
  mode: ConnectionMode;
  /** Present only in `error` mode; distinguishes a transient check failure from
      an unreadable settings file so the UI can give accurate remediation. */
  errorReason: ConnectionErrorReason | null;
  requiredCount: number;
  configuredCount: number;
  configComplete: boolean;
  commandOk: boolean;
  /** Whether the forwarder existence is actually known from the status payload. */
  forwarderKnown: boolean;
  forwarderOk: boolean;
  listening: boolean;
  hasRecentEvent: boolean;
  /** Overall health does NOT depend on a recent event, only on the live links. */
  healthy: boolean;
  /** Hook configuration or command needs fixing (the things Repair actually fixes). */
  needsHookRepair: boolean;
  /** Repair can run (a hook fix is needed AND the forwarder file is present). */
  canRepair: boolean;
  /** Forwarder file is known-missing — Repair would fail; needs its own guidance. */
  forwarderMissing: boolean;
  /** Local listener is down — a Repair cannot restart it; needs its own guidance. */
  listenerDown: boolean;
  configState: ConnectionRowState;
  commandState: ConnectionRowState;
  forwarderState: ConnectionRowState;
  listenerState: ConnectionRowState;
  recentEventState: ConnectionRowState;
}

const DEFAULT_REQUIRED_COUNT = 6;

export function deriveConnectionState(
  hookStatus: HookStatusInput | null,
  connection: ConnectionInput,
  checkError = false
): ConnectionFacts {
  const requiredCount = hookStatus?.requiredCount ?? DEFAULT_REQUIRED_COUNT;
  const configuredCount = hookStatus?.hookCount ?? 0;
  const configComplete = hookStatus ? hookStatus.missingEvents.length === 0 : false;
  const commandOk = hookStatus?.commandMatches === true;

  // Forwarder availability is a separate fact from hook config. Unknown (no
  // payload yet) is treated as NOT ok so it can never contribute to a false
  // "healthy" — once the status has loaded, the backend always reports it.
  const forwarderKnown = Boolean(hookStatus?.forwarder);
  const forwarderOk = hookStatus?.forwarder ? hookStatus.forwarder.exists : false;

  const listening = connection.serverListening === true;
  const hasRecentEvent = Boolean(connection.lastEventAt);

  // A past event is not proof the live link is healthy, so it is deliberately
  // excluded — health tracks the currently-verifiable links only.
  const healthy = configComplete && commandOk && forwarderOk && listening;

  const needsHookRepair = !configComplete || !commandOk;
  const forwarderMissing = forwarderKnown && !forwarderOk;
  const listenerDown = !listening;
  // Repair reinstalls the hook commands via the forwarder; it can only succeed
  // when the forwarder file exists, and only helps a hook config/command problem.
  const canRepair = needsHookRepair && forwarderOk;

  let mode: ConnectionMode;
  let errorReason: ConnectionErrorReason | null = null;
  if (checkError) {
    // A Recheck request failed — retrying may fix it.
    mode = "error";
    errorReason = "check-failed";
  } else if (hookStatus === null) {
    mode = "loading";
  } else if (hookStatus.configReadError) {
    // The settings file is present but unreadable/corrupt; retrying won't help,
    // so this is a distinct, factual error rather than a transient refresh failure.
    mode = "error";
    errorReason = "settings-unreadable";
  } else if (configuredCount === 0) {
    // No Clawd hooks are currently configured. This is intentionally NOT a claim
    // about historical first use — it also covers hooks removed or wiped
    // externally — but it always warrants the prominent one-click Connect.
    mode = "notConfigured";
  } else {
    mode = "workbench";
  }

  return {
    mode,
    errorReason,
    requiredCount,
    configuredCount,
    configComplete,
    commandOk,
    forwarderKnown,
    forwarderOk,
    listening,
    hasRecentEvent,
    healthy,
    needsHookRepair,
    canRepair,
    forwarderMissing,
    listenerDown,
    configState: configComplete ? "healthy" : "partial",
    commandState: commandOk ? "healthy" : "repair",
    forwarderState: forwarderOk ? "healthy" : "unavailable",
    listenerState: listening ? "healthy" : "unavailable",
    recentEventState: hasRecentEvent ? "healthy" : "waiting"
  };
}

export interface RecheckOutcome<Status, Connection> {
  /** Fresh hook status to apply, if that request succeeded. */
  status?: Status;
  /** Fresh connection status to apply, if that request succeeded. */
  connection?: Connection;
  /** The recheck is an error unless BOTH required requests succeeded. */
  error: boolean;
}

// Combine the two settled results of a full-chain Recheck (hook status +
// connection status). Only fulfilled values are applied, so a failed request
// preserves the previous data; the error is set unless BOTH succeed — a hook
// success paired with a connection failure is still an error, and a connection
// failure alone never clears the error.
export function resolveRecheck<Status, Connection>(
  hookResult: PromiseSettledResult<Status>,
  connResult: PromiseSettledResult<Connection>
): RecheckOutcome<Status, Connection> {
  return {
    status: hookResult.status === "fulfilled" ? hookResult.value : undefined,
    connection: connResult.status === "fulfilled" ? connResult.value : undefined,
    error: !(hookResult.status === "fulfilled" && connResult.status === "fulfilled")
  };
}

