import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export function backupPathFor(path: string): string {
  return `${path}.bak`;
}

export function writeJsonAtomic(path: string, value: unknown, space?: number): void {
  const tempPath = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(tempPath, JSON.stringify(value, null, space));
    if (existsSync(path)) copyFileSync(path, backupPathFor(path));
    renameSync(tempPath, path);
  } catch (error) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch { /* ignore cleanup failure */ }
    throw error;
  }
}

export function readJsonWithBackup<T>(path: string): T | null {
  const primary = readJsonFile<T>(path);
  if (primary.ok) return primary.value;
  const backup = readJsonFile<T>(backupPathFor(path));
  return backup.ok ? backup.value : null;
}

function readJsonFile<T>(path: string): { ok: true; value: T } | { ok: false } {
  if (!existsSync(path)) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) as T };
  } catch {
    return { ok: false };
  }
}
