import { useEffect, useRef, useState } from "react";
import { createPetEvent, PetEvent, PetState } from "../shared/events";
import { Panel } from "./components/Panel";
import { Pet } from "./components/Pet";
import { nextPetState } from "./state/petStateMachine";

const completedResetMs = 3000;

export default function App() {
  const [state, setState] = useState<PetState>("idle");
  const [lastEvent, setLastEvent] = useState<PetEvent | null>(null);
  const resetTimer = useRef<number | null>(null);

  function applyEvent(event: PetEvent) {
    setLastEvent(event);
    setState(current => nextPetState(current, event));
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
      <Panel state={state} event={lastEvent} />
      <Pet state={state} />
      <div className="debug-panel">
        <button onClick={() => applyEvent(createPetEvent("idle", { title: "Idle" }))}>Idle</button>
        <button onClick={() => applyEvent(createPetEvent("running", { title: "Running", message: "Working on task" }))}>Running</button>
        <button onClick={() => applyEvent(createPetEvent("permission-prompt", { title: "Permission needed", tool: "Bash" }))}>Permission</button>
        <button onClick={() => applyEvent(createPetEvent("completed", { title: "Completed", message: "Task finished" }))}>Completed</button>
      </div>
    </main>
  );
}
