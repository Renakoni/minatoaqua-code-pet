import { PetEvent } from "../../shared/events";

interface EventBubbleProps {
  event: PetEvent | null;
}

export function EventBubble({ event }: EventBubbleProps) {
  if (!event) return null;

  return (
    <div className="event-bubble">
      <div className="event-title">{event.title ?? event.event}</div>
      {event.message && <div className="event-message">{event.message}</div>}
      {event.tool && <div className="event-tool">{event.tool}</div>}
    </div>
  );
}
