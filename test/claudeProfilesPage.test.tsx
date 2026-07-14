// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginsPage } from "../src/renderer/clawd-migrated/components/plugins/PluginsPage";
import { I18nProvider } from "../src/renderer/clawd-migrated/useI18n";
import { defaultSettings } from "../src/renderer/shared/events";
import type {
  ClaudeProfile,
  ClaudeProfilePreviewResult,
  ClaudeProfileSaveInput,
  ClaudeProfilesSnapshot
} from "../src/shared/claudeProfiles";

let currentSnapshot: ClaudeProfilesSnapshot;
const saveClaudeProfile = vi.fn<(input: ClaudeProfileSaveInput) => Promise<unknown>>();
const previewClaudeProfile = vi.fn<(profileId: string) => Promise<ClaudeProfilePreviewResult>>();
const applyClaudeProfile = vi.fn<(profileId: string) => Promise<unknown>>();

function makeSnapshot(mcpStatus: ClaudeProfilesSnapshot["mcpStatus"] = "ready"): ClaudeProfilesSnapshot {
  const skills = Array.from({ length: 2000 }, (_, index) => ({
    id: `skill:skill-${index}`,
    kind: "skill" as const,
    name: `skill-${index}`,
    description: `Skill ${index}`,
    enabled: index < 10
  }));
  const defaultProfile: ClaudeProfile = {
    id: "default",
    name: "Default",
    skills: skills.slice(0, 10).map(skill => skill.id),
    plugins: ["plugin:review@market"],
    mcpServers: ["mcp:filesystem"],
    isProtected: true,
    createdAt: 1,
    updatedAt: 1
  };
  const focusedProfile: ClaudeProfile = {
    id: "focused",
    name: "Focused",
    description: "Frontend work",
    skills: ["skill:skill-100"],
    plugins: [],
    mcpServers: [],
    isProtected: false,
    createdAt: 2,
    updatedAt: 2
  };
  return {
    schemaVersion: 1,
    profiles: [defaultProfile, focusedProfile],
    appliedProfileId: "default",
    inventory: {
      skills,
      plugins: [{ id: "plugin:review@market", kind: "plugin", name: "review@market", enabled: true }],
      mcpServers: [{ id: "mcp:filesystem", kind: "mcp", name: "filesystem", enabled: true }],
      scannedAt: 123
    },
    drift: { profileId: "default", isDrifted: false, skills: false, plugins: false, mcpServers: false },
    mcpStatus
  };
}

function installCompanionMock() {
  saveClaudeProfile.mockImplementation(async input => {
    const existing = currentSnapshot.profiles.find(profile => profile.id === input.id);
    const profile: ClaudeProfile = {
      id: existing?.id ?? "created",
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      skills: [...input.skills],
      plugins: [...input.plugins],
      mcpServers: [...input.mcpServers],
      isProtected: existing?.isProtected ?? false,
      createdAt: existing?.createdAt ?? 3,
      updatedAt: 4
    };
    currentSnapshot = {
      ...currentSnapshot,
      profiles: existing
        ? currentSnapshot.profiles.map(item => item.id === profile.id ? profile : item)
        : [...currentSnapshot.profiles, profile],
      drift: profile.id === currentSnapshot.appliedProfileId
        ? { profileId: profile.id, isDrifted: true, skills: true, plugins: false, mcpServers: false }
        : currentSnapshot.drift
    };
    return { ok: true, profileId: profile.id, snapshot: currentSnapshot };
  });
  previewClaudeProfile.mockResolvedValue({
    ok: true,
    profileId: "focused",
    changes: {
      skills: { enable: ["skill:skill-100"], disable: currentSnapshot.profiles[0].skills },
      plugins: { enable: [], disable: ["plugin:review@market"] },
      mcpServers: { enable: [], disable: ["mcp:filesystem"] }
    }
  });
  applyClaudeProfile.mockImplementation(async profileId => {
    currentSnapshot = {
      ...currentSnapshot,
      appliedProfileId: profileId,
      drift: { profileId, isDrifted: false, skills: false, plugins: false, mcpServers: false }
    };
    return { ok: true, profileId, snapshot: currentSnapshot };
  });
  Reflect.set(window, "companion", {
    getClaudeProfiles: vi.fn(async () => currentSnapshot),
    saveClaudeProfile,
    deleteClaudeProfile: vi.fn(async () => ({ ok: false, issues: [] })),
    previewClaudeProfile,
    applyClaudeProfile
  });
}

function renderPage() {
  return render(
    <I18nProvider initialLocale="en">
      <PluginsPage settings={defaultSettings} updateSettings={vi.fn()} />
    </I18nProvider>
  );
}

beforeEach(() => {
  currentSnapshot = makeSnapshot();
  vi.clearAllMocks();
  installCompanionMock();
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "companion");
});

describe("Unified Claude Profiles page", () => {
  it("virtualizes 2,000 Skills and saves curation without applying it", async () => {
    const view = renderPage();

    expect(await screen.findByText("Currently applied")).toBeTruthy();
    expect(screen.getByText("10/2000")).toBeTruthy();
    expect(view.container.querySelectorAll(".claude-profile-readonly-row").length).toBeLessThan(40);
    expect(view.container.querySelector('[data-resource-id="skill:skill-1999"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(await screen.findByText("Edit profile")).toBeTruthy();
    expect(view.container.querySelectorAll(".claude-profile-resource-option").length).toBeLessThan(40);

    fireEvent.change(screen.getByPlaceholderText("Search Skills"), { target: { value: "skill-1999" } });
    await waitFor(() => expect(view.container.querySelector('[data-resource-id="skill:skill-1999"]')).toBeTruthy());
    fireEvent.click(view.container.querySelector('[data-resource-id="skill:skill-1999"] input')!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveClaudeProfile).toHaveBeenCalledTimes(1));
    expect(saveClaudeProfile.mock.calls[0][0].skills).toContain("skill:skill-1999");
    expect(previewClaudeProfile).not.toHaveBeenCalled();
    expect(applyClaudeProfile).not.toHaveBeenCalled();
  });

  it("previews and confirms Apply while stating the running-session boundary", async () => {
    renderPage();
    await screen.findByText("Currently applied");

    fireEvent.change(screen.getByRole("combobox", { name: "Profile" }), { target: { value: "focused" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Apply “Focused”?" )).toBeTruthy();
    expect(screen.getByText("Running Claude Code sessions will not change.")).toBeTruthy();
    expect(screen.getByText("Enable 1, disable 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply profile" }));

    await waitFor(() => expect(applyClaudeProfile).toHaveBeenCalledWith("focused"));
    expect(await screen.findByText("Currently applied")).toBeTruthy();
  });

  it("creates a new profile by copying the selected membership", async () => {
    renderPage();
    await screen.findByText("Currently applied");

    fireEvent.click(screen.getByRole("button", { name: "New profile" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy selected/ }));

    expect(await screen.findByText("New profile")).toBeTruthy();
    expect(screen.getByDisplayValue("Default copy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveClaudeProfile).toHaveBeenCalledTimes(1));
    const input = saveClaudeProfile.mock.calls[0][0];
    expect(input.id).toBeUndefined();
    expect(input.skills).toHaveLength(10);
    expect(input.plugins).toEqual(["plugin:review@market"]);
    expect(input.mcpServers).toEqual(["mcp:filesystem"]);
  });

  it("pauses profile mutations while MCP state is unreadable", async () => {
    currentSnapshot = makeSnapshot("config-unreadable");
    renderPage();

    expect(await screen.findByText("~/.claude.json is temporarily unreadable. Profile actions are paused.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Edit profile" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "New profile" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
