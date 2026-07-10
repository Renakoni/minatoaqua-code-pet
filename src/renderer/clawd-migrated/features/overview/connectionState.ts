// Pure derivation for the Overview connection workbench. Kept out of the
// (@ts-nocheck) component so the delivery-chain model can be unit-tested.
//
// The whole point of this model is that each link in the chain is an INDEPENDENT
// fact: hook configuration, hook command correctness, the forwarder file, the
// local listener, and the recent-event history are reported separately. In
// particular, a listening server with no events yet is a healthy, non-failure
// state ("waiting for the first event") — a past event is never treated as proof
// that the live link is currently up, and the absence of one never marks it down.

export type ConnectionRowState = "healthy" | "waiting" | "partial" | "repair" | "unavailable";

export interface HookStatusInput {
  installed: boolean;
  configExists: boolean;
  hookCount: number;
  requiredCount: number;
  missingEvents: string[];
  commandMatches: boolean;
  forwarder?: { expectedPath: string; exists: boolean };
}

export interface ConnectionInput {
  serverListening?: boolean;
  lastEventAt?: number | null;
  port?: number | null;
}

export interface ConnectionFacts {
  /** Status has not loaded yet (checkHooks in flight). */
  loading: boolean;
  /** Hooks have never been configured — genuine first-run onboarding. */
  firstRun: boolean;
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
  configState: ConnectionRowState;
  commandState: ConnectionRowState;
  forwarderState: ConnectionRowState;
  listenerState: ConnectionRowState;
  recentEventState: ConnectionRowState;
}

const DEFAULT_REQUIRED_COUNT = 6;

export function deriveConnectionState(
  hookStatus: HookStatusInput | null,
  connection: ConnectionInput
): ConnectionFacts {
  const loading = hookStatus === null;
  const requiredCount = hookStatus?.requiredCount ?? DEFAULT_REQUIRED_COUNT;
  const configuredCount = hookStatus?.hookCount ?? 0;
  const configComplete = hookStatus ? hookStatus.missingEvents.length === 0 : false;
  const commandOk = hookStatus?.commandMatches === true;

  // Forwarder availability is a separate fact from hook config. When the status
  // payload has not reported it yet, treat it as ok so we never flag a healthy
  // config as broken before the file check has loaded.
  const forwarderKnown = Boolean(hookStatus?.forwarder);
  const forwarderOk = hookStatus?.forwarder ? hookStatus.forwarder.exists : true;

  const listening = connection.serverListening === true;
  const hasRecentEvent = Boolean(connection.lastEventAt);

  // A past event is not proof the live link is healthy, so it is deliberately
  // excluded here — health tracks the currently-verifiable links only.
  const healthy = configComplete && commandOk && forwarderOk && listening;

  // First-run onboarding is only for a config that was never installed; an
  // installed-but-broken/partial config keeps the workbench (with Repair).
  const firstRun = hookStatus !== null && configuredCount === 0;

  return {
    loading,
    firstRun,
    requiredCount,
    configuredCount,
    configComplete,
    commandOk,
    forwarderKnown,
    forwarderOk,
    listening,
    hasRecentEvent,
    healthy,
    configState: configComplete ? "healthy" : "partial",
    commandState: commandOk ? "healthy" : "repair",
    forwarderState: forwarderOk ? "healthy" : "unavailable",
    listenerState: listening ? "healthy" : "unavailable",
    recentEventState: hasRecentEvent ? "healthy" : "waiting"
  };
}
