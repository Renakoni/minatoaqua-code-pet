// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import type { CompanionConnectionStatus, CompanionEvent, CompanionSession, CompanionSettings, PermissionRequest, PetState } from "../shared/events";
import { defaultSettings, stateFromEvent } from "../shared/events";
import { getPetTheme } from "./utils/petThemes";

export interface ToolStream {
  event: CompanionEvent;
  exiting: boolean;
  slot: number;
  exitSlot?: number;
}

function applyTheme(theme: CompanionSettings["theme"], petTheme: CompanionSettings["petTheme"] = defaultSettings.petTheme) {
  const activePetTheme = getPetTheme(petTheme);
  document.documentElement.setAttribute("data-pet-theme", activePetTheme.id);
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    return;
  }
  if (theme === "system") {
    document.documentElement.setAttribute("data-theme", activePetTheme.interfaceTheme);
    return;
  }
  document.documentElement.setAttribute("data-theme", "light");
}

function applyUiStyle(uiStyle: CompanionSettings["uiStyle"]) {
  document.documentElement.setAttribute("data-ui-style", uiStyle);
}

export function useCompanion(options: { keepEventList?: boolean } = {}) {
  const keepEventList = options.keepEventList ?? true;
  const [settings, setSettings] = useState<CompanionSettings>(defaultSettings);
  const [connection, setConnection] = useState<CompanionConnectionStatus>({
    port: defaultSettings.port,
    serverListening: false,
    tokenSet: true,
    privacyMode: defaultSettings.privacyMode,
    connected: false
  });
  const [events, setEvents] = useState<CompanionEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<CompanionEvent | null>(null);
  const [petState, setPetState] = useState<PetState>("idle");
  const [toolStreams, setToolStreams] = useState<ToolStream[]>([]);
  const [activePermissions, setActivePermissions] = useState<PermissionRequest[]>([]);
  const [sessions, setSessions] = useState<CompanionSession[]>([]);
  const [exitingSessions, setExitingSessions] = useState<Set<string>>(new Set());
  const [mainSessionId, setMainSessionId] = useState<string | null>(null);
  const sessionsRef = useRef<Map<string, CompanionSession>>(new Map());
  const ribbonTimers = useRef<Map<string, number>>(new Map());
  const ribbonTimestamps = useRef<Map<string, number>>(new Map());
  const eventThrottleRef = useRef<{ timer: number | null; lastFlush: number }>({ timer: null, lastFlush: 0 });
  const pendingEventsRef = useRef<CompanionEvent[]>([]);
  const companionSlotRef = useRef<Map<string, number>>(new Map());

  function scheduleStreamRemoval(eventId: string) {
    window.setTimeout(() => {
      setToolStreams(previous => previous.filter(s => s.event.id !== eventId));
      ribbonTimers.current.delete(eventId);
      ribbonTimestamps.current.delete(eventId);
    }, 780);
  }

  function markExiting(eventId: string) {
    setToolStreams(previous => {
      const target = previous.find(s => s.event.id === eventId);
      if (!target) return previous;
      const exitSlot = target.slot;
      return previous.map(s => {
        if (s.event.id === eventId) return { ...s, exiting: true, exitSlot };
        if (!s.exiting && s.slot > exitSlot) return { ...s, slot: s.slot - 1 };
        return s;
      });
    });
    scheduleStreamRemoval(eventId);
  }

  useEffect(() => {
    void window.companion.getSettings().then(setSettings);
    void window.companion.getConnectionStatus().then(setConnection);
    const offSettings = window.companion.onSettings(next => {
      setSettings(next);
      applyTheme(next.theme, next.petTheme);
      applyUiStyle(next.uiStyle);
    });
    const offConnection = window.companion.onConnection(setConnection);
    const offEvent = window.companion.onEvent(event => {
      const sid = event.sessionId;
      const isDone = event.event === "done" || event.event === "error";
      if (sid) {
        const existing = sessionsRef.current.get(sid);
        if (!mainSessionId && sessionsRef.current.size === 0) setMainSessionId(sid);
        let title = existing?.title ?? "";
        const raw = event.detail || event.title || event.message || "";
        const clean = raw.length > 25 ? raw.slice(0, 25) + "…" : raw;
        if (!title && clean) title = clean;
        if (event.event === "prompt_submit") {
          const prompt = event.detail || event.message || "";
          if (prompt) title = prompt.length > 25 ? prompt.slice(0, 25) + "…" : prompt;
        }
        const wasActive = existing?.isActive ?? true;
        const session: CompanionSession = {
          sessionId: sid,
          title: title || existing?.title || sid.slice(0, 6),
          state: stateFromEvent(event),
          lastEvent: event,
          lastEventTime: Date.now(),
          isActive: !isDone,
          eventCount: (existing?.eventCount ?? 0) + 1
        };
        sessionsRef.current.set(sid, session);
        setSessions(Array.from(sessionsRef.current.values()));
        if (!wasActive && !isDone) setExitingSessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
        if (wasActive && isDone) {
          setExitingSessions(prev => new Set(prev).add(sid));
          const exitId = sid;
          window.setTimeout(() => {
            const revived = sessionsRef.current.get(exitId);
            if (revived?.isActive) return;
            setExitingSessions(prev => { const next = new Set(prev); next.delete(exitId); return next; });
            sessionsRef.current.delete(exitId);
            setSessions(Array.from(sessionsRef.current.values()));
          }, 700);
        }
      } else if (isDone) {
        for (const [id, session] of sessionsRef.current) {
          if (session.isActive) {
            sessionsRef.current.set(id, { ...session, isActive: false });
            setExitingSessions(prev => new Set(prev).add(id));
            const exitId = id;
            window.setTimeout(() => {
              const revived = sessionsRef.current.get(exitId);
              if (revived?.isActive) return;
              setExitingSessions(prev => { const next = new Set(prev); next.delete(exitId); return next; });
              sessionsRef.current.delete(exitId);
              setSessions(Array.from(sessionsRef.current.values()));
            }, 700);
          }
        }
        setSessions(Array.from(sessionsRef.current.values()));
      }

      for (const [id, session] of sessionsRef.current) {
        if (id !== mainSessionId && session.isActive && Date.now() - session.lastEventTime > 60_000 && !exitingSessions.has(id)) {
          sessionsRef.current.set(id, { ...session, isActive: false });
          setExitingSessions(prev => new Set(prev).add(id));
          const exitId = id;
          window.setTimeout(() => {
            const revived = sessionsRef.current.get(exitId);
            if (revived?.isActive) return;
            setExitingSessions(prev => { const next = new Set(prev); next.delete(exitId); return next; });
            sessionsRef.current.delete(exitId);
            setSessions(Array.from(sessionsRef.current.values()));
          }, 700);
        }
      }
      setSessions(Array.from(sessionsRef.current.values()));
      let silentCleanup = false;
      for (const [id, session] of sessionsRef.current) {
        if (Date.now() - session.lastEventTime > 300_000) {
          sessionsRef.current.delete(id);
          setExitingSessions(prev => { const next = new Set(prev); next.delete(id); return next; });
          silentCleanup = true;
        }
      }
      if (silentCleanup) setSessions(Array.from(sessionsRef.current.values()));

      const now = Date.now();
      if (now - eventThrottleRef.current.lastFlush < 100) {
        pendingEventsRef.current.push(event);
        if (!eventThrottleRef.current.timer) {
          eventThrottleRef.current.timer = window.setTimeout(() => {
            const pending = pendingEventsRef.current;
            pendingEventsRef.current = [];
            eventThrottleRef.current.timer = null;
            eventThrottleRef.current.lastFlush = Date.now();
            if (keepEventList) setEvents(previous => [...pending.reverse(), ...previous].slice(0, settings.eventHistoryLimit));
            const stateEvent = pending.find(e => e.event === "tool_start") ?? pending.find(e => e.event !== "tool_end" && e.event !== "git_operation");
            if (stateEvent) {
              setPetState(stateFromEvent(stateEvent));
              setCurrentEvent(stateEvent);
            }
          }, 100 - (now - eventThrottleRef.current.lastFlush));
        }
      } else {
        eventThrottleRef.current.lastFlush = now;
        if (keepEventList) setEvents(previous => [event, ...previous].slice(0, settings.eventHistoryLimit));
        if (event.event !== "tool_end" && event.event !== "git_operation") {
          setPetState(stateFromEvent(event));
          setCurrentEvent(event);
        }
      }

      if (event.event === "tool_end") {
        setToolStreams(previous => {
          const matching = previous.find(stream => stream.event.event === "tool_start" && stream.event.tool === event.tool && !stream.exiting);
          if (!matching) return previous;
          const addedAt = ribbonTimestamps.current.get(matching.event.id) ?? Date.now();
          const elapsed = Date.now() - addedAt;
          const minDisplayMs = Math.max(300, settings.toolStreamMinDuration * 1000);
          const fallbackId = ribbonTimers.current.get(matching.event.id);
          if (fallbackId) window.clearTimeout(fallbackId);
          ribbonTimers.current.delete(matching.event.id);
          if (elapsed >= minDisplayMs) markExiting(matching.event.id);
          else {
            const delayTimeout = window.setTimeout(() => { markExiting(matching.event.id); }, minDisplayMs - elapsed);
            ribbonTimers.current.set(matching.event.id, delayTimeout);
          }
          return previous;
        });
      }

      if (event.event === "tool_start") {
        let overflowId: string | undefined;
        setToolStreams(previous => {
          const active = previous.filter(stream => !stream.exiting);
          const overflow = active.length >= 5 ? active.at(-1) : undefined;
          if (overflow) {
            overflowId = overflow.event.id;
            const fallbackId = ribbonTimers.current.get(overflow.event.id);
            if (fallbackId) window.clearTimeout(fallbackId);
            ribbonTimers.current.delete(overflow.event.id);
          }
          const next = previous.map(stream => {
            const exiting = overflow && stream.event.id === overflow.event.id ? true : stream.exiting;
            return exiting ? { ...stream, exiting } : { ...stream, slot: Math.min(stream.slot + 1, 4) };
          });
          return [{ event, exiting: false, slot: 0 }, ...next].slice(0, 8);
        });
        if (overflowId) scheduleStreamRemoval(overflowId);
        ribbonTimestamps.current.set(event.id, Date.now());
        ribbonTimers.current.set(event.id, window.setTimeout(() => { markExiting(event.id); }, 10_000));
      }

      const timeout = (event.event === "done" || event.event === "error" ? 5.2 : settings.bubbleDuration) * 1000;
      window.setTimeout(() => {
        setPetState(current => current === stateFromEvent(event) ? "idle" : current);
        setCurrentEvent(current => current?.id === event.id ? null : current);
      }, timeout);
    });
    const offPermissionRequest = window.companion.onPermissionRequest(request => {
      setActivePermissions(prev => [...prev, request]);
      setPetState("waiting_permission");
    });
    const offPermissionResolved = window.companion.onPermissionResolved(({ id }) => {
      setActivePermissions(prev => prev.filter(permission => permission.id !== id));
    });

    return () => {
      offSettings();
      offConnection();
      offEvent();
      offPermissionRequest();
      offPermissionResolved();
      ribbonTimers.current.forEach(id => window.clearTimeout(id));
      ribbonTimers.current.clear();
      ribbonTimestamps.current.clear();
    };
  }, [keepEventList, settings.bubbleDuration, settings.eventHistoryLimit, settings.toolStreamMinDuration]);

  useEffect(() => {
    if (mainSessionId && !sessionsRef.current.has(mainSessionId) && sessionsRef.current.size === 0) {
      setMainSessionId(null);
    }
  }, [sessions, exitingSessions, mainSessionId]);

  useEffect(() => {
    const companionIds = sessions
      .filter(session => session.sessionId !== mainSessionId && (session.isActive || exitingSessions.has(session.sessionId)))
      .slice(0, 3)
      .map(session => session.sessionId);
    for (const [sid] of companionSlotRef.current) {
      if (!companionIds.includes(sid)) companionSlotRef.current.delete(sid);
    }
    const usedSlots = new Set(companionSlotRef.current.values());
    for (const sid of companionIds) {
      if (!companionSlotRef.current.has(sid)) {
        let slot = 0;
        while (usedSlots.has(slot)) slot++;
        companionSlotRef.current.set(sid, slot);
        usedSlots.add(slot);
      }
    }
  }, [sessions, exitingSessions, mainSessionId]);

  async function updateSettings(next: Partial<CompanionSettings>) {
    const saved = await window.companion.saveSettings(next);
    setSettings(saved);
    if (next.theme || next.petTheme) applyTheme(saved.theme, saved.petTheme);
    if (next.uiStyle) applyUiStyle(next.uiStyle);
  }

  async function respondToPermission(id: string, decision: "allow" | "deny") {
    await window.companion.respondPermission({
      id,
      decision,
      reason: decision === "allow" ? "Approved via Clawd" : "Denied via Clawd"
    });
    setActivePermissions(prev => prev.filter(permission => permission.id !== id));
  }

  return { settings, updateSettings, connection, events, currentEvent, petState, toolStreams, activePermissions, sessions, exitingSessions, mainSessionId, companionSlotRef, respondToPermission };
}

