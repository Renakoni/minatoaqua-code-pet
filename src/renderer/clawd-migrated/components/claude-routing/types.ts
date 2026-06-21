import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import type { ClaudeProviderConfig } from "../../../shared/events";

export type ClaudeProvider = ClaudeProviderConfig;

export type LegacyRoute = {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyMasked?: string;
};

export type DragHandleProps = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
};
