import { PetEvent, PetState } from "../../shared/events";

interface PanelProps {
  state: PetState;
  event: PetEvent | null;
}

const stateLabels: Record<PetState, string> = {
  idle: "Idle",
  running: "Working",
  "permission-prompt": "Permission",
  completed: "Done"
};

export function Panel({ state, event }: PanelProps) {
  return (
    <section className="panel" aria-label="Pet status">
      <div className="panel-header">
        <span className={`status-dot status-${state}`} />
        <span className="panel-state">{stateLabels[state]}</span>
      </div>
      <div className="panel-title">{event?.title ?? "Claude pet is ready"}</div>
      {(event?.message || event?.tool || event?.detail) && (
        <div className="panel-meta">
          {event.tool && <span>{event.tool}</span>}
          {event.message && <span>{event.message}</span>}
          {!event.message && event.detail && <span>{event.detail}</span>}
        </div>
      )}
    </section>
  );
}
