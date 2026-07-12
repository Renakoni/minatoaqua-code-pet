import { describe, expect, it } from "vitest";
import { pointInBounds, trayMenuPosition } from "../src/main/trayMenuPosition";

const SIZE = { width: 208, height: 148 };
// A 1920x1032 work area: a bottom taskbar owns the remaining 48px.
const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1032 };

describe("trayMenuPosition", () => {
  it("opens centered above the cursor for a bottom taskbar", () => {
    const position = trayMenuPosition({ x: 1700, y: 1030 }, SIZE, WORK_AREA);
    expect(position).toEqual({ x: 1700 - SIZE.width / 2, y: 1030 - SIZE.height - 4 });
  });

  it("clamps at the right screen edge instead of clipping", () => {
    const position = trayMenuPosition({ x: 1915, y: 1030 }, SIZE, WORK_AREA);
    expect(position.x).toBe(WORK_AREA.width - SIZE.width - 4);
  });

  it("clamps at the left edge of a secondary display's work area", () => {
    const secondary = { x: -1920, y: 0, width: 1920, height: 1032 };
    const position = trayMenuPosition({ x: -1918, y: 1030 }, SIZE, secondary);
    expect(position.x).toBe(secondary.x + 4);
  });

  it("falls below the cursor when a top taskbar leaves no room above", () => {
    const topTaskbar = { x: 0, y: 48, width: 1920, height: 1032 };
    const position = trayMenuPosition({ x: 960, y: 50 }, SIZE, topTaskbar);
    // No space above the cursor inside the work area: pinned to its top.
    expect(position.y).toBe(topTaskbar.y + 4);
  });

  it("never exceeds the bottom of the work area", () => {
    const position = trayMenuPosition({ x: 960, y: 5000 }, SIZE, WORK_AREA);
    expect(position.y).toBe(WORK_AREA.height - SIZE.height - 4);
  });
});

describe("pointInBounds", () => {
  // Used to tell "the popup blurred because our own tray icon was clicked"
  // from a genuine click-away — the flicker fix depends on it.
  const trayIcon = { x: 1500, y: 1040, width: 24, height: 24 };

  it("matches points inside and on the leading edges only", () => {
    expect(pointInBounds({ x: 1500, y: 1040 }, trayIcon)).toBe(true);
    expect(pointInBounds({ x: 1512, y: 1052 }, trayIcon)).toBe(true);
    expect(pointInBounds({ x: 1524, y: 1052 }, trayIcon)).toBe(false); // exclusive right edge
    expect(pointInBounds({ x: 1499, y: 1052 }, trayIcon)).toBe(false);
    expect(pointInBounds({ x: 1512, y: 1064 }, trayIcon)).toBe(false); // exclusive bottom edge
  });

  it("matches nothing for an empty rect (tray bounds unavailable)", () => {
    expect(pointInBounds({ x: 0, y: 0 }, { x: 0, y: 0, width: 0, height: 0 })).toBe(false);
  });
});
