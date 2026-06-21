// @ts-nocheck
import React from "react";
import type { PetState, CompanionSettings, CompanionSession } from "../../shared/events";
import { CompanionClawd } from "./CompanionClawd";
import { ClawdSprite } from "./ClawdSprite";
import { Bubble } from "./Bubble";
import { PermissionCard } from "./PermissionCard";
import { ToolStreams } from "./ToolStreams";
import { StateProp } from "./StateProp";
import { useI18n } from "../useI18n";

interface ClawdProps {
  state: PetState;
  settings: CompanionSettings;
  forceIdleBubble?: string | null;
  event?: any;
  activeSessionId?: string;
  sessions?: CompanionSession[];
  permissions?: any[];
  toolStreams?: any[];
  menuMode?: string;
  onAllow?: () => void;
  onDeny?: () => void;
}

export function Clawd({ state, settings, forceIdleBubble, event, activeSessionId, sessions, permissions, toolStreams, menuMode, onAllow, onDeny }: ClawdProps) {
  const { t } = useI18n();
  const hasEvent = !!event;

  return (
    <div className={`clawd-container state-${state}${hasEvent ? " has-event" : ""}`}>
      <ClawdSprite state={state} idleBubble={forceIdleBubble}
        eventType={event?.event} tool={event?.tool}
        stateAnimations={settings.stateAnimations} />
      <StateProp state={state} />
      {toolStreams && toolStreams.length > 0 && <ToolStreams streams={toolStreams} />}
      {event && <Bubble event={event} state={state} settings={settings} />}
      {permissions && permissions.length > 0 && (
        <PermissionCard
          permission={permissions[0]}
          queueCount={permissions.length}
          onAllow={onAllow ?? (() => {})}
          onDeny={onDeny ?? (() => {})}
          settings={settings}
        />
      )}
      {sessions?.filter(s => s.sessionId !== activeSessionId).map((session, i) => (
        <CompanionClawd key={session.sessionId} session={session} index={i} settings={settings} mainClawdOffset={{ x: 0, y: 0 }} />
      ))}
    </div>
  );
}

