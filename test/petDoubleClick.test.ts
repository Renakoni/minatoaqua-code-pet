import { describe, expect, it } from "vitest";
import {
  WM_LBUTTONDOWN,
  WM_PARENTNOTIFY,
  createDoubleClickDetector,
  decodeParentNotify,
  installPetParentNotifyWatcher
} from "../src/main/petDoubleClick";

// Build the (wParam, lParam) Buffers Windows delivers for a WM_PARENTNOTIFY carrying
// `message` at client point (x, y).
function parentNotify(message: number, x: number, y: number): [Buffer, Buffer] {
  const wParam = Buffer.alloc(8);
  wParam.writeUInt16LE(message, 0);
  const lParam = Buffer.alloc(8);
  lParam.writeInt16LE(x, 0);
  lParam.writeInt16LE(y, 2);
  return [wParam, lParam];
}

describe("decodeParentNotify", () => {
  it("reads the child mouse message and client point from wParam/lParam", () => {
    const [wParam, lParam] = parentNotify(WM_LBUTTONDOWN, 123, 45);
    expect(decodeParentNotify(wParam, lParam)).toEqual({ message: WM_LBUTTONDOWN, x: 123, y: 45 });
  });

  it("reads negative coordinates (multi-monitor) as signed", () => {
    const [wParam, lParam] = parentNotify(WM_LBUTTONDOWN, -10, -3);
    expect(decodeParentNotify(wParam, lParam)).toMatchObject({ x: -10, y: -3 });
  });
});

describe("createDoubleClickDetector", () => {
  function clock() {
    let t = 1000;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  }

  it("detects two downs within the time + distance window", () => {
    const c = clock();
    const detector = createDoubleClickDetector({ doubleClickMs: 500, maxDistancePx: 8, now: c.now });
    expect(detector.push(100, 100)).toBeNull(); // first down
    c.advance(200);
    expect(detector.push(103, 98)).toEqual({ x: 103, y: 98 }); // within 500ms and 8px
  });

  it("rejects a second down that is too slow", () => {
    const c = clock();
    const detector = createDoubleClickDetector({ doubleClickMs: 500, maxDistancePx: 8, now: c.now });
    detector.push(100, 100);
    c.advance(600); // past the double-click time
    expect(detector.push(100, 100)).toBeNull();
  });

  it("rejects a second down that is too far (a move, not a double-click)", () => {
    const c = clock();
    const detector = createDoubleClickDetector({ doubleClickMs: 500, maxDistancePx: 8, now: c.now });
    detector.push(100, 100);
    c.advance(100);
    expect(detector.push(140, 100)).toBeNull(); // 40px away
  });

  it("consumes the pair so a triple-click is one double-click, not two", () => {
    const c = clock();
    const detector = createDoubleClickDetector({ doubleClickMs: 500, maxDistancePx: 8, now: c.now });
    detector.push(50, 50);
    c.advance(100);
    expect(detector.push(50, 50)).toEqual({ x: 50, y: 50 }); // double
    c.advance(100);
    expect(detector.push(50, 50)).toBeNull(); // third starts a fresh pair
  });
});

describe("installPetParentNotifyWatcher", () => {
  it("hooks only WM_PARENTNOTIFY and reports the point for two left-button-downs", () => {
    const hooks = new Map<number, (w: Buffer, l: Buffer) => void>();
    const window = { hookWindowMessage: (m: number, cb: (w: Buffer, l: Buffer) => void) => { hooks.set(m, cb); } };
    let t = 0;
    const detector = createDoubleClickDetector({ doubleClickMs: 500, maxDistancePx: 8, now: () => t });
    const points: Array<{ x: number; y: number }> = [];
    installPetParentNotifyWatcher(window, detector, (x, y) => points.push({ x, y }));

    expect([...hooks.keys()]).toEqual([WM_PARENTNOTIFY]);
    const fire = hooks.get(WM_PARENTNOTIFY)!;
    fire(...parentNotify(WM_LBUTTONDOWN, 70, 80));
    t = 150;
    fire(...parentNotify(WM_LBUTTONDOWN, 72, 80));
    expect(points).toEqual([{ x: 72, y: 80 }]);
  });

  it("ignores WM_PARENTNOTIFY messages that aren't a left-button-down", () => {
    const hooks = new Map<number, (w: Buffer, l: Buffer) => void>();
    const window = { hookWindowMessage: (m: number, cb: (w: Buffer, l: Buffer) => void) => { hooks.set(m, cb); } };
    const detector = createDoubleClickDetector({ doubleClickMs: 500, maxDistancePx: 8, now: () => 0 });
    let opened = 0;
    installPetParentNotifyWatcher(window, detector, () => { opened += 1; });

    const fire = hooks.get(WM_PARENTNOTIFY)!;
    const WM_CREATE = 0x0001;
    fire(...parentNotify(WM_CREATE, 10, 10)); // child created, not a click
    fire(...parentNotify(WM_CREATE, 10, 10));
    expect(opened).toBe(0);
  });
});
