import { describe, expect, it } from "vitest";
import { buildProviderTerminalLaunch, providerTerminalEnv } from "../src/main/providerTerminal";

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

describe("buildProviderTerminalLaunch", () => {
  const providerEnv = {
    ANTHROPIC_BASE_URL: "https://api.example.com",
    ANTHROPIC_AUTH_TOKEN: "sk-secret-token"
  };
  const baseEnv = { PATH: "C:\\Windows", SystemRoot: "C:\\Windows", ANTHROPIC_BASE_URL: "https://default" };

  it("passes provider credentials through env, never on the command line", () => {
    const launch = buildProviderTerminalLaunch(providerEnv, baseEnv, "C:\\Windows\\System32\\cmd.exe");

    // The provider values reach the child only through env...
    expect(launch.env.ANTHROPIC_BASE_URL).toBe("https://api.example.com");
    expect(launch.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-secret-token");

    // ...and never appear on the launched command line (the whole point: no
    // inline quoting to break, no credential file). The args are constant.
    expect(launch.file).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(launch.args).toEqual(["/K", "claude"]);
    expect(JSON.stringify(launch.args)).not.toContain("sk-secret-token");
    expect(JSON.stringify(launch.args)).not.toContain("https://api.example.com");
  });

  it("layers the provider env over the inherited base env", () => {
    const launch = buildProviderTerminalLaunch(providerEnv, baseEnv, "cmd.exe");
    // Inherited entries survive (spawn replaces env wholesale, so claude still
    // needs PATH etc.)...
    expect(launch.env.PATH).toBe("C:\\Windows");
    expect(launch.env.SystemRoot).toBe("C:\\Windows");
    // ...and the provider's routing wins over any inherited value.
    expect(launch.env.ANTHROPIC_BASE_URL).toBe("https://api.example.com");
  });

  it("drops undefined base env values", () => {
    const launch = buildProviderTerminalLaunch({}, { A: "x", B: undefined }, "cmd.exe");
    expect(launch.env).toEqual({ A: "x" });
  });

  it("falls back to cmd.exe when the comspec is empty", () => {
    expect(buildProviderTerminalLaunch({}, {}, "").file).toBe("cmd.exe");
  });

  it("returns independent, file-free launches for repeated opens of one provider", () => {
    const first = buildProviderTerminalLaunch(providerEnv, baseEnv, "cmd.exe");
    const second = buildProviderTerminalLaunch(providerEnv, baseEnv, "cmd.exe");

    // Nothing is written to disk, so there are no temp paths to collide over or
    // delete out from under each other — no .bat/.json/%TEMP% artifact anywhere.
    const serialized = JSON.stringify(first) + JSON.stringify(second);
    expect(serialized).not.toMatch(/\.bat|\.json|temp|tmp/i);

    // Two opens share no mutable state: mutating one never touches the other.
    first.env.ANTHROPIC_AUTH_TOKEN = "mutated";
    first.args.push("injected");
    expect(second.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-secret-token");
    expect(second.args).toEqual(["/K", "claude"]);
  });
});
