// @ts-nocheck
import React from "react";
import type { CompanionEvent, PetState, CompanionSettings } from "../../shared/events";
import { useI18n } from "../useI18n";

interface BubbleProps {
  event: CompanionEvent;
  state: PetState;
  settings: CompanionSettings;
}

export function Bubble({ event, state, settings }: BubbleProps) {
  const { t } = useI18n();
  return (
    <div className="bubble" style={{ opacity: settings.bubbleOpacity ?? 1, transform: `scale(${settings.bubbleScale ?? 1})` }}>
      <div className="bubble-header">
        <span className="bubble-state">{t(`pet.${state}`, state)}</span>
        <span className="bubble-title">{event.title}</span>
      </div>
      <div className="bubble-body">
        <p>{event.message}</p>
        {event.detail && <p className="bubble-detail">{event.detail}</p>}
      </div>
    </div>
  );
}

