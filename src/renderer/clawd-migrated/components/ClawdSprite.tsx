// @ts-nocheck
import React from "react";
import type { PetState, CompanionSettings } from "../../shared/events";
import { clawdGifName } from "../constants";

interface ClawdSpriteProps {
  state: PetState;
  idleBubble?: string | null;
  eventType?: string;
  tool?: string;
  stateAnimations?: Record<string, string>;
}

export function ClawdSprite({ state, idleBubble, eventType, tool, stateAnimations }: ClawdSpriteProps) {
  const gifClass = idleBubble
    ? `clawd-gif anim-${idleBubble}`
    : `clawd-gif anim-${clawdGifName[state]}`;

  return (
    <div className={gifClass + " clawd-sprite"} />
  );
}

