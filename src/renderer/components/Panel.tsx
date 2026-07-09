import { PetEvent, PetState } from "../../shared/events";
import { actionForTool, toolLabel } from "./toolPresentation";

interface PanelProps {
  state: PetState;
  event: PetEvent | null;
}

const stateLabels: Record<PetState, string> = {
  idle: "Idle",
  running: "Working",
  "permission-prompt": "Permission",
  completed: "Done",
  error: "Error"
};

export function Panel({ state, event }: PanelProps) {
  const tool = event?.tool;
  const detail = event?.detail?.trim();
  // With a tool, lead with the action ("Read a file") and show the tool chip —
  // so it's obvious at a glance which tool is running. Otherwise fall back to
  // the event's own title (session start, done, error, …).
  const headline = tool ? actionForTool(tool) : (event?.title ?? "Claude pet is ready");
  const note = !tool ? event?.message?.trim() : undefined;

  return (
    <section className={`pet-bubble panel state-${state}`} aria-label="Pet status">
      <div className="bubble-eyebrow">
        <span className="bubble-dot" aria-hidden="true" />
        {stateLabels[state]}
      </div>

      <div className="bubble-body">
        <p className="bubble-action">{headline}</p>
        {tool ? <span className="bubble-tool-chip">{toolLabel(tool)}</span> : null}
      </div>

      {tool && detail ? <div className="panel-path" title={detail}><bdi>{detail}</bdi></div> : null}
      {note ? <p className="panel-note">{note}</p> : null}
    </section>
  );
}
