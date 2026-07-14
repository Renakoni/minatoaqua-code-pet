import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync } from "node:fs";
import {
  CLAUDE_PROFILE_SCHEMA_VERSION,
  DEFAULT_CLAUDE_PROFILE_ID,
  type ClaudeProfile,
  type ClaudeProfileDrift,
  type ClaudeProfileInventory,
  type ClaudeProfileMcpStatus,
  type ClaudeProfileOperationIssue,
  type ClaudeProfileResource,
  type ClaudeProfileStoreData,
  type ClaudeProfilesSnapshot,
  type ClaudeResourceItem,
  type ClaudeResourcesSnapshot
} from "../shared/claudeProfiles";
import { writeTextFileAtomic } from "./filePersistence";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ClaudeProfileStoreMutationResult =
  | { ok: true; profileId: string; store: ClaudeProfileStoreData }
  | { ok: false; issues: ClaudeProfileOperationIssue[] };

function mutationIssue(code: string, message: string, resourceId?: string): ClaudeProfileOperationIssue {
  return { code, message, ...(resourceId ? { resourceId } : {}) };
}

function parseMutationMembership(
  value: unknown,
  field: "skills" | "plugins" | "mcpServers",
  inventory: ClaudeProfileInventory,
  issues: ClaudeProfileOperationIssue[]
): string[] | null {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim()) || new Set(value).size !== value.length) {
    issues.push(mutationIssue("invalid-profile-input", `Claude profile ${field} must be a unique string list.`));
    return null;
  }
  const ids = new Set(inventory[field].map(item => item.id));
  const missingCode = field === "skills" ? "missing-skill" : field === "plugins" ? "missing-plugin" : "missing-mcp-server";
  for (const resourceId of value) {
    if (!ids.has(resourceId)) issues.push(mutationIssue(missingCode, `Claude profile references missing resource ${resourceId}.`, resourceId));
  }
  return [...value];
}

export function upsertClaudeProfile(
  store: ClaudeProfileStoreData,
  inventory: ClaudeProfileInventory,
  input: unknown,
  now = Date.now(),
  createId: () => string = randomUUID
): ClaudeProfileStoreMutationResult {
  if (!isPlainObject(input)) {
    return { ok: false, issues: [mutationIssue("invalid-profile-input", "Claude profile input must be an object.")] };
  }

  const issues: ClaudeProfileOperationIssue[] = [];
  const id = input.id === undefined ? undefined : typeof input.id === "string" && input.id.trim() === input.id && input.id
    ? input.id
    : null;
  if (id === null) issues.push(mutationIssue("invalid-profile-input", "Claude profile id is invalid."));

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 64) issues.push(mutationIssue("invalid-profile-input", "Claude profile name must be 1 to 64 characters."));

  const description = input.description === undefined ? undefined : typeof input.description === "string" ? input.description.trim() : null;
  if (description === null || (description?.length ?? 0) > 240) {
    issues.push(mutationIssue("invalid-profile-input", "Claude profile description must be at most 240 characters."));
  }

  const skills = parseMutationMembership(input.skills, "skills", inventory, issues);
  const plugins = parseMutationMembership(input.plugins, "plugins", inventory, issues);
  const mcpServers = parseMutationMembership(input.mcpServers, "mcpServers", inventory, issues);
  const existing = id ? store.profiles.find(profile => profile.id === id) : undefined;
  if (id && !existing) issues.push(mutationIssue("invalid-profile-reference", `Claude profile ${id} does not exist.`));
  if (existing?.isProtected && name !== existing.name) {
    issues.push(mutationIssue("protected-profile", "The protected Default profile cannot be renamed."));
  }
  if (store.profiles.some(profile => profile.id !== id && profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    issues.push(mutationIssue("duplicate-profile-name", `A Claude profile named ${name} already exists.`));
  }
  if (issues.length > 0 || !skills || !plugins || !mcpServers || description === null) return { ok: false, issues };

  const profileId = existing?.id ?? createId();
  if (!existing && store.profiles.some(profile => profile.id === profileId)) {
    return { ok: false, issues: [mutationIssue("duplicate-profile-id", "A generated Claude profile id already exists.")] };
  }
  const profile: ClaudeProfile = {
    id: profileId,
    name: existing?.isProtected ? existing.name : name,
    ...(description ? { description } : {}),
    skills,
    plugins,
    mcpServers,
    isProtected: existing?.isProtected ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  return {
    ok: true,
    profileId,
    store: {
      ...store,
      profiles: existing
        ? store.profiles.map(item => item.id === profileId ? profile : item)
        : [...store.profiles, profile]
    }
  };
}

export function removeClaudeProfile(store: ClaudeProfileStoreData, profileId: unknown): ClaudeProfileStoreMutationResult {
  if (typeof profileId !== "string" || !profileId.trim()) {
    return { ok: false, issues: [mutationIssue("invalid-profile-reference", "Claude profile id is invalid.")] };
  }
  const profile = store.profiles.find(item => item.id === profileId);
  if (!profile) {
    return { ok: false, issues: [mutationIssue("invalid-profile-reference", `Claude profile ${profileId} does not exist.`)] };
  }
  if (profile.isProtected) {
    return { ok: false, issues: [mutationIssue("protected-profile", "The protected Default profile cannot be deleted.")] };
  }
  if (store.appliedProfileId === profileId) {
    return { ok: false, issues: [mutationIssue("applied-profile", "Apply another profile before deleting this one.")] };
  }
  return {
    ok: true,
    profileId,
    store: { ...store, profiles: store.profiles.filter(item => item.id !== profileId) }
  };
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

function membershipDiffers(expected: string[], resources: ClaudeProfileResource[]) {
  const active = new Set(resources.filter(item => item.enabled).map(item => item.id));
  return expected.length !== active.size || expected.some(id => !active.has(id));
}

export function getClaudeProfileDrift(
  store: ClaudeProfileStoreData,
  inventory: ClaudeProfileInventory,
  mcpStatus: ClaudeProfileMcpStatus = "ready"
): ClaudeProfileDrift {
  const profileId = store.appliedProfileId;
  if (profileId === null) {
    return { profileId: null, isDrifted: false, skills: false, plugins: false, mcpServers: false };
  }
  const profile = store.profiles.find(item => item.id === profileId);
  if (!profile) {
    return { profileId, isDrifted: true, skills: true, plugins: true, mcpServers: true };
  }
  const skills = membershipDiffers(profile.skills, inventory.skills);
  const plugins = membershipDiffers(profile.plugins, inventory.plugins);
  const mcpServers = mcpStatus === "ready" && membershipDiffers(profile.mcpServers, inventory.mcpServers);
  return { profileId, isDrifted: skills || plugins || mcpServers, skills, plugins, mcpServers };
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
  now = Date.now(),
  mcpServers?: ClaudeProfileResource[],
  mcpStatus: ClaudeProfileMcpStatus = "ready"
): ClaudeProfilesSnapshot {
  const scannedInventory = buildClaudeProfileInventory(resources);
  const inventory = mcpServers ? { ...scannedInventory, mcpServers } : scannedInventory;
  // Do not persist a first Default captured from an incomplete MCP read. A
  // later healthy snapshot will seed the store from the complete live state.
  const store = mcpStatus !== "ready" && !existsSync(filePath)
    ? createInitialClaudeProfileStore(inventory, now)
    : loadOrCreateClaudeProfileStore(filePath, inventory, now);
  return { ...store, inventory, drift: getClaudeProfileDrift(store, inventory, mcpStatus), mcpStatus };
}
