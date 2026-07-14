import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function quarantineInvalidJsonFile(filePath: string, now: number, label: string) {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const basePath = filePath.toLowerCase().endsWith(".json") ? filePath.slice(0, -5) : filePath;
  const preservedPath = `${basePath}.invalid-${stamp}-${randomUUID()}.json`;
  renameSync(filePath, preservedPath);
  console.warn(`Invalid ${label} preserved at ${preservedPath}`);
}

export function backupJsonFile(filePath: string, now = Date.now()) {
  if (!existsSync(filePath)) return null;
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const basePath = filePath.toLowerCase().endsWith(".json") ? filePath.slice(0, -5) : filePath;
  const backupPath = `${basePath}.clawd-backup-${stamp}.json`;
  copyFileSync(filePath, backupPath);
  return backupPath;
}

export function writeFileAtomic(filePath: string, contents: string | Uint8Array) {
  const parent = dirname(filePath);
  mkdirSync(parent, { recursive: true });
  const tempPath = join(parent, `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(tempPath, contents);
    renameSync(tempPath, filePath);
  } finally {
    try { rmSync(tempPath, { force: true }); } catch { /* best-effort temp cleanup */ }
  }
}

export function writeTextFileAtomic(filePath: string, contents: string) {
  writeFileAtomic(filePath, contents);
}
