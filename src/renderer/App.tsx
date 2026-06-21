import { useEffect, useRef, useState } from "react";
import { createPetEvent, PetEvent, PetState } from "../shared/events";
import { Panel } from "./components/Panel";
import { PermissionCard } from "./components/PermissionCard";
import { Pet } from "./components/Pet";
import { nextPetState } from "./state/petStateMachine";

const completedResetMs = 3000;
const showDebugPanel = import.meta.env.DEV;

export default function App() {
  const [state, setState] = useState<PetState>("idle");
  const [lastEvent, setLastEvent] = useState<PetEvent | null>(null);
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

  return (
    <main className={`app state-${state}`}>
      {state === "permission-prompt" ? <PermissionCard event={lastEvent} /> : <Panel state={state} event={lastEvent} />}
      <Pet state={state} />
      {showDebugPanel && (
        <div className="debug-panel">
          <button onClick={() => applyDebugEvent(createPetEvent("idle", { title: "Idle" }))}>Idle</button>
          <button onClick={() => applyDebugEvent(createPetEvent("running", { title: "Running", message: "Working on task" }))}>Running</button>
          <button onClick={() => applyDebugEvent(createPetEvent("permission-prompt", { title: "Permission needed", tool: "Bash", detail: "npm run build" }))}>Permission</button>
          <button onClick={() => applyDebugEvent(createPetEvent("completed", { title: "Completed", message: "Task finished" }))}>Completed</button>
        </div>
      )}
    </main>
  );
}
