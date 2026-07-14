import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSafeClaudeMcpResources,
  loadClaudeMcpInventory,
  readClaudeMcpLiveConfig,
  synchronizeClaudeMcpInventory
} from "../src/main/claudeMcpInventory";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempFile(name: string) {
  const root = mkdtempSync(join(tmpdir(), "chara-mcp-inventory-"));
  tempRoots.push(root);
  return join(root, name);
}

describe("Claude MCP inventory", () => {
  it("preserves outgoing definitions while exposing only safe identities", () => {
    const inventoryPath = tempFile("claude-mcp-inventory.json");
    const first = synchronizeClaudeMcpInventory(inventoryPath, {
      filesystem: {
        command: "mcp-filesystem",
        env: { ACCESS_TOKEN: "top-secret" },
        headers: { Authorization: "Bearer secret" }
      }
    }, 100);

    expect(first.servers.filesystem).toEqual({
      command: "mcp-filesystem",
      env: { ACCESS_TOKEN: "top-secret" },
      headers: { Authorization: "Bearer secret" }
    });
    expect(readFileSync(inventoryPath, "utf8")).toContain("top-secret");

    const second = synchronizeClaudeMcpInventory(inventoryPath, {
      browser: { url: "https://mcp.example.test", headers: { "X-Token": "new-secret" } }
    }, 200);
    expect(Object.keys(second.servers).sort()).toEqual(["browser", "filesystem"]);

    const safe = buildSafeClaudeMcpResources(second, ["browser"]);
    expect(safe).toEqual([
      { id: "mcp:browser", kind: "mcp", name: "browser", description: "Claude Code MCP server", enabled: true },
      { id: "mcp:filesystem", kind: "mcp", name: "filesystem", description: "Claude Code MCP server", enabled: false }
    ]);
    expect(JSON.stringify(safe)).not.toContain("secret");
    expect(JSON.stringify(safe)).not.toContain("Authorization");
  });

  it("backfills a changed live definition before it becomes inactive", () => {
    const inventoryPath = tempFile("claude-mcp-inventory.json");
    synchronizeClaudeMcpInventory(inventoryPath, {
      server: { url: "https://old.example.test", headers: { Authorization: "old" } }
    }, 100);

    const updated = synchronizeClaudeMcpInventory(inventoryPath, {
      server: { url: "https://new.example.test", headers: { Authorization: "new" } }
    }, 200);

    expect(updated.servers.server).toEqual({
      url: "https://new.example.test",
      headers: { Authorization: "new" }
    });
    expect(updated.updatedAt).toBe(200);
  });

  it("reads only the top-level global MCP map", () => {
    const claudeJsonPath = tempFile(".claude.json");
    mkdirSync(dirname(claudeJsonPath), { recursive: true });
    writeFileSync(claudeJsonPath, JSON.stringify({
      mcpServers: { global: { command: "global-server" } },
      projects: {
        "C:/project": { mcpServers: { project: { command: "project-server" } } }
      }
    }), "utf8");

    const live = readClaudeMcpLiveConfig(claudeJsonPath);
    expect(live.servers).toEqual({ global: { command: "global-server" } });
    expect(live.config.projects).toEqual({
      "C:/project": { mcpServers: { project: { command: "project-server" } } }
    });
  });

  it("does not overwrite an invalid preservation inventory", () => {
    const inventoryPath = tempFile("claude-mcp-inventory.json");
    const malformed = '{"schemaVersion":1,"servers":';
    writeFileSync(inventoryPath, malformed, "utf8");

    expect(() => synchronizeClaudeMcpInventory(inventoryPath, {
      filesystem: { command: "mcp-filesystem" }
    })).toThrow("malformed JSON");
    expect(readFileSync(inventoryPath, "utf8")).toBe(malformed);
    expect(() => loadClaudeMcpInventory(inventoryPath)).toThrow("malformed JSON");
  });
});
