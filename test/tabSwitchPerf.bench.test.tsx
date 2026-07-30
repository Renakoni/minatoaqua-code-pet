// @vitest-environment jsdom
//
// Tab-switch performance harness.
//
// Reproduces the real "keep-mounted background sections" layout of SettingsApp
// (Sessions / Plugins / Animation / Data all stay mounted under display:none)
// and measures how much React render work one *parent re-render* costs — the
// thing that happens on every clock tick, slider drag, or unrelated settings
// change while those sections sit in the background.
//
// It renders the REAL section components. Run it twice with an identical file:
//   * on this branch  -> sections are React.memo'd  -> "AFTER"
//   * with the 4 section files reverted to main      -> "BEFORE"
// Only the memoization differs between the two runs, so the delta is the win.
//
// Results are printed and also written to a JSON file named by TABPERF_LABEL so
// the two runs can be diffed programmatically.

import { act, cleanup, render } from "@testing-library/react";
import React, { Profiler, useState } from "react";
import { writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionsPage } from "../src/renderer/clawd-migrated/components/sessions/SessionsPage";
import { PluginsPage } from "../src/renderer/clawd-migrated/components/plugins/PluginsPage";
import { AnimationSection } from "../src/renderer/clawd-migrated/features/animation/AnimationSection";
import { DataSection } from "../src/renderer/clawd-migrated/features/data/DataSection";
import { I18nProvider } from "../src/renderer/clawd-migrated/useI18n";
import { defaultSettings } from "../src/renderer/shared/events";
import { catalogFromPetPack } from "../src/shared/petThemeCatalog";
import { CLAUDE_PROFILE_SCHEMA_VERSION } from "../src/shared/claudeProfiles";
import { makePackManifest } from "./helpers/packFixtures";

// ---------------------------------------------------------------------------
// Profiling accumulators
// ---------------------------------------------------------------------------
const HEAVY_MS = 0.1; // a commit above this actually re-rendered (vs a memo bailout)
type Acc = { commits: number; heavy: number; ms: number };
const stats = new Map<string, Acc>();
let collecting = false;

function onRender(id: string, _phase: unknown, actualDuration: number) {
  if (!collecting) return;
  const acc = stats.get(id) ?? { commits: 0, heavy: 0, ms: 0 };
  acc.commits += 1;
  if (actualDuration > HEAVY_MS) acc.heavy += 1;
  acc.ms += actualDuration;
  stats.set(id, acc);
}

// ---------------------------------------------------------------------------
// Fixtures (referentially stable, exactly like the fixed SettingsApp passes)
// ---------------------------------------------------------------------------
const catalog = catalogFromPetPack(makePackManifest());
const settings = {
  ...defaultSettings,
  idleAnim: { enabled: true, selectedSprites: ["idle"], intervalMin: 10, intervalMax: 20, repeatMin: 1, repeatMax: 2 },
  stateAnimations: {}
};
const noop = () => {};
const asyncNoop = async () => {};

// Inventory / session sizes. Default light so this file adds little load to the
// parallel suite; the headline before/after numbers were taken with the repo's
// realistic fixture size via TABPERF_SKILLS=2000 TABPERF_SESSIONS=30.
const SKILLS = Number(process.env.TABPERF_SKILLS ?? 200);
const SESSIONS = Number(process.env.TABPERF_SESSIONS ?? 15);

function makeProfilesSnapshot() {
  const skills = Array.from({ length: SKILLS }, (_, index) => ({
    id: `skill:skill-${index}`,
    kind: "skill" as const,
    name: `skill-${index}`,
    description: `Skill ${index}`,
    enabled: index < 10
  }));
  const base = {
    id: "default",
    name: "Default",
    skills: skills.map(skill => skill.id),
    plugins: ["plugin:review@market"],
    mcpServers: ["mcp:filesystem"],
    isProtected: true,
    createdAt: 1,
    updatedAt: 1
  };
  return {
    schemaVersion: CLAUDE_PROFILE_SCHEMA_VERSION,
    profiles: [base, { ...base, id: "all", name: "All" }, { ...base, id: "focused", name: "Focused", skills: ["skill:skill-100"], isProtected: false }],
    appliedProfileId: "default",
    inventory: {
      skills,
      plugins: [{ id: "plugin:review@market", kind: "plugin", name: "review@market", enabled: true }],
      mcpServers: [{ id: "mcp:filesystem", kind: "mcp", name: "filesystem", enabled: true }],
      scannedAt: 123
    },
    drift: { profileId: "default", isDrifted: false, skills: false, plugins: false, mcpServers: false },
    mcpStatus: "ready" as const
  };
}

function makeSessions() {
  return Array.from({ length: SESSIONS }, (_, index) => ({
    id: `session-${index}`,
    filePath: `~/.claude/projects/proj/session-${index}.jsonl`,
    project: "proj",
    summary: `Session ${index}`,
    firstTimestamp: 1,
    lastTimestamp: 2,
    messageCount: 12,
    sizeBytes: 4096
  }));
}

