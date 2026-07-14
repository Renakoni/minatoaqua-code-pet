import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync } from "node:fs";
import {
  CLAUDE_PROFILE_SCHEMA_VERSION,
  DEFAULT_CLAUDE_PROFILE_ID,
  type ClaudeProfile,
  type ClaudeProfileInventory,
  type ClaudeProfileStoreData,
  type ClaudeProfilesSnapshot,
  type ClaudeResourceItem,
  type ClaudeResourcesSnapshot
} from "../shared/claudeProfiles";
import { writeTextFileAtomic } from "./filePersistence";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
    throw new Error(`Invalid Claude profile ${field}`);
  }
  if (new Set(value).size !== value.length) throw new Error(`Duplicate Claude profile ${field}`);
  return [...value];
}

function requireTimestamp(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid Claude profile ${field}`);
  }
  return value;
}

function parseProfile(value: unknown): ClaudeProfile {
  if (!isPlainObject(value)) throw new Error("Invalid Claude profile record");
  if (typeof value.id !== "string" || !value.id.trim()) throw new Error("Invalid Claude profile id");
  if (typeof value.name !== "string" || !value.name.trim()) throw new Error("Invalid Claude profile name");
  if (value.description !== undefined && typeof value.description !== "string") throw new Error("Invalid Claude profile description");
  if (typeof value.isProtected !== "boolean") throw new Error("Invalid Claude profile protection flag");
  return {
    id: value.id,
    name: value.name,
    ...(value.description === undefined ? {} : { description: value.description }),
    skills: requireStringList(value.skills, "skills"),
    plugins: requireStringList(value.plugins, "plugins"),
    mcpServers: requireStringList(value.mcpServers, "mcpServers"),
    isProtected: value.isProtected,
    createdAt: requireTimestamp(value.createdAt, "createdAt"),
    updatedAt: requireTimestamp(value.updatedAt, "updatedAt")
  };
}

export function parseClaudeProfileStore(value: unknown): ClaudeProfileStoreData {
  if (!isPlainObject(value) || value.schemaVersion !== CLAUDE_PROFILE_SCHEMA_VERSION || !Array.isArray(value.profiles)) {
    throw new Error("Unsupported or invalid Claude profile store");
  }
  const profiles = value.profiles.map(parseProfile);
  const ids = new Set(profiles.map(profile => profile.id));
  if (ids.size !== profiles.length) throw new Error("Duplicate Claude profile id");
  const defaultProfile = profiles.find(profile => profile.id === DEFAULT_CLAUDE_PROFILE_ID);
  if (!defaultProfile || !defaultProfile.isProtected) throw new Error("Protected Default Claude profile is missing");
  const appliedProfileId = value.appliedProfileId ?? null;
  if (appliedProfileId !== null && (typeof appliedProfileId !== "string" || !ids.has(appliedProfileId))) {
    throw new Error("Applied Claude profile does not exist");
  }
  return { schemaVersion: CLAUDE_PROFILE_SCHEMA_VERSION, profiles, appliedProfileId };
}

function profileResource(item: ClaudeResourceItem, includeDetail = true) {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    ...(item.description ? { description: item.description } : {}),
    ...(includeDetail && item.detail ? { detail: item.detail } : {}),
    enabled: item.enabled !== false
  };
}

export function buildClaudeProfileInventory(resources: ClaudeResourcesSnapshot): ClaudeProfileInventory {
  return {
    skills: resources.skills
      .filter(item => item.skillSource === "personal")
      .map(item => profileResource(item)),
    plugins: resources.plugins
      .filter(item => item.scopes?.includes("user"))
      .map(item => profileResource(item)),
    // MCP definitions may contain credentials. The profile inventory exposes
    // only the server identity and generic description, never config details.
    mcpServers: resources.mcp.map(item => profileResource(item, false)),
    scannedAt: resources.scannedAt
  };
}

export function createInitialClaudeProfileStore(inventory: ClaudeProfileInventory, now = Date.now()): ClaudeProfileStoreData {
  const defaultProfile: ClaudeProfile = {
    id: DEFAULT_CLAUDE_PROFILE_ID,
    name: "Default",
    skills: inventory.skills.filter(item => item.enabled).map(item => item.id),
    plugins: inventory.plugins.filter(item => item.enabled).map(item => item.id),
    mcpServers: inventory.mcpServers.filter(item => item.enabled).map(item => item.id),
    isProtected: true,
    createdAt: now,
    updatedAt: now
  };
  return {
    schemaVersion: CLAUDE_PROFILE_SCHEMA_VERSION,
    profiles: [defaultProfile],
    appliedProfileId: DEFAULT_CLAUDE_PROFILE_ID
  };
}

export function saveClaudeProfileStore(filePath: string, data: ClaudeProfileStoreData) {
  const validated = parseClaudeProfileStore(data);
  writeTextFileAtomic(filePath, `${JSON.stringify(validated, null, 2)}\n`);
}

function preserveInvalidClaudeProfileStore(filePath: string, now: number) {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const basePath = filePath.toLowerCase().endsWith(".json") ? filePath.slice(0, -5) : filePath;
  const preservedPath = `${basePath}.invalid-${stamp}-${randomUUID()}.json`;
  renameSync(filePath, preservedPath);
  console.warn(`Invalid Claude profile store preserved at ${preservedPath}`);
}

export function loadOrCreateClaudeProfileStore(
  filePath: string,
  inventory: ClaudeProfileInventory,
  now = Date.now()
): ClaudeProfileStoreData {
  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf8");
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parseClaudeProfileStore(parsed);
    } catch {
      // Never overwrite an invalid or unsupported-version store.
      // Preserve it for inspection or a future migration, then recover with a
      // fresh Default captured from the current live Claude inventory.
      preserveInvalidClaudeProfileStore(filePath, now);
    }
  }
  const initial = createInitialClaudeProfileStore(inventory, now);
  saveClaudeProfileStore(filePath, initial);
  return initial;
}

export function createClaudeProfilesSnapshot(
  filePath: string,
  resources: ClaudeResourcesSnapshot,
  now = Date.now()
): ClaudeProfilesSnapshot {
  const inventory = buildClaudeProfileInventory(resources);
  return { ...loadOrCreateClaudeProfileStore(filePath, inventory, now), inventory };
}
