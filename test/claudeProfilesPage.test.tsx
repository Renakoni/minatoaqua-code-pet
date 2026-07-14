// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginsPage } from "../src/renderer/clawd-migrated/components/plugins/PluginsPage";
import { I18nProvider } from "../src/renderer/clawd-migrated/useI18n";
import { defaultSettings } from "../src/renderer/shared/events";
import type {
  ClaudeProfile,
  ClaudeProfileSaveInput,
  ClaudeProfilesSnapshot
} from "../src/shared/claudeProfiles";

let currentSnapshot: ClaudeProfilesSnapshot;
const saveClaudeProfile = vi.fn<(input: ClaudeProfileSaveInput) => Promise<unknown>>();
const previewClaudeProfile = vi.fn();
const applyClaudeProfile = vi.fn<(profileId: string) => Promise<unknown>>();
const deleteClaudeProfile = vi.fn<(profileId: string) => Promise<unknown>>();

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
    skills: skills.map(skill => skill.id),
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
  applyClaudeProfile.mockImplementation(async profileId => {
    const profile = currentSnapshot.profiles.find(item => item.id === profileId)!;
    currentSnapshot = {
      ...currentSnapshot,
      appliedProfileId: profileId,
      inventory: {
        ...currentSnapshot.inventory,
        skills: currentSnapshot.inventory.skills.map(item => ({ ...item, enabled: profile.skills.includes(item.id) })),
        plugins: currentSnapshot.inventory.plugins.map(item => ({ ...item, enabled: profile.plugins.includes(item.id) })),
        mcpServers: currentSnapshot.inventory.mcpServers.map(item => ({ ...item, enabled: profile.mcpServers.includes(item.id) }))
      },
      drift: { profileId, isDrifted: false, skills: false, plugins: false, mcpServers: false }
    };
    return { ok: true, profileId, snapshot: currentSnapshot };
  });
  deleteClaudeProfile.mockImplementation(async profileId => {
    if (profileId === currentSnapshot.appliedProfileId) return { ok: false, issues: [] };
    currentSnapshot = {
      ...currentSnapshot,
      profiles: currentSnapshot.profiles.filter(profile => profile.id !== profileId)
    };
    return { ok: true, profileId, snapshot: currentSnapshot };
  });
  Reflect.set(window, "companion", {
    getClaudeProfiles: vi.fn(async () => currentSnapshot),
    saveClaudeProfile,
    deleteClaudeProfile,
    previewClaudeProfile,
    applyClaudeProfile
  });
}

