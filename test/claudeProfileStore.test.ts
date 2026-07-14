import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildClaudeProfileInventory,
  createClaudeProfilesSnapshot,
  createInitialClaudeProfileStore,
  getClaudeProfileDrift,
  loadOrCreateClaudeProfileStore,
  parseClaudeProfileStore,
  removeClaudeProfile,
  saveClaudeProfileStore,
  upsertClaudeProfile
} from "../src/main/claudeProfileStore";
import type { ClaudeProfileInventory, ClaudeResourcesSnapshot } from "../src/shared/claudeProfiles";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempFile() {
  const root = mkdtempSync(join(tmpdir(), "chara-profile-store-"));
  tempRoots.push(root);
  return join(root, "claude-profiles.json");
}

function inventory(): ClaudeProfileInventory {
  return {
    skills: [
      { id: "skill:graphify", kind: "skill", name: "graphify", enabled: true },
      { id: "skill:impeccable", kind: "skill", name: "impeccable", enabled: false }
    ],
    plugins: [
      { id: "plugin:review@market", kind: "plugin", name: "review@market", enabled: true },
      { id: "plugin:notify@market", kind: "plugin", name: "notify@market", enabled: false }
    ],
    mcpServers: [
      { id: "mcp:filesystem", kind: "mcp", name: "filesystem", enabled: true }
    ],
    scannedAt: 123
  };
}

function resources(): ClaudeResourcesSnapshot {
  return {
    summary: { skills: 3, plugins: 2, mcp: 1 },
    skills: [
      { id: "skill:graphify", kind: "skill", name: "graphify", enabled: true, source: "claude", skillSource: "personal", detail: "SKILL.md" },
      { id: "skill:impeccable", kind: "skill", name: "impeccable", enabled: false, source: "claude", skillSource: "personal", detail: "SKILL.md" },
      { id: "skill:plugin-owned", kind: "skill", name: "plugin-owned", enabled: true, source: "claude", skillSource: "plugin", pluginId: "review@market" }
    ],
    plugins: [
      { id: "plugin:review@market", kind: "plugin", name: "review@market", enabled: false, source: "claude", scopes: ["user"], detail: "version 1" },
      { id: "plugin:project@market", kind: "plugin", name: "project@market", enabled: true, source: "claude", scopes: ["project"], detail: "version 2" }
    ],
    mcp: [
      { id: "mcp:filesystem", kind: "mcp", name: "filesystem", enabled: true, source: "claude-json", description: "Claude Code MCP server", detail: "url: https://example.test/?token=secret" }
    ],
    scannedAt: 123,
    paths: { claudeDir: "C:/Users/test/.claude", claudeJson: "C:/Users/test/.claude.json" }
  };
}

describe("Claude profile inventory", () => {
  it("exposes only personal Skills and user-scope Plugins", () => {
    const result = buildClaudeProfileInventory(resources());
    expect(result.skills.map(item => item.id)).toEqual(["skill:graphify", "skill:impeccable"]);
    expect(result.plugins.map(item => item.id)).toEqual(["plugin:review@market"]);
    expect(result.plugins[0].enabled).toBe(false);
    expect(result.mcpServers).toEqual([{
      id: "mcp:filesystem",
      kind: "mcp",
      name: "filesystem",
      description: "Claude Code MCP server",
      enabled: true
    }]);
  });

  it("never carries an MCP configuration summary into the profile payload", () => {
    const [server] = buildClaudeProfileInventory(resources()).mcpServers;
    expect(server).not.toHaveProperty("detail");
    expect(JSON.stringify(server)).not.toContain("secret");
  });
});

