import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

// The custom tray popup: replaces the native Win32 context menu, whose
// reserved checkmark/accelerator gutters and OS-fixed item metrics cannot
// be styled.
//
// State flow: the mount effect subscribes to pushes FIRST, then performs the
// ready handshake — main defers presenting the window until the handshake,
// and its result doubles as the initial state, so a cold first right-click
// can never show an empty popup (renderer sends are not buffered, and the
// app mounts via dynamic import after did-finish-load).
//
// Keyboard: the ARIA menu contract this popup declares — the first enabled
// item is focused when the menu opens, ArrowUp/ArrowDown rove with
// wraparound, Home/End jump, Enter/Space activate, disabled items are
// skipped, Escape closes.

export interface TrayMenuState {
  petVisible: boolean;
  panelVisible: boolean;
  petEnabled: boolean;
  dark: boolean;
  language?: "auto" | "zh" | "en";
}

type TrayMenuAction = "toggle-pet" | "toggle-panel" | "quit" | "close";

type TrayCompanionApi = {
  onTrayMenuState?: (callback: (state: TrayMenuState) => void) => () => void;
  trayMenuReady?: () => Promise<TrayMenuState | null | undefined>;
  trayMenuAction?: (action: TrayMenuAction) => Promise<void>;
};

function trayCompanion(): TrayCompanionApi | undefined {
  return (window as Window & { companion?: TrayCompanionApi }).companion;
}

const COPY = {
  zh: { showPet: "显示桌宠", hidePet: "隐藏桌宠", showPanel: "显示面板", hidePanel: "隐藏面板", quit: "退出" },
  en: { showPet: "Show pet", hidePet: "Hide pet", showPanel: "Show panel", hidePanel: "Hide panel", quit: "Quit" }
} as const;

export function resolveTrayLocale(language: string | undefined, navigatorLanguage: string): "zh" | "en" {
  if (language === "zh" || language === "en") return language;
  return navigatorLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export default function TrayMenuApp() {
  const [state, setState] = useState<TrayMenuState | null>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let mounted = true;
    // Subscribe before the handshake so no push can slip between the two.
    const unsubscribe = trayCompanion()?.onTrayMenuState?.(setState);
    void trayCompanion()?.trayMenuReady?.().then(initial => {
      if (mounted && initial) setState(initial);
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void trayCompanion()?.trayMenuAction?.("close");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Every (re)open pushes a fresh state object: focus the first enabled item.
  useEffect(() => {
    if (!state) return;
    itemsRef.current.find(item => item && !item.disabled)?.focus();
  }, [state]);

  if (!state) return null;
  const copy = COPY[resolveTrayLocale(state.language, navigator.language)];
  const send = (action: TrayMenuAction) => () => void trayCompanion()?.trayMenuAction?.(action);

  function enabledItems(): HTMLButtonElement[] {
    return itemsRef.current.filter((item): item is HTMLButtonElement => Boolean(item) && !item!.disabled);
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = enabledItems();
    if (items.length === 0) return;
    const activeIndex = items.findIndex(item => item === document.activeElement);

    if (event.key === "ArrowDown") {
      items[(activeIndex + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      items[(activeIndex <= 0 ? items.length : activeIndex) - 1]?.focus();
    } else if (event.key === "Home") {
      items[0]?.focus();
    } else if (event.key === "End") {
      items[items.length - 1]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      // Explicit activation: identical behavior in every environment.
      if (activeIndex >= 0) items[activeIndex]?.click();
    } else {
      return;
    }
    event.preventDefault();
  }

  return (
    <div className={`tray-menu ${state.dark ? "dark" : "light"}`} role="menu" onKeyDown={handleMenuKeyDown}>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        ref={item => { itemsRef.current[0] = item; }}
        disabled={!state.petEnabled}
        onClick={send("toggle-pet")}
      >
        {state.petVisible ? copy.hidePet : copy.showPet}
      </button>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        ref={item => { itemsRef.current[1] = item; }}
        onClick={send("toggle-panel")}
      >
        {state.panelVisible ? copy.hidePanel : copy.showPanel}
      </button>
      <div className="tray-menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        ref={item => { itemsRef.current[2] = item; }}
        onClick={send("quit")}
      >
        {copy.quit}
      </button>
    </div>
  );
}
