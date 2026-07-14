import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupJsonFile } from "../src/main/filePersistence";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("JSON backup retention", () => {
  it("keeps only the five newest backups for a settings file", () => {
    const root = mkdtempSync(join(tmpdir(), "chara-backup-retention-"));
    tempRoots.push(root);
    const filePath = join(root, "settings.json");
    const start = Date.UTC(2026, 0, 1);

    for (let index = 0; index < 7; index += 1) {
      writeFileSync(filePath, JSON.stringify({ token: `secret-${index}` }), "utf8");
      backupJsonFile(filePath, start + index * 1000);
    }

    const backups = readdirSync(root)
      .filter(name => name.startsWith("settings.clawd-backup-") && name.endsWith(".json"))
      .sort();
    expect(backups).toHaveLength(5);
    expect(backups.some(name => readFileSync(join(root, name), "utf8").includes("secret-0"))).toBe(false);
    expect(backups.some(name => readFileSync(join(root, name), "utf8").includes("secret-1"))).toBe(false);
    expect(backups.some(name => readFileSync(join(root, name), "utf8").includes("secret-6"))).toBe(true);
  });
});
