// Open the panel when the pet is double-clicked, via the OS non-client
// double-click message — the mechanism that stays compatible with the pet's
// native `-webkit-app-region: drag` region (a React onDoubleClick on `.pet`
// would pass jsdom tests but never fire, because Electron drag regions consume
// pointer/mouse events before the renderer sees them).
//
// The pet element is the ONLY drag region in the pet window, so Windows
// classifies just the pet as non-client (HTCAPTION) and everything else — the
// status/notification bubble, the permission card and its Allow/Deny buttons,
// and the transparent background — as client area. WM_NCLBUTTONDBLCLK therefore
// reaches us only for a double-click on the pet, never on those surfaces. Three
// more properties fall out for free: the OS (not a renderer timer) decides what
// counts as a double-click; the native drag is a different message
// (WM_NCLBUTTONDOWN + move), so a drag is never a double-click and a single
// click does nothing; and because the pet *is* the drag region, the hit target
// tracks the pet at any scale or imported-sprite height, with built-in clip pets
// and imported spritesheet pets behaving identically.

/** WM_NCLBUTTONDBLCLK: the non-client (caption) left-button double-click. */
export const WM_NCLBUTTONDBLCLK = 0x00a3;

export interface DoubleClickHookWindow {
  hookWindowMessage(message: number, callback: () => void): void;
}

/**
 * Wire the pet window's non-client double-click to `openPanel`. Call once per pet
 * window (createPetWindow's single-instance guard ensures that); the hook is
 * released when that window is destroyed, so a recreated pet window gets a fresh
 * single hook and handlers never accumulate.
 */
export function installPetDoubleClickToOpenPanel(
  window: DoubleClickHookWindow,
  openPanel: () => void
): void {
  window.hookWindowMessage(WM_NCLBUTTONDBLCLK, () => openPanel());
}
