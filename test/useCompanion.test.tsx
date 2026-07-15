// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompanion } from "../src/renderer/clawd-migrated/useCompanion";
import { defaultSettings } from "../src/renderer/shared/events";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
}

function installCompanion(getSettings: () => Promise<typeof defaultSettings>, initialSettings = defaultSettings) {
  let settingsListener = (_settings: typeof defaultSettings) => undefined;
  let eventListener = (_event: unknown) => undefined;
  Reflect.set(window, "companion", {
    initialState: { settings: initialSettings, petPacks: [] },
    getSettings,
    getConnectionStatus: vi.fn(async () => ({ port: 17321, serverListening: true })),
    onSettings: vi.fn(callback => { settingsListener = callback; return vi.fn(); }),
    onConnection: vi.fn(() => vi.fn()),
    onEvent: vi.fn(callback => { eventListener = callback; return vi.fn(); }),
    onPermissionRequest: vi.fn(() => vi.fn()),
    onPermissionResolved: vi.fn(() => vi.fn())
  });
  return {
    emitSettings: (settings: typeof defaultSettings) => settingsListener(settings),
    emitEvent: (event: unknown) => eventListener(event)
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "companion");
});

describe("useCompanion lifecycle", () => {
  it("uses the preload snapshot on the first render", () => {
    const pending = deferred<typeof defaultSettings>();
    const bootstrap = { ...defaultSettings, theme: "dark" as const, language: "en" as const };
    installCompanion(() => pending.promise, bootstrap);

    const view = renderHook(() => useCompanion());

    expect(view.result.current.settings).toBe(bootstrap);
  });

  it("does not let a stale initial read overwrite a newer settings broadcast", async () => {
    const initial = deferred<typeof defaultSettings>();
    const companion = installCompanion(() => initial.promise);
    const view = renderHook(() => useCompanion());
    const broadcast = { ...defaultSettings, language: "en" as const };

    act(() => companion.emitSettings(broadcast));
    await act(async () => {
      initial.resolve({ ...defaultSettings, language: "zh" });
      await initial.promise;
    });

    expect(view.result.current.settings.language).toBe("en");
  });

  it("clears delayed event work when the hook unmounts", () => {
    vi.useFakeTimers();
    const companion = installCompanion(async () => defaultSettings);
    const view = renderHook(() => useCompanion());

    act(() => companion.emitEvent({ id: "done-1", event: "done", timestamp: Date.now() }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