beforeEach(() => {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
    globalThis.cancelAnimationFrame = id => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  }
  const snapshot = makeProfilesSnapshot();
  Reflect.set(window, "companion", {
    // Sessions
    getClaudeSessions: vi.fn(async () => ({ sessions: makeSessions(), scannedAt: 0, projectsDir: "~/.claude/projects" })),
    getClaudeSessionDetail: vi.fn(async () => ({ messages: [], totalMessages: 0 })),
    resumeClaudeSession: vi.fn(async () => ({ ok: true })),
    // Plugins
    getClaudeProfiles: vi.fn(async () => snapshot),
    saveClaudeProfile: vi.fn(async () => ({ ok: true })),
    applyClaudeProfile: vi.fn(async () => ({ ok: true })),
    deleteClaudeProfile: vi.fn(async () => ({ ok: true })),
    setClaudeProfileResourceState: vi.fn(async () => ({ ok: true })),
    // Animation
    previewPetAnimation: vi.fn(async () => true),
    // Data
    getDataDirectory: vi.fn(async () => "~/.chara-desk"),
    openDataDirectory: vi.fn(async () => ({ ok: true })),
    getTokenStats: vi.fn(async () => null)
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "companion");
  stats.clear();
  collecting = false;
});

// The keep-mounted layout: a parent that ticks a clock (`now`) with all four
// background sections mounted below it, each behind a Profiler. `now` is NOT
// passed to any section — exactly like the real shell, where a tick only moves
// relative timestamps in SettingsSection, never these four.
let drive: () => void = () => {};
function Harness() {
  const [now, setNow] = useState(0);
  drive = () => setNow(value => value + 1);
  return (
    <Profiler id="root" onRender={onRender}>
      <div className="section-content">
        <span data-testid="clock">{now}</span>
        <Profiler id="sessions" onRender={onRender}>
          <div style={{ display: "none" }}><SessionsPage active={false} hideSensitiveContent={false} /></div>
        </Profiler>
        <Profiler id="plugins" onRender={onRender}>
          <div style={{ display: "none" }}><PluginsPage active={false} settings={settings} updateSettings={noop} /></div>
        </Profiler>
        <Profiler id="animation" onRender={onRender}>
          <div style={{ display: "none" }}><AnimationSection active={false} settings={settings} updateSettings={noop} catalog={catalog} spritesheet={null} /></div>
        </Profiler>
        <Profiler id="data" onRender={onRender}>
          <div style={{ display: "none" }}>
            <DataSection persistedStats={null} activityCount={3} hideSensitiveContent={false} onClearActivity={asyncNoop} onResetStats={asyncNoop} />
          </div>
        </Profiler>
      </div>
    </Profiler>
  );
}

describe("tab-switch keep-mounted re-render cost", () => {
  it("measures the cost of one parent re-render with sections in the background", async () => {
    const WARMUP = 20;
    const TICKS = 120;
    // BEFORE (unmemoized) re-renders all four heavy sections on every tick, so
    // 120 ticks can far exceed the 5s default; give both runs generous room.

    render(
      <I18nProvider initialLocale="en">
        <Harness />
      </I18nProvider>
    );

    // Let every section finish its mount data-load and settle.
    for (let i = 0; i < 4; i += 1) {
      await act(async () => { await Promise.resolve(); });
    }

    // Warm up the JIT / React internals, then start collecting on a clean slate.
    for (let i = 0; i < WARMUP; i += 1) act(() => drive());
    stats.clear();
    collecting = true;

    for (let i = 0; i < TICKS; i += 1) act(() => drive());

    collecting = false;

    const root = stats.get("root") ?? { commits: 0, heavy: 0, ms: 0 };
    const sectionIds = ["sessions", "plugins", "animation", "data"] as const;
    const sections = sectionIds.map(id => {
      const acc = stats.get(id) ?? { commits: 0, heavy: 0, ms: 0 };
      return { id, perTickMs: acc.ms / TICKS, reRenders: acc.heavy, ofTicks: TICKS };
    });

    const rootPerTick = root.ms / TICKS;
    const label = process.env.TABPERF_LABEL ?? "run";
    const result = {
      label,
      ticks: TICKS,
      rootPerTickMs: Number(rootPerTick.toFixed(4)),
      rootTotalMs: Number(root.ms.toFixed(2)),
      // A background tab that ticks the clock 1x/sec pays rootPerTick every second.
      wastedMsPerMinuteIfTicking: Number((rootPerTick * 60).toFixed(2)),
      sections: sections.map(s => ({
        id: s.id,
        perTickMs: Number(s.perTickMs.toFixed(4)),
        reRendersOutOf: `${s.reRenders}/${s.ofTicks}`
      }))
    };

    // eslint-disable-next-line no-console
    console.log(`\n=== TABPERF [${label}] ===\n` + JSON.stringify(result, null, 2) + "\n");
    // Only persist when a caller explicitly asks (the before/after comparison
    // runs) so a normal `npm test` never litters the repo with a JSON artifact.
    if (process.env.TABPERF_OUT) {
      try {
        writeFileSync(process.env.TABPERF_OUT, JSON.stringify(result, null, 2));
      } catch {
        /* best-effort; the console log is the source of truth */
      }
    }

    // Sanity: the harness really mounted the sections and really ticked.
    expect(root.commits).toBe(TICKS);
    expect(rootPerTick).toBeGreaterThan(0);

    // Regression guard: the four keep-mounted sections are React.memo'd, so a
    // parent re-render (clock tick) must NOT re-render them. Without the memo
    // each section re-renders on all 120 ticks (480 total); with it, only a
    // couple of stray async settles slip through. Fail loudly if the memo is
    // dropped and the sections start re-rendering on every tick again.
    const sectionReRenders = sections.reduce((sum, section) => sum + section.reRenders, 0);
    expect(sectionReRenders).toBeLessThan(TICKS / 2);
  }, 120000);
});
