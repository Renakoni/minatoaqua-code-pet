import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPetEvent, PetEvent, PetState } from "../shared/events";
import {
  clampFeedbackOpacity,
  clampFeedbackScale,
  clampPermissionScale,
  clampPetOpacity,
  clampPetScale,
  getPetBubbleBottom
} from "../shared/petDisplaySettings";
import { redactDisplayEvent } from "../shared/privacy";
import { Panel } from "./components/Panel";
import { PermissionCard, type PermissionRequestView } from "./components/PermissionCard";
import { Pet } from "./components/Pet";
import { nextPetState } from "./state/petStateMachine";

const defaultBubbleSeconds = 8;
const soundClipMs = 3000;
const showDebugPanel = import.meta.env.DEV;

type PermissionRequestPayload = { id: string; toolName?: string; toolDetail?: string };
type PetDisplaySettings = {
  petScale?: number;
  clawdOpacity?: number;
  feedbackScale?: number;
  feedbackOpacity?: number;
  permissionScale?: number;
  bubbleDuration?: number;
  sound?: { volume?: number } | null;
  hideSensitiveContent?: boolean;
  language?: "auto" | "zh" | "en";
};

type PetCompanionApi = {
  getSettings?: () => Promise<PetDisplaySettings>;
  onSettings?: (callback: (settings: PetDisplaySettings) => void) => () => void;
  onPreviewPetAnimation: (callback: (animationKey: string) => void) => () => void;
  onPermissionRequest?: (callback: (request: PermissionRequestPayload) => void) => () => void;
  onPermissionResolved?: (callback: (payload: { id: string }) => void) => () => void;
  respondPermission?: (response: { id: string; decision: "allow" | "deny"; reason?: string }) => Promise<void>;
  onPlaySound?: (callback: (dataUrl: string) => void) => () => void;
};

function petCompanion(): PetCompanionApi | undefined {
  return (window as Window & { companion?: PetCompanionApi }).companion;
}

