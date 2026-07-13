import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";
import { awaitTerminalLaunch, buildProviderTerminalLaunch, claudeIsAvailable, isUncPath, launchDetachedTerminal, providerTerminalEnv } from "../src/main/providerTerminal";

// A stand-in for child_process.spawn: returns an EventEmitter (plus the unref the
// launcher calls) and fires the chosen event on the next microtask, after the code
// under test has attached its listeners. `capture` sees the spawn options.
type FakeSpawn = Parameters<typeof launchDetachedTerminal>[3];
function fakeSpawn(
  act: (child: EventEmitter & { unref(): void }) => void,
  capture?: (options: Record<string, unknown>) => void
): FakeSpawn {
  return ((_file: string, _args: string[], options: Record<string, unknown>) => {
    capture?.(options);
    const child = Object.assign(new EventEmitter(), { unref() {} });
    queueMicrotask(() => act(child));
    return child;
  }) as unknown as FakeSpawn;
}

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

  it("lets a provider PATH override the inherited one despite case differences", () => {
    // Windows env is case-insensitive, so an inherited "Path" and a provider
    // "PATH" must collapse to one key with the provider's value — otherwise the
    // OS could pick the inherited one and claude would resolve against the wrong PATH.
    const launch = buildProviderTerminalLaunch(
      { PATH: "C:\\provider\\bin" },
      { Path: "C:\\Windows;C:\\inherited", SystemRoot: "C:\\Windows" },
      "cmd.exe"
    );
    const pathKeys = Object.keys(launch.env).filter(key => key.toLowerCase() === "path");
    expect(pathKeys).toEqual(["PATH"]);
    expect(launch.env.PATH).toBe("C:\\provider\\bin");
    expect(launch.env.SystemRoot).toBe("C:\\Windows");
  });
});

describe("awaitTerminalLaunch", () => {
  it("resolves once the child reports it has spawned", async () => {
    const child = new EventEmitter();
    const launched = awaitTerminalLaunch(child as unknown as ChildProcess);
    child.emit("spawn");
    await expect(launched).resolves.toBeUndefined();
  });

  it("rejects with the error when the child fails to launch", async () => {
    const child = new EventEmitter();
    const launched = awaitTerminalLaunch(child as unknown as ChildProcess);
    const failure = new Error("spawn cmd.exe ENOENT");
    child.emit("error", failure);
    await expect(launched).rejects.toBe(failure);
  });

  it("handles the failure as a rejection, never an unhandled 'error' event", () => {
    // A listener is attached synchronously, so a launch failure rejects the
    // promise instead of throwing an uncaught exception that would crash main.
    const child = new EventEmitter();
    const launched = awaitTerminalLaunch(child as unknown as ChildProcess);
    expect(() => child.emit("error", new Error("boom"))).not.toThrow();
    return expect(launched).rejects.toThrow("boom");
  });
});

describe("isUncPath", () => {
  it("flags UNC network paths so the terminal can't launch in the wrong place", () => {
    // cmd.exe rejects these as a cwd and falls back to C:\Windows, so they must
    // never reach spawn — a valid-but-unsupported UNC dir would be a false success.
    expect(isUncPath("\\\\server\\share\\project")).toBe(true);
    expect(isUncPath("//server/share")).toBe(true);
    expect(isUncPath("\\\\?\\UNC\\server\\share\\project")).toBe(true);
    expect(isUncPath("\\\\?\\unc\\server\\share")).toBe(true); // case-insensitive
    expect(isUncPath("\\\\server")).toBe(true);
  });

  it("accepts local drive paths, including extended-length local paths", () => {
    expect(isUncPath("C:\\Users\\me\\project")).toBe(false);
    expect(isUncPath("D:\\project")).toBe(false);
    expect(isUncPath("\\\\?\\C:\\Users\\me\\project")).toBe(false);
    expect(isUncPath("  C:\\trimmed  ")).toBe(false);
    expect(isUncPath("")).toBe(false);
  });
});

describe("launchDetachedTerminal", () => {
  it("resolves ok once the terminal actually spawns", async () => {
    const result = await launchDetachedTerminal("cmd.exe", ["/K", "claude"], {}, fakeSpawn(child => child.emit("spawn")));
    expect(result).toEqual({ ok: true });
  });

  it("returns { ok:false, error } when the launch fails asynchronously (the resume + provider path)", async () => {
    const result = await launchDetachedTerminal(
      "cmd.exe", ["/K", "claude"], {},
      fakeSpawn(child => child.emit("error", new Error("spawn cmd.exe ENOENT")))
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ENOENT");
  });

  it("spawns a detached, visible console and forwards cwd/env", async () => {
    let seen: Record<string, unknown> | undefined;
    await launchDetachedTerminal(
      "cmd.exe", ["/K", "claude"], { cwd: "C:\\proj", env: { PATH: "C:\\x" } },
      fakeSpawn(child => child.emit("spawn"), options => { seen = options; })
    );
    expect(seen).toMatchObject({ cwd: "C:\\proj", env: { PATH: "C:\\x" }, detached: true, windowsHide: false, stdio: "ignore" });
  });
});

describe("claudeIsAvailable", () => {
  it("reports available when where.exe resolves claude (exit 0)", async () => {
    expect(await claudeIsAvailable({ PATH: "C:\\cli" }, fakeSpawn(child => child.emit("close", 0)))).toBe(true);
  });

  it("reports unavailable when where.exe can't find claude (exit 1)", async () => {
    expect(await claudeIsAvailable({ PATH: "C:\\nope" }, fakeSpawn(child => child.emit("close", 1)))).toBe(false);
  });

  it("fails open when the probe itself can't run", async () => {
    expect(await claudeIsAvailable({}, fakeSpawn(child => child.emit("error", new Error("no where.exe"))))).toBe(true);
  });

  it("probes with the effective env, so a provider PATH override is what claude is checked against", async () => {
    let seen: Record<string, unknown> | undefined;
    await claudeIsAvailable({ PATH: "C:\\provider\\bin" }, fakeSpawn(child => child.emit("close", 0), options => { seen = options; }));
    expect(seen).toMatchObject({ env: { PATH: "C:\\provider\\bin" } });
  });
});
