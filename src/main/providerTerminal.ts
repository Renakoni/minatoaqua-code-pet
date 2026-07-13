// Artifacts for opening a Claude Code terminal pinned to a provider's config.
//
// Adopts cc-switch's approach: the provider's env goes into a temp settings
// JSON loaded with `claude --settings <file>`, and a temp .bat runs that and
// deletes both files afterwards. The OS launch command then references only a
// file PATH — it never inlines env values through cmd/start/powershell, which
// mangles nested quotes (the old bug: `$env:X="url"; claude` came out broken).

export interface ProviderTerminalArtifacts {
  settingsJson: string;
  batContent: string;
}

/** The provider's env as a plain string map: string values kept, finite
 *  numbers stringified, everything else dropped. */
export function providerTerminalEnv(settingsConfig: unknown): Record<string, string> {
  const env = settingsConfig && typeof settingsConfig === "object" && !Array.isArray(settingsConfig)
    ? (settingsConfig as Record<string, unknown>).env
    : undefined;
  const out: Record<string, string> = {};
  if (env && typeof env === "object" && !Array.isArray(env)) {
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) out[key] = String(value);
    }
  }
  return out;
}

/**
 * The settings JSON and the batch script. `configFile` is a temp path we
 * generate, so it can never contain batch metacharacters; env values live in
 * the JSON (which handles any string), so nothing sensitive is inlined into
 * the script command line.
 */
export function buildProviderTerminalArtifacts(
  env: Record<string, string>,
  configFile: string,
  providerName: string
): ProviderTerminalArtifacts {
  const settingsJson = JSON.stringify({ env }, null, 2);
  // Window title: keep only characters that are safe on a batch `title` line.
  const label = providerName.replace(/[^\w \-]/g, "").replace(/\s+/g, " ").trim();
  const title = label ? `Chara Desk - Claude - ${label}` : "Chara Desk - Claude";
  // CRLF for a .bat. cmd /K keeps the window open after claude exits, at which
  // point the two temp files remove themselves.
  const batContent = [
    "@echo off",
    `title ${title}`,
    `cd /d "%USERPROFILE%"`,
    `claude --settings "${configFile}"`,
    `del "${configFile}" >nul 2>&1`,
    `del "%~f0" >nul 2>&1`,
    ""
  ].join("\r\n");
  return { settingsJson, batContent };
}
