// Placement for the custom tray popup: centered above the cursor (the tray
// lives at the bottom edge on the default taskbar), clamped into the work
// area so the card never clips at a screen edge, never covers the taskbar,
// and still lands sensibly for top/side taskbar layouts.

export interface TrayMenuPoint {
  x: number;
  y: number;
}

export interface TrayMenuWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EDGE_MARGIN_PX = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function trayMenuPosition(
  cursor: TrayMenuPoint,
  size: { width: number; height: number },
  workArea: TrayMenuWorkArea
): TrayMenuPoint {
  const x = clamp(
    cursor.x - size.width / 2,
    workArea.x + EDGE_MARGIN_PX,
    workArea.x + workArea.width - size.width - EDGE_MARGIN_PX
  );
  const y = clamp(
    cursor.y - size.height - EDGE_MARGIN_PX,
    workArea.y + EDGE_MARGIN_PX,
    workArea.y + workArea.height - size.height - EDGE_MARGIN_PX
  );
  return { x: Math.round(x), y: Math.round(y) };
}
