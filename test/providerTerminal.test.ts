import { describe, expect, it } from "vitest";
import { buildProviderTerminalArtifacts, providerTerminalEnv } from "../src/main/providerTerminal";

describe("providerTerminalEnv", () => {
  it("keeps string and finite-number env entries and drops the rest", () => {
    expect(providerTerminalEnv({ env: { A: "x", B: 42, C: null, D: {}, E: true, F: NaN } }))
      .toEqual({ A: "x", B: "42" });
  });

  it("returns an empty map when env is missing or malformed", () => {
    expect(providerTerminalEnv({})).toEqual({});
    expect(providerTerminalEnv(null)).toEqual({});
    expect(providerTerminalEnv({ env: "nope" })).toEqual({});
    expect(providerTerminalEnv({ env: ["a"] })).toEqual({});
  });
});

describe("buildProviderTerminalArtifacts", () => {
  const configFile = "C:\\Temp\\chara-desk-claude-demo-1234.json";

  it("puts the env in a --settings JSON and never inlines it in the batch", () => {
    const { settingsJson, batContent } = buildProviderTerminalArtifacts(
      { ANTHROPIC_BASE_URL: "https://api.example.com", ANTHROPIC_AUTH_TOKEN: "sk-secret-token" },
      configFile,
      "Demo Router"
    );

    expect(JSON.parse(settingsJson)).toEqual({
      env: { ANTHROPIC_BASE_URL: "https://api.example.com", ANTHROPIC_AUTH_TOKEN: "sk-secret-token" }
    });

    // The batch references only the config PATH — the token/URL are NOT inline
    // (this is the whole point: no nested quoting through cmd/start).
    expect(batContent).toContain(`claude --settings "${configFile}"`);
    expect(batContent).not.toContain("sk-secret-token");
    expect(batContent).not.toContain("https://api.example.com");

    // Self-cleaning and batch-shaped.
    expect(batContent).toContain(`del "${configFile}" >nul 2>&1`);
    expect(batContent).toContain(`del "%~f0" >nul 2>&1`);
    expect(batContent.startsWith("@echo off\r\n")).toBe(true);
    expect(batContent.split("\n").every(line => line === "" || line.endsWith("\r"))).toBe(true);
  });

  it("writes an empty env object for a provider with no env (official Claude)", () => {
    const { settingsJson } = buildProviderTerminalArtifacts({}, configFile, "Claude Official");
    expect(JSON.parse(settingsJson)).toEqual({ env: {} });
  });

  it("strips batch-unsafe characters from the window title", () => {
    const { batContent } = buildProviderTerminalArtifacts({}, configFile, 'Bad & Name | <redirect> "q"');
    const titleLine = batContent.split("\r\n").find(line => line.startsWith("title "))!;
    expect(titleLine).toBe("title Chara Desk - Claude - Bad Name redirect q");
    expect(titleLine).not.toMatch(/[&|<>"]/);
  });

  it("falls back to a plain title when the name has no safe characters", () => {
    const { batContent } = buildProviderTerminalArtifacts({}, configFile, "月薪喵");
    expect(batContent).toContain("title Chara Desk - Claude\r\n");
  });
});
