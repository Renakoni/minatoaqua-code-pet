import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildClaudeProfileInventory,
  createClaudeProfilesSnapshot,
  createInitialClaudeProfileStore,
  loadOrCreateClaudeProfileStore,
  parseClaudeProfileStore,
  saveClaudeProfileStore
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
      { id: "plugin:review@market", kind: "plugin", name: "review@market", enabled: true, userEnabled: false, source: "claude", scopes: ["user"], detail: "version 1" },
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
  it("seeds protected Default from the live enabled resources", () => {
    const store = createInitialClaudeProfileStore(inventory(), 456);
    expect(store.appliedProfileId).toBe("default");
    expect(store.profiles).toEqual([{
      id: "default",
      name: "Default",
      skills: ["skill:graphify"],
      plugins: ["plugin:review@market"],
      mcpServers: ["mcp:filesystem"],
      isProtected: true,
      createdAt: 456,
      updatedAt: 456
    }]);
  });

  it("creates the versioned store once and returns the persisted data later", () => {
    const filePath = tempFile();
    const first = createClaudeProfilesSnapshot(filePath, resources(), 456);
    expect(first.schemaVersion).toBe(1);
    expect(first.inventory.scannedAt).toBe(123);

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

  it("rejects malformed persisted data without overwriting it", () => {
    const filePath = tempFile();
    const malformed = '{"schemaVersion":1,"profiles":[],"appliedProfileId":"default"}\n';
    writeFileSync(filePath, malformed, "utf8");
    expect(() => loadOrCreateClaudeProfileStore(filePath, inventory())).toThrow("Protected Default");
    expect(readFileSync(filePath, "utf8")).toBe(malformed);
  });

  it("rejects duplicate resource membership", () => {
    const store = createInitialClaudeProfileStore(inventory(), 456);
    store.profiles[0].skills.push("skill:graphify");
    expect(() => parseClaudeProfileStore(store)).toThrow("Duplicate Claude profile skills");
  });
});