describe("Claude profile store", () => {
  it("seeds protected Default with every manageable resource", () => {
    const store = createInitialClaudeProfileStore(inventory(), 456);
    expect(store.appliedProfileId).toBe("default");
    expect(store.profiles).toEqual([{
      id: "default",
      name: "Default",
      skills: ["skill:graphify", "skill:impeccable"],
      plugins: ["plugin:review@market", "plugin:notify@market"],
      mcpServers: ["mcp:filesystem"],
      isProtected: true,
      createdAt: 456,
      updatedAt: 456
    }]);
  });

  it("synchronizes an untouched persisted Default with the complete inventory", () => {
    const filePath = tempFile();
    const legacy = createInitialClaudeProfileStore(inventory(), 456);
    legacy.profiles[0].skills = ["skill:graphify"];
    legacy.profiles[0].plugins = [];
    saveClaudeProfileStore(filePath, legacy);

    const snapshot = createClaudeProfilesSnapshot(filePath, resources(), 789);

    expect(snapshot.profiles[0]).toMatchObject({
      skills: ["skill:graphify", "skill:impeccable"],
      plugins: ["plugin:review@market"],
      mcpServers: ["mcp:filesystem"],
      createdAt: 456,
      updatedAt: 456
    });
    expect(parseClaudeProfileStore(JSON.parse(readFileSync(filePath, "utf8"))).profiles[0]).toEqual(snapshot.profiles[0]);
  });

  it("does not overwrite Default after the user has edited it", () => {
    const filePath = tempFile();
    const edited = createInitialClaudeProfileStore(inventory(), 456);
    edited.profiles[0] = {
      ...edited.profiles[0],
      skills: ["skill:graphify"],
      plugins: [],
      updatedAt: 500
    };
    saveClaudeProfileStore(filePath, edited);

    const snapshot = createClaudeProfilesSnapshot(filePath, resources(), 789);

    expect(snapshot.profiles[0]).toEqual(edited.profiles[0]);
  });

  it("creates and updates curated profiles without changing the applied pointer", () => {
    const initial = createInitialClaudeProfileStore(inventory(), 100);
    const created = upsertClaudeProfile(initial, inventory(), {
      name: "Bioinformatics",
      description: "Sequence analysis",
      skills: ["skill:impeccable"],
      plugins: ["plugin:notify@market"],
      mcpServers: []
    }, 200, () => "bio");

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.store.appliedProfileId).toBe("default");
    expect(created.store.profiles[1]).toEqual({
      id: "bio",
      name: "Bioinformatics",
      description: "Sequence analysis",
      skills: ["skill:impeccable"],
      plugins: ["plugin:notify@market"],
      mcpServers: [],
      isProtected: false,
      createdAt: 200,
      updatedAt: 200
    });

    const updated = upsertClaudeProfile(created.store, inventory(), {
      id: "bio",
      name: "Bioinformatics",
      skills: ["skill:graphify"],
      plugins: [],
      mcpServers: ["mcp:filesystem"]
    }, 300);
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.store.profiles[1].createdAt).toBe(200);
    expect(updated.store.profiles[1].updatedAt).toBe(300);
    expect(updated.store.profiles[1].skills).toEqual(["skill:graphify"]);
  });

  it("rejects unsafe profile edits and unknown resource membership", () => {
    const initial = createInitialClaudeProfileStore(inventory(), 100);
    const result = upsertClaudeProfile(initial, inventory(), {
      id: "default",
      name: "Renamed",
      skills: ["skill:missing"],
      plugins: [],
      mcpServers: []
    }, 200);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map(issue => issue.code)).toEqual(["missing-skill", "protected-profile"]);
  });

  it("protects Default and the currently applied profile from deletion", () => {
    const initial = createInitialClaudeProfileStore(inventory(), 100);
    const created = upsertClaudeProfile(initial, inventory(), {
      name: "Focused",
      skills: [],
      plugins: [],
      mcpServers: []
    }, 200, () => "focused");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(removeClaudeProfile(created.store, "default")).toMatchObject({
      ok: false,
      issues: [{ code: "protected-profile" }]
    });
    expect(removeClaudeProfile({ ...created.store, appliedProfileId: "focused" }, "focused")).toMatchObject({
      ok: false,
      issues: [{ code: "applied-profile" }]
    });
    expect(removeClaudeProfile(created.store, "focused")).toMatchObject({
      ok: true,
      profileId: "focused",
      store: { profiles: [{ id: "default" }] }
    });
  });

  it("creates the versioned store once and returns the persisted data later", () => {
    const filePath = tempFile();
    const first = createClaudeProfilesSnapshot(filePath, resources(), 456);
    expect(first.schemaVersion).toBe(1);
    expect(first.inventory.scannedAt).toBe(123);
    expect(first.mcpStatus).toBe("ready");
    expect(first.drift).toEqual({
      profileId: "default",
      isDrifted: true,
      skills: true,
      plugins: true,
      mcpServers: false
    });

    const persistedText = readFileSync(filePath, "utf8");
    expect(persistedText).not.toContain("secret");
    const second = loadOrCreateClaudeProfileStore(filePath, inventory(), 999);
    expect(second).toEqual({
      schemaVersion: first.schemaVersion,
      profiles: first.profiles,
      appliedProfileId: first.appliedProfileId
    });
    expect(readFileSync(filePath, "utf8")).toBe(persistedText);
  });

  it("does not persist an incomplete first Default when MCP state is unreadable", () => {
    const filePath = tempFile();

    const snapshot = createClaudeProfilesSnapshot(filePath, resources(), 456, [], "config-unreadable");

    expect(snapshot.mcpStatus).toBe("config-unreadable");
    expect(snapshot.profiles[0].mcpServers).toEqual([]);
    expect(existsSync(filePath)).toBe(false);
  });

  it("does not report MCP drift from a degraded read of an established store", () => {
    const filePath = tempFile();
    const liveResources = resources();
    liveResources.skills = liveResources.skills.map(skill => ({ ...skill, enabled: true }));
    liveResources.plugins = liveResources.plugins.map(plugin => ({ ...plugin, enabled: true }));
    const healthy = createClaudeProfilesSnapshot(filePath, liveResources, 456);
    const unavailableMcp = healthy.inventory.mcpServers.map(server => ({ ...server, enabled: false }));

    const degraded = createClaudeProfilesSnapshot(
      filePath,
      liveResources,
      789,
      unavailableMcp,
      "config-unreadable"
    );

    expect(degraded.appliedProfileId).toBe("default");
    expect(degraded.mcpStatus).toBe("config-unreadable");
    expect(degraded.drift).toEqual({
      profileId: "default",
      isDrifted: false,
      skills: false,
      plugins: false,
      mcpServers: false
    });
  });

  it("treats an omitted applied-profile pointer as not applied", () => {
    const store = createInitialClaudeProfileStore(inventory(), 456);
    const withoutPointer: Record<string, unknown> = { ...store };
    delete withoutPointer.appliedProfileId;

    expect(parseClaudeProfileStore(withoutPointer)).toEqual({ ...store, appliedProfileId: null });
  });

  it("atomically replaces a valid existing store", () => {
    const filePath = tempFile();
    const initial = createInitialClaudeProfileStore(inventory(), 456);
    saveClaudeProfileStore(filePath, initial);
    const updated = {
      ...initial,
      profiles: [{ ...initial.profiles[0], description: "Captured global defaults", updatedAt: 789 }]
    };
    saveClaudeProfileStore(filePath, updated);
    expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual(updated);
  });

  it("preserves malformed JSON and recreates Default from the live inventory", () => {
    const filePath = tempFile();
    const malformed = '{"schemaVersion":';
    writeFileSync(filePath, malformed, "utf8");
    const recovered = loadOrCreateClaudeProfileStore(filePath, inventory(), 456);
    const root = dirname(filePath);
    const preserved = readdirSync(root).filter(name => name.startsWith("claude-profiles.invalid-") && name.endsWith(".json"));

    expect(recovered).toEqual(createInitialClaudeProfileStore(inventory(), 456));
    expect(preserved).toHaveLength(1);
    expect(readFileSync(join(root, preserved[0]), "utf8")).toBe(malformed);
    expect(parseClaudeProfileStore(JSON.parse(readFileSync(filePath, "utf8")))).toEqual(recovered);
  });

  it("preserves an unsupported schema version before recreating Default", () => {
    const filePath = tempFile();
    const futureStore = '{"schemaVersion":2,"profiles":[{"future":true}]}\n';
    writeFileSync(filePath, futureStore, "utf8");
    const recovered = loadOrCreateClaudeProfileStore(filePath, inventory(), 789);
    const root = dirname(filePath);
    const preserved = readdirSync(root).filter(name => name.startsWith("claude-profiles.invalid-") && name.endsWith(".json"));

    expect(recovered).toEqual(createInitialClaudeProfileStore(inventory(), 789));
    expect(preserved).toHaveLength(1);
    expect(readFileSync(join(root, preserved[0]), "utf8")).toBe(futureStore);
  });

  it("propagates read failures without quarantining the store path", () => {
    const filePath = tempFile();
    mkdirSync(filePath);

    expect(() => loadOrCreateClaudeProfileStore(filePath, inventory(), 456)).toThrow();
    expect(statSync(filePath).isDirectory()).toBe(true);
    expect(readdirSync(dirname(filePath)).filter(name => name.startsWith("claude-profiles.invalid-"))).toEqual([]);
  });

  it("rejects duplicate resource membership", () => {
    const store = createInitialClaudeProfileStore(inventory(), 456);
    store.profiles[0].skills.push("skill:graphify");
    expect(() => parseClaudeProfileStore(store)).toThrow("Duplicate Claude profile skills");
  });

  it("marks a crash-time partial apply as drift instead of trusting the pointer", () => {
    const persisted = createInitialClaudeProfileStore(inventory(), 456);
    const current = inventory();
    current.skills = current.skills.map(skill => ({ ...skill, enabled: true }));
    current.plugins = current.plugins.map(plugin => ({ ...plugin, enabled: true }));
    current.mcpServers = [
      { id: "mcp:filesystem", kind: "mcp", name: "filesystem", enabled: false },
      { id: "mcp:browser", kind: "mcp", name: "browser", enabled: true }
    ];

    expect(getClaudeProfileDrift(persisted, current)).toEqual({
      profileId: "default",
      isDrifted: true,
      skills: false,
      plugins: false,
      mcpServers: true
    });
  });
});
