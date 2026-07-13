import { describe, expect, it } from "vitest";
import { WM_NCLBUTTONDBLCLK, installPetDoubleClickToOpenPanel } from "../src/main/petDoubleClick";

describe("installPetDoubleClickToOpenPanel", () => {
  it("opens the panel on the OS non-client double-click, and only that message", () => {
    const hooks = new Map<number, () => void>();
    const window = { hookWindowMessage: (message: number, callback: () => void) => { hooks.set(message, callback); } };
    let opened = 0;

    installPetDoubleClickToOpenPanel(window, () => { opened += 1; });

    // Exactly one hook, for the non-client (caption) double-click. Since the pet
    // is the only -webkit-app-region: drag region, that message reaches us only
    // for the pet — never for the bubble, permission card, Allow/Deny buttons, or
    // transparent background, which are all client-area (a different message).
    expect([...hooks.keys()]).toEqual([WM_NCLBUTTONDBLCLK]);
    expect(WM_NCLBUTTONDBLCLK).toBe(0x00a3);

    // Nothing opens until the OS actually delivers a double-click...
    expect(opened).toBe(0);
    hooks.get(WM_NCLBUTTONDBLCLK)!();
    expect(opened).toBe(1);

    // ...and it keeps working (not a one-shot handler).
    hooks.get(WM_NCLBUTTONDBLCLK)!();
    expect(opened).toBe(2);
  });
});