function renderPage(settings = defaultSettings) {
  return render(
    <I18nProvider initialLocale="en">
      <PluginsPage settings={settings} updateSettings={vi.fn()} />
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
  it("keeps the resource page compact and moves resources between two virtualized editor columns", async () => {
    const view = renderPage();

    expect(await screen.findByRole("button", { name: "Profile: Default" })).toBeTruthy();
    expect(view.container.querySelector(".claude-profile-picker select")).toBeNull();
    expect(screen.queryByText("Currently applied")).toBeNull();
    expect(screen.queryByText("Only new Claude Code sessions read an applied profile. Running sessions stay unchanged.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(view.container.querySelector(".claude-profile-toolbar")).toBeTruthy();
    expect(view.container.querySelector(".claude-resource-list-toolbar .claude-resource-search-refresh")).toBeTruthy();
    expect(view.container.querySelector(".claude-resource-list-toolbar > span")).toBeNull();
    expect(view.container.querySelector(".claude-resource-subtab")?.textContent).toBe("Skills2000");
    expect(view.container.textContent).not.toMatch(/\d+\/\d+/);
    expect(view.container.querySelectorAll(".claude-profile-readonly-row").length).toBeLessThan(40);
    expect(view.container.querySelector('[data-resource-id="skill:skill-1999"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(await screen.findByRole("heading", { name: "Edit profile" })).toBeTruthy();
    expect(screen.getByText("Unselected")).toBeTruthy();
    expect(screen.getByText("Selected")).toBeTruthy();
    expect(screen.queryByText("Saving updates the profile only. Claude Code is unchanged.")).toBeNull();
    expect(screen.queryByText("Description")).toBeNull();
    expect(screen.queryByText("Select filtered")).toBeNull();
    expect(view.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(view.container.querySelectorAll(".claude-profile-transfer-column")).toHaveLength(2);
    expect(view.container.querySelectorAll(".claude-profile-transfer-option").length).toBeLessThan(40);

    fireEvent.change(screen.getByPlaceholderText("Search Skills"), { target: { value: "skill-1999" } });
    const remove = await screen.findByRole("button", { name: "Remove skill-1999" });
    fireEvent.click(remove);
    const select = await screen.findByRole("button", { name: "Select skill-1999" });
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveClaudeProfile).toHaveBeenCalledTimes(1));
    expect(saveClaudeProfile.mock.calls[0][0].skills).toContain("skill:skill-1999");
    expect(previewClaudeProfile).not.toHaveBeenCalled();
    await waitFor(() => expect(applyClaudeProfile).toHaveBeenCalledWith("default"));
  });

  it("applies a selected profile immediately and confirms the switch with a toast", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Profile: Default" }));

    fireEvent.click(screen.getByRole("option", { name: "Focused" }));

    await waitFor(() => expect(applyClaudeProfile).toHaveBeenCalledWith("focused"));
    expect(previewClaudeProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(await screen.findByText("Switched to: Focused")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Profile: Focused" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skills 1" })).toBeTruthy();
    expect(document.querySelectorAll(".claude-profile-readonly-row")).toHaveLength(1);
  });

  it("uses a searchable in-app profile menu with current-first natural ordering", async () => {
    const focused = currentSnapshot.profiles[1];
    currentSnapshot = {
      ...currentSnapshot,
      profiles: [
        ...currentSnapshot.profiles,
        { ...focused, id: "hash", name: "#Archive" },
        { ...focused, id: "alpha", name: "alpha" },
        { ...focused, id: "cable", name: "cABle" },
        { ...focused, id: "zulu", name: "Zulu" }
      ]
    };
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Profile: Default" }));
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual([
      "Default",
      "#Archive",
      "alpha",
      "cABle",
      "Focused",
      "Zulu"
    ]);

    fireEvent.change(screen.getByRole("textbox", { name: "Search profiles" }), { target: { value: "ab" } });
    expect(await screen.findByRole("option", { name: "cABle" })).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("reapplies a drifted current profile and reports Plugin enablement consistently", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      inventory: {
        ...currentSnapshot.inventory,
        plugins: currentSnapshot.inventory.plugins.map(plugin => ({ ...plugin, enabled: false }))
      },
      drift: { profileId: "default", isDrifted: true, skills: false, plugins: true, mcpServers: false }
    };
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Profile: Default" }));
    fireEvent.click(screen.getByRole("option", { name: "Default" }));
    await waitFor(() => expect(applyClaudeProfile).toHaveBeenCalledWith("default"));
    fireEvent.click(screen.getByRole("button", { name: "Plugins 1" }));

    expect(await screen.findByText("Active now")).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();
    expect(screen.queryByText("Included")).toBeNull();
  });

  it("shows unavailable profile members in both the tab count and read-only list", async () => {
    const defaultProfile = currentSnapshot.profiles[0];
    currentSnapshot = {
      ...currentSnapshot,
      profiles: currentSnapshot.profiles.map(profile => profile.id === defaultProfile.id
        ? { ...profile, skills: [...profile.skills, "skill:retired-skill"] }
        : profile)
    };
    renderPage();

    expect(await screen.findByRole("button", { name: "Skills 2001" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search Skills"), { target: { value: "retired-skill" } });

    expect(await screen.findByText("No longer available in the current environment")).toBeTruthy();
    expect(screen.getByText("Inactive now")).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();
  });

  it("does not search hidden resource details in the main list or editor", async () => {
    currentSnapshot = {
      ...currentSnapshot,
      inventory: {
        ...currentSnapshot.inventory,
        skills: currentSnapshot.inventory.skills.map((skill, index) => index === 0
          ? { ...skill, description: "private-only-token" }
          : skill)
      }
    };
    const view = renderPage({ ...defaultSettings, hideSensitiveContent: true });
    await screen.findByRole("button", { name: "Profile: Default" });

    fireEvent.change(screen.getByPlaceholderText("Search Skills"), { target: { value: "private-only-token" } });
    await waitFor(() => expect(view.container.querySelector('[data-resource-id="skill:skill-0"]')).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.change(await screen.findByPlaceholderText("Search Skills"), { target: { value: "private-only-token" } });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove skill-0" })).toBeNull());
  });

  it("starts an empty profile with every resource unselected", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Profile: Default" });

    fireEvent.click(screen.getByRole("button", { name: "New profile" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Empty profile/ }));

    expect(await screen.findByRole("heading", { name: "New profile" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bioinformatics" } });
    fireEvent.change(screen.getByPlaceholderText("Search Skills"), { target: { value: "skill-1999" } });
    fireEvent.click(await screen.findByRole("button", { name: "Select skill-1999" }));
    expect(await screen.findByRole("button", { name: "Remove skill-1999" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveClaudeProfile).toHaveBeenCalledTimes(1));
    expect(saveClaudeProfile.mock.calls[0][0].skills).toEqual(["skill:skill-1999"]);
    await waitFor(() => expect(applyClaudeProfile).toHaveBeenCalledWith("created"));
  });

  it("creates a new profile by copying the selected membership", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Profile: Default" });

    fireEvent.click(screen.getByRole("button", { name: "New profile" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy selected/ }));

    expect(await screen.findByText("New profile")).toBeTruthy();
    expect(screen.getByDisplayValue("Default copy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveClaudeProfile).toHaveBeenCalledTimes(1));
    const input = saveClaudeProfile.mock.calls[0][0];
    expect(input.id).toBeUndefined();
    expect(input.skills).toHaveLength(2000);
    expect(input.plugins).toEqual(["plugin:review@market"]);
    expect(input.mcpServers).toEqual(["mcp:filesystem"]);
    await waitFor(() => expect(applyClaudeProfile).toHaveBeenCalledWith("created"));
  });

  it("switches to Default before deleting the current custom profile", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Profile: Default" }));

    fireEvent.click(screen.getByRole("option", { name: "Focused" }));
    await waitFor(() => expect(applyClaudeProfile).toHaveBeenCalledWith("focused"));
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText('Default will become current, then “Focused” will be permanently deleted.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    await waitFor(() => expect(applyClaudeProfile).toHaveBeenCalledWith("default"));
    await waitFor(() => expect(deleteClaudeProfile).toHaveBeenCalledWith("focused"));
  });

  it("pauses profile mutations while MCP state is unreadable", async () => {
    currentSnapshot = makeSnapshot("config-unreadable");
    renderPage();

    expect(await screen.findByText("~/.claude.json is temporarily unreadable. Profile actions are paused.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Edit profile" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "New profile" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