export default function App() {
  const [state, setState] = useState<PetState>("idle");
  const [lastEvent, setLastEvent] = useState<PetEvent | null>(null);
  const [permissions, setPermissions] = useState<PermissionRequestView[]>([]);
  const [petDisplay, setPetDisplay] = useState({
    scale: 1,
    opacity: 1,
    feedbackScale: 1,
    feedbackOpacity: 1,
    permissionScale: 1
  });
  const [hideSensitiveContent, setHideSensitiveContent] = useState(false);
  const [displayLanguage, setDisplayLanguage] = useState<"zh" | "en">(() => navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en");
  const [previewAnimation, setPreviewAnimation] = useState<{ key: string; nonce: number } | null>(null);
  const resetTimer = useRef<number | null>(null);
  const notificationTimer = useRef<number | null>(null);
  const stableEvent = useRef<PetEvent | null>(null);
  // "Bubble stay" (bubbleDuration) and sound volume live in refs so the timers
  // and the play-sound handler read the latest value without re-subscribing.
  const bubbleDurationMsRef = useRef(defaultBubbleSeconds * 1000);
  const soundVolumeRef = useRef(0.6);

  function applyEvent(event: PetEvent) {
    if (notificationTimer.current) {
      window.clearTimeout(notificationTimer.current);
      notificationTimer.current = null;
    }

    if (event.notificationKind === "info") {
      const previous = stableEvent.current;
      setLastEvent(event);
      notificationTimer.current = window.setTimeout(() => {
        setLastEvent(current => current?.id === event.id ? previous : current);
        notificationTimer.current = null;
      }, bubbleDurationMsRef.current);
      return;
    }

    setState(current => {
      const next = nextPetState(current, event);
      if (next !== current || event.event === current) {
        stableEvent.current = event;
        setLastEvent(event);
      }
      return next;
    });
  }

  function applyDebugEvent(event: PetEvent) {
    if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
    notificationTimer.current = null;
    stableEvent.current = event;
    setLastEvent(event);
    setState(event.event);
  }

  useEffect(() => {
    const unsubscribe = window.petAPI?.onPetEvent(applyEvent);
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const companion = petCompanion();
    const applySettings = (settings: PetDisplaySettings) => {
      setPetDisplay({
        scale: clampPetScale(settings.petScale),
        opacity: clampPetOpacity(settings.clawdOpacity),
        feedbackScale: clampFeedbackScale(settings.feedbackScale),
        feedbackOpacity: clampFeedbackOpacity(settings.feedbackOpacity),
        permissionScale: clampPermissionScale(settings.permissionScale)
      });
      const seconds = typeof settings.bubbleDuration === "number" && settings.bubbleDuration > 0
        ? Math.min(120, settings.bubbleDuration)
        : defaultBubbleSeconds;
      bubbleDurationMsRef.current = seconds * 1000;
      const volume = settings.sound?.volume;
      soundVolumeRef.current = typeof volume === "number" ? Math.max(0, Math.min(1, volume)) : 0.6;
      setHideSensitiveContent(settings.hideSensitiveContent === true);
      setDisplayLanguage(settings.language === "zh" || (settings.language === "auto" && navigator.language.toLowerCase().startsWith("zh")) ? "zh" : "en");
    };
    const initialSettings = companion?.getSettings?.();
    if (initialSettings) void initialSettings.then(applySettings);
    return companion?.onSettings?.(applySettings);
  }, []);

  // The floating pet is the always-alive window, so it plays notification sounds
  // (done/error/permission). The main process gates on sound.enabled + rules
  // before sending, so here we just play the clip at the current volume.
  useEffect(() => {
    return petCompanion()?.onPlaySound?.(dataUrl => {
      try {
        const audio = new Audio(dataUrl);
        audio.volume = soundVolumeRef.current;
        const stop = window.setTimeout(() => { audio.pause(); audio.currentTime = 0; }, soundClipMs);
        audio.addEventListener("ended", () => window.clearTimeout(stop), { once: true });
        // play() rejects (autoplay policy, decode/device error) inside a Promise
        // the sync try/catch can't see, so handle it here to avoid an unhandled
        // rejection and clear the clip timer.
        audio.play().catch(() => window.clearTimeout(stop));
      } catch { /* audio playback is best-effort */ }
    });
  }, []);

  // Permission requests come from the main-process broker (the /permission
  // blocking flow), carrying an id we must echo back so the waiting hook —
  // and therefore Claude Code — receives the real allow/deny decision.
  useEffect(() => {
    const companion = petCompanion();
    const offRequest = companion?.onPermissionRequest?.(request => {
      setPermissions(current => {
        if (current.some(item => item.id === request.id)) return current;
        return [...current, { id: request.id, tool: request.toolName ?? "Tool request", detail: request.toolDetail }];
      });
    });
    const offResolved = companion?.onPermissionResolved?.(({ id }) => {
      setPermissions(current => current.filter(item => item.id !== id));
    });
    return () => { offRequest?.(); offResolved?.(); };
  }, []);

  function respondPermission(id: string, decision: "allow" | "deny") {
    void petCompanion()?.respondPermission?.({ id, decision });
    setPermissions(current => current.filter(item => item.id !== id));
  }

  useEffect(() => {
    const unsubscribe = petCompanion()?.onPreviewPetAnimation(animationKey => {
      if (animationKey === "__clear_preview") {
        setPreviewAnimation(null);
        return;
      }
      setPreviewAnimation({ key: animationKey, nonce: Date.now() });
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);

    if (state === "completed") {
      resetTimer.current = window.setTimeout(() => {
        const idleEvent = createPetEvent("idle", { title: "Idle" });
        setState("idle");
        stableEvent.current = idleEvent;
        setLastEvent(idleEvent);
      }, bubbleDurationMsRef.current);
    }

    return () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    };
  }, [state]);

  useEffect(() => () => {
    if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
  }, []);

  const activePermission = permissions[0];
  const petState: PetState = activePermission ? "permission-prompt" : state;
  const appStyle = { "--pet-bubble-bottom": `${getPetBubbleBottom(petDisplay.scale)}px` } as CSSProperties;
  const displayEvent = hideSensitiveContent && lastEvent ? redactDisplayEvent(lastEvent, displayLanguage) : lastEvent;

  return (
    <main className={`app state-${petState}`} style={appStyle}>
      {activePermission ? (
        <PermissionCard
          request={activePermission}
          queueCount={permissions.length}
          onAllow={() => respondPermission(activePermission.id, "allow")}
          onDeny={() => respondPermission(activePermission.id, "deny")}
          scale={petDisplay.permissionScale}
        />
      ) : (
        <Panel state={state} event={displayEvent} scale={petDisplay.feedbackScale} opacity={petDisplay.feedbackOpacity} />
      )}
      <Pet state={petState} previewAnimation={previewAnimation} scale={petDisplay.scale} opacity={petDisplay.opacity} />
      {showDebugPanel && (
        <div className="debug-panel">
          <button onClick={() => applyDebugEvent(createPetEvent("idle", { title: "Idle" }))}>Idle</button>
          <button onClick={() => applyDebugEvent(createPetEvent("running", { title: "Working", tool: "Read", detail: "src/renderer/components/PermissionCard.tsx" }))}>Running</button>
          <button onClick={() => setPermissions([{ id: `debug-${Date.now()}`, tool: "Bash", detail: "npm run build" }])}>Permission</button>
          <button onClick={() => applyDebugEvent(createPetEvent("completed", { title: "Completed", message: "Task finished" }))}>Completed</button>
          <button onClick={() => applyDebugEvent(createPetEvent("error", { title: "Tool failed", tool: "Bash", message: "npm run build: exited with code 1" }))}>Error</button>
          <button onClick={() => applyDebugEvent(createPetEvent("idle", { title: "Waiting for you" }))}>Waiting</button>
        </div>
      )}
    </main>
  );
}
