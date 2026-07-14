export type ClaudeResourceKind = "skill" | "plugin" | "mcp";
export type ClaudeSkillSource = "personal" | "plugin";
export type ClaudePluginScope = "user" | "project" | "local" | "unknown";

export type ClaudeResourceItem = {
  id: string;
  kind: ClaudeResourceKind;
  name: string;
  description?: string;
  path?: string;
  enabled?: boolean;
  source: "claude" | "claude-json" | "unknown";
  detail?: string;
  skillSource?: ClaudeSkillSource;
  pluginId?: string;
  scopes?: ClaudePluginScope[];
};

export type ClaudeResourcesSnapshot = {
  summary: { skills: number; plugins: number; mcp: number };
  skills: ClaudeResourceItem[];
  plugins: ClaudeResourceItem[];
  mcp: ClaudeResourceItem[];
  scannedAt: number;
  paths: {
    claudeDir: string;
    claudeJson: string;
    projectsDir?: string;
  };
};

export type ClaudeProfileResource = {
  id: string;
  kind: ClaudeResourceKind;
  name: string;
  description?: string;
  detail?: string;
  enabled: boolean;
};

export type ClaudeProfileInventory = {
  skills: ClaudeProfileResource[];
  plugins: ClaudeProfileResource[];
  mcpServers: ClaudeProfileResource[];
  scannedAt: number;
};

export type ClaudeProfile = {
  id: string;
  name: string;
  description?: string;
  skills: string[];
  plugins: string[];
  mcpServers: string[];
  isProtected: boolean;
  createdAt: number;
  updatedAt: number;
};

export const CLAUDE_PROFILE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_CLAUDE_PROFILE_ID = "default";

export type ClaudeProfileStoreData = {
  schemaVersion: typeof CLAUDE_PROFILE_SCHEMA_VERSION;
  profiles: ClaudeProfile[];
  appliedProfileId: string | null;
};

export type ClaudeProfileDrift = {
  profileId: string | null;
  isDrifted: boolean;
  skills: boolean;
  plugins: boolean;
  mcpServers: boolean;
};

export type ClaudeProfileMcpStatus = "ready" | "config-unreadable" | "inventory-unreadable";

export type ClaudeProfilesSnapshot = ClaudeProfileStoreData & {
  inventory: ClaudeProfileInventory;
  drift: ClaudeProfileDrift;
  mcpStatus: ClaudeProfileMcpStatus;
};

export function createEmptyClaudeProfilesSnapshot(scannedAt = 0): ClaudeProfilesSnapshot {
  return {
    schemaVersion: CLAUDE_PROFILE_SCHEMA_VERSION,
    profiles: [{
      id: DEFAULT_CLAUDE_PROFILE_ID,
      name: "Default",
      skills: [],
      plugins: [],
      mcpServers: [],
      isProtected: true,
      createdAt: 0,
      updatedAt: 0
    }],
    appliedProfileId: DEFAULT_CLAUDE_PROFILE_ID,
    inventory: { skills: [], plugins: [], mcpServers: [], scannedAt },
    drift: { profileId: DEFAULT_CLAUDE_PROFILE_ID, isDrifted: false, skills: false, plugins: false, mcpServers: false },
    mcpStatus: "ready"
  };
}

export type ClaudeProfileSaveInput = {
  id?: string;
  name: string;
  description?: string;
  skills: string[];
  plugins: string[];
  mcpServers: string[];
};

export type ClaudeProfileOperationIssue = {
  code: string;
  message: string;
  resourceId?: string;
  target?: "settings" | "mcp";
};

export type ClaudeProfileChanges = {
  enable: string[];
  disable: string[];
};

export type ClaudeProfilePreviewResult =
  | {
      ok: true;
      profileId: string;
      changes: {
        skills: ClaudeProfileChanges;
        plugins: ClaudeProfileChanges;
        mcpServers: ClaudeProfileChanges;
      };
    }
  | { ok: false; issues: ClaudeProfileOperationIssue[] };

export type ClaudeProfileMutationResult =
  | { ok: true; profileId: string; snapshot: ClaudeProfilesSnapshot }
  | { ok: false; issues: ClaudeProfileOperationIssue[] };
