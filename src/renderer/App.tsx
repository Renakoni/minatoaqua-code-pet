import { useEffect, useRef, useState } from "react";
import { createPetEvent, PetEvent, PetState } from "../shared/events";
import { Panel } from "./components/Panel";
import { PermissionCard, type PermissionRequestView } from "./components/PermissionCard";
import { Pet } from "./components/Pet";
import { nextPetState } from "./state/petStateMachine";

const completedResetMs = 3000;
const showDebugPanel = import.meta.env.DEV;

type PermissionRequestPayload = { id: string; toolName?: string; toolDetail?: string };

type PetCompanionApi = {
  onPreviewPetAnimation: (callback: (animationKey: string) => void) => () => void;
  onPermissionRequest?: (callback: (request: PermissionRequestPayload) => void) => () => void;
  onPermissionResolved?: (callback: (payload: { id: string }) => void) => () => void;
  respondPermission?: (response: { id: string; decision: "allow" | "deny"; reason?: string }) => Promise<void>;
};

function petCompanion(): PetCompanionApi | undefined {
  return (window as Window & { companion?: PetCompanionApi }).companion;
}

export default function App() {
  const [state, setState] = useState<PetState>("idle");
  const [lastEvent, setLastEvent] = useState<PetEvent | null>(null);
  const [permissions, setPermissions] = useState<PermissionRequestView[]>([]);
  const [previewAnimation, setPreviewAnimation] = useState<{ key: string; nonce: number } | null>(null);
  const resetTimer = useRef<number | null>(null);

  function applyEvent(event: PetEvent) {
    setState(current => {
      const next = nextPetState(current, event);
      if (next !== current || event.event === current) setLastEvent(event);
      return next;
    });
  }

  function applyDebugEvent(event: PetEvent) {
    setLastEvent(event);
    setState(event.event);
  }

  useEffect(() => {
    const unsubscribe = window.petAPI?.onPetEvent(applyEvent);
    return () => unsubscribe?.();
  }, []);

  // Permission requests come from the main-process broker (the /permission
  // blocking flow), carrying an id we must echo back so the waiting hook —
  // and therefore Claude Code — receives the real allow/deny decision.
  useEffect(() => {
    const companion = petCompanion();
    const offRequest = companion?.onPermissionRequest?.(request => {
      setPermissions(current => {
        if (current.some(item => item.id === request.id)) return current;
        return [...current, { id: request.id, tool: request.toolName ?? "Tool request", detail: request.toolDetail }];
      });
    });
    const offResolved = companion?.onPermissionResolved?.(({ id }) => {
      setPermissions(current => current.filter(item => item.id !== id));
    });
    return () => { offRequest?.(); offResolved?.(); };
  }, []);

  function respondPermission(id: string, decision: "allow" | "deny") {
    void petCompanion()?.respondPermission?.({ id, decision });
    setPermissions(current => current.filter(item => item.id !== id));
  }

  useEffect(() => {
    const unsubscribe = petCompanion()?.onPreviewPetAnimation(animationKey => {
      if (animationKey === "__clear_preview") {
        setPreviewAnimation(null);
        return;
      }
      setPreviewAnimation({ key: animationKey, nonce: Date.now() });
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);

    if (state === "completed") {
      resetTimer.current = window.setTimeout(() => {
        setState("idle");
        setLastEvent(createPetEvent("idle", { title: "Idle" }));
      }, completedResetMs);
    }

    return () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    };
  }, [state]);

  const activePermission = permissions[0];
  const petState: PetState = activePermission ? "permission-prompt" : state;

  return (
    <main className={`app state-${petState}`}>
      {activePermission ? (
        <PermissionCard
          request={activePermission}
          queueCount={permissions.length}
          onAllow={() => respondPermission(activePermission.id, "allow")}
          onDeny={() => respondPermission(activePermission.id, "deny")}
        />
      ) : (
        <Panel state={state} event={lastEvent} />
      )}
      <Pet state={petState} previewAnimation={previewAnimation} />
      {showDebugPanel && (
        <div className="debug-panel">
          <button onClick={() => applyDebugEvent(createPetEvent("idle", { title: "Idle" }))}>Idle</button>
          <button onClick={() => applyDebugEvent(createPetEvent("running", { title: "Running", message: "Working on task" }))}>Running</button>
          <button onClick={() => setPermissions([{ id: `debug-${Date.now()}`, tool: "Bash", detail: "npm run build" }])}>Permission</button>
          <button onClick={() => applyDebugEvent(createPetEvent("completed", { title: "Completed", message: "Task finished" }))}>Completed</button>
        </div>
      )}
    </main>
  );
}
