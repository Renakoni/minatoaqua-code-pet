// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TrayMenuApp, { resolveTrayLocale, type TrayMenuState } from "../src/renderer/TrayMenuApp";

let pushState: (state: TrayMenuState) => void;
let trayMenuAction: ReturnType<typeof vi.fn>;
let trayMenuReady: ReturnType<typeof vi.fn>;

function baseState(overrides: Partial<TrayMenuState> = {}): TrayMenuState {
  return { petVisible: true, panelVisible: false, petEnabled: true, dark: true, language: "zh", ...overrides };
}

function installCompanion(readyResult: TrayMenuState | null) {
  trayMenuAction = vi.fn(async () => undefined);
  trayMenuReady = vi.fn(async () => readyResult);
  Reflect.set(window, "companion", {
    onTrayMenuState: (callback: (state: TrayMenuState) => void) => {
      pushState = state => act(() => callback(state));
      return () => undefined;
    },
    trayMenuReady,
    trayMenuAction
  });
}

beforeEach(() => {
  installCompanion(null);
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "companion");
});

describe("TrayMenuApp state flow", () => {
  it("renders the cold first open from the ready handshake, without any push", async () => {
    // Main defers presenting until this handshake; its result must be enough
    // to render — a push emitted before the subscription would be lost.
    installCompanion(baseState({ language: "en", petVisible: false }));
    render(<TrayMenuApp />);
    expect(await screen.findByRole("menuitem", { name: "Show pet" })).toBeTruthy();
    expect(trayMenuReady).toHaveBeenCalledTimes(1);
  });

  it("renders nothing until state arrives", () => {
    const view = render(<TrayMenuApp />);
    expect(view.container.querySelector(".tray-menu")).toBeNull();
    pushState(baseState());
    expect(view.container.querySelector(".tray-menu")).not.toBeNull();
  });

  it("labels follow the live visibility state, localized (zh)", () => {
    render(<TrayMenuApp />);
    pushState(baseState({ petVisible: true, panelVisible: false }));
    expect(screen.getByRole("menuitem", { name: "隐藏桌宠" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "显示面板" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "退出" })).toBeTruthy();

    pushState(baseState({ petVisible: false, panelVisible: true }));
    expect(screen.getByRole("menuitem", { name: "显示桌宠" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "隐藏面板" })).toBeTruthy();
  });

  it("renders English labels under the English language setting", () => {
    render(<TrayMenuApp />);
    pushState(baseState({ language: "en", petVisible: false }));
    expect(screen.getByRole("menuitem", { name: "Show pet" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Quit" })).toBeTruthy();
  });

  it("reports the clicked action back to main", () => {
    render(<TrayMenuApp />);
    pushState(baseState({ language: "en" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide pet" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Quit" }));
    expect(trayMenuAction.mock.calls.map(call => call[0])).toEqual(["toggle-pet", "quit"]);
  });

  it("disables the pet item while the pet is disabled in settings", () => {
    render(<TrayMenuApp />);
    pushState(baseState({ language: "en", petEnabled: false }));
    expect((screen.getByRole("menuitem", { name: "Hide pet" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide pet" }));
    expect(trayMenuAction).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    render(<TrayMenuApp />);
    pushState(baseState());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trayMenuAction).toHaveBeenCalledWith("close");
  });

  it("uses dark and light surfaces per the OS theme", () => {
    const view = render(<TrayMenuApp />);
    pushState(baseState({ dark: false }));
    expect(view.container.querySelector(".tray-menu.light")).not.toBeNull();
    pushState(baseState({ dark: true }));
    expect(view.container.querySelector(".tray-menu.dark")).not.toBeNull();
  });
});

describe("TrayMenuApp keyboard navigation", () => {
  function menu(view: ReturnType<typeof render>): HTMLElement {
    return view.container.querySelector(".tray-menu") as HTMLElement;
  }
  function item(name: string): HTMLButtonElement {
    return screen.getByRole("menuitem", { name }) as HTMLButtonElement;
  }

  it("focuses the first enabled item when the menu opens", () => {
    render(<TrayMenuApp />);
    pushState(baseState({ language: "en" }));
    expect(document.activeElement).toBe(item("Hide pet"));
  });

  it("skips a disabled pet item for the initial focus and while roving", () => {
    const view = render(<TrayMenuApp />);
    pushState(baseState({ language: "en", petEnabled: false }));
    expect(document.activeElement).toBe(item("Show panel"));
    fireEvent.keyDown(menu(view), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Quit"));
    fireEvent.keyDown(menu(view), { key: "ArrowDown" });
    // Wraps directly back to the panel item, never landing on the disabled one.
    expect(document.activeElement).toBe(item("Show panel"));
  });

  it("roves with wraparound in both directions", () => {
    const view = render(<TrayMenuApp />);
    pushState(baseState({ language: "en" }));
    fireEvent.keyDown(menu(view), { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("Quit")); // wrap from first to last
    fireEvent.keyDown(menu(view), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Hide pet")); // wrap from last to first
    fireEvent.keyDown(menu(view), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Show panel"));
  });

  it("jumps with Home and End", () => {
    const view = render(<TrayMenuApp />);
    pushState(baseState({ language: "en" }));
    fireEvent.keyDown(menu(view), { key: "End" });
    expect(document.activeElement).toBe(item("Quit"));
    fireEvent.keyDown(menu(view), { key: "Home" });
    expect(document.activeElement).toBe(item("Hide pet"));
  });

  it("activates the focused item with Enter and Space", () => {
    const view = render(<TrayMenuApp />);
    pushState(baseState({ language: "en" }));
    fireEvent.keyDown(menu(view), { key: "Enter" });
    fireEvent.keyDown(menu(view), { key: "ArrowDown" });
    fireEvent.keyDown(menu(view), { key: " " });
    expect(trayMenuAction.mock.calls.map(call => call[0])).toEqual(["toggle-pet", "toggle-panel"]);
  });
});

describe("resolveTrayLocale", () => {
  it("honors an explicit language and falls back to the system for auto", () => {
    expect(resolveTrayLocale("zh", "en-US")).toBe("zh");
    expect(resolveTrayLocale("en", "zh-CN")).toBe("en");
    expect(resolveTrayLocale("auto", "zh-CN")).toBe("zh");
    expect(resolveTrayLocale(undefined, "en-US")).toBe("en");
  });
});
