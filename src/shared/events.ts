export type PetState = "idle" | "running" | "permission-prompt" | "completed" | "error";

export type PetEventType = PetState;
export type NotificationKind = "idle" | "attention" | "info";

export interface PetEvent {
  id: string;
  event: PetEventType;
  hook?: string;
  notificationKind?: NotificationKind;
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
  "completed",
  "error"
]);
const notificationKinds = new Set<NotificationKind>(["idle", "attention", "info"]);

function optionalString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= maxLength);
}

export function isPetEvent(value: unknown): value is PetEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const event = value as Record<string, unknown>;
  if (typeof event.id !== "string" || event.id.length === 0 || event.id.length > 128) return false;
  if (typeof event.event !== "string" || !eventTypes.has(event.event as PetEventType)) return false;
  if (typeof event.timestamp !== "number" || !Number.isFinite(event.timestamp)) return false;
  if (!optionalString(event.hook, 100)) return false;
  if (event.notificationKind !== undefined && (typeof event.notificationKind !== "string" || !notificationKinds.has(event.notificationKind as NotificationKind))) return false;
  if (!optionalString(event.title, 500)) return false;
  if (!optionalString(event.message, 2000)) return false;
  if (!optionalString(event.tool, 200)) return false;
  if (!optionalString(event.detail, 2000)) return false;

  return true;
}

export function isSessionStartEvent(event: Pick<PetEvent, "hook" | "title">): boolean {
  if (event.hook !== undefined) return event.hook === "SessionStart";
  return event.title === "Claude session started";
}

export function createPetEvent(event: PetEventType, fields: Partial<Omit<PetEvent, "id" | "event" | "timestamp">> = {}): PetEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    event,
    timestamp: Date.now(),
    ...fields
  };
}
