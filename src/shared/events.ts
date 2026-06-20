export type PetState = "idle" | "running" | "permission-prompt" | "completed";

export type PetEventType = PetState;

export interface PetEvent {
  id: string;
  event: PetEventType;
  title?: string;
  message?: string;
  tool?: string;
  detail?: string;
  timestamp: number;
}

const eventTypes = new Set<PetEventType>([
  "idle",
  "running",
  "permission-prompt",
  "completed"
]);

function optionalString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= maxLength);
}

export function isPetEvent(value: unknown): value is PetEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const event = value as Record<string, unknown>;
  if (typeof event.id !== "string" || event.id.length === 0 || event.id.length > 128) return false;
  if (typeof event.event !== "string" || !eventTypes.has(event.event as PetEventType)) return false;
  if (typeof event.timestamp !== "number" || !Number.isFinite(event.timestamp)) return false;
  if (!optionalString(event.title, 500)) return false;
  if (!optionalString(event.message, 2000)) return false;
  if (!optionalString(event.tool, 200)) return false;
  if (!optionalString(event.detail, 2000)) return false;

  return true;
}

export function createPetEvent(event: PetEventType, fields: Partial<Omit<PetEvent, "id" | "event" | "timestamp">> = {}): PetEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    event,
    timestamp: Date.now(),
    ...fields
  };
}
