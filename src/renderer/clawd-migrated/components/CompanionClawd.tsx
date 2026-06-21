// @ts-nocheck
import React from "react";
import type { CompanionSession, CompanionSettings } from "../../shared/events";

interface CompanionClawdProps {
  session: CompanionSession;
  index: number;
  settings: CompanionSettings;
  exiting?: boolean;
  mainClawdOffset?: { x: number; y: number };
}

export function CompanionClawd({ session, index, settings, exiting, mainClawdOffset }: CompanionClawdProps) {
  const offKey = `companion${index}` as keyof typeof settings.positionOffsets;
  const offset = settings.positionOffsets?.[offKey] ?? { x: 100 + index * 80, y: -100 - index * 40 };
  const scale = settings.companionScale ?? 0.6;
  const stateLabel = `anim-${session.state}`;

  return (
    <div
      className={`companion-clawd ${exiting ? "exiting" : ""}`}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        opacity: settings.petOpacity ?? 1,
        pointerEvents: settings.clickThrough ? "none" : "auto"
      }}
    >
      <div className={`clawd-gif ${stateLabel}`} />
      {settings.showSessionTitle && session.title && (
        <div className="companion-label">{session.title}</div>
      )}
    </div>
  );
}

