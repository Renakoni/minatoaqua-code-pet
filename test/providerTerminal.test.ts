import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  awaitTerminalLaunch,
  isUncPath,
  launchDetachedTerminal,
  mergeTerminalEnv,
  normalizeWorkingDirectory,
  providerTerminalEnv,
  resolveClaudeExecutable
} from "../src/main/providerTerminal";

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

describe("mergeTerminalEnv", () => {
  it("layers the provider env over the inherited base env, keeping credentials in env", () => {
    const env = mergeTerminalEnv(
      { ANTHROPIC_BASE_URL: "https://api.example.com", ANTHROPIC_AUTH_TOKEN: "sk-secret-token" },
      { PATH: "C:\\Windows", SystemRoot: "C:\\Windows", ANTHROPIC_BASE_URL: "https://default" }
    );
    expect(env.PATH).toBe("C:\\Windows");
    expect(env.SystemRoot).toBe("C:\\Windows");
    expect(env.ANTHROPIC_BASE_URL).toBe("https://api.example.com"); // provider wins
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-secret-token");
  });

  it("drops undefined base env values", () => {
    expect(mergeTerminalEnv({}, { A: "x", B: undefined })).toEqual({ A: "x" });
  });

  it("lets a provider PATH override the inherited one despite case differences", () => {
    const env = mergeTerminalEnv(
      { PATH: "C:\\provider\\bin" },
      { Path: "C:\\Windows;C:\\inherited", SystemRoot: "C:\\Windows" }
    );
    const pathKeys = Object.keys(env).filter(key => key.toLowerCase() === "path");
    expect(pathKeys).toEqual(["PATH"]); // one key, provider's value — not a duplicate
    expect(env.PATH).toBe("C:\\provider\\bin");
    expect(env.SystemRoot).toBe("C:\\Windows");
  });
});

describe("normalizeWorkingDirectory", () => {
  it("strips the \\?\\ extended-length prefix cmd.exe can't use as a cwd", () => {
    expect(normalizeWorkingDirectory("\\\\?\\C:\\Users\\me\\project")).toBe("C:\\Users\\me\\project");
    expect(normalizeWorkingDirectory("\\\\?\\c:\\p")).toBe("c:\\p");
  });

  it("reduces an extended UNC path to a plain UNC path (still rejected downstream)", () => {
    expect(normalizeWorkingDirectory("\\\\?\\UNC\\server\\share\\p")).toBe("\\\\server\\share\\p");
  });

  it("leaves ordinary drive and UNC paths untouched, just trimmed", () => {
    expect(normalizeWorkingDirectory("C:\\project")).toBe("C:\\project");
    expect(normalizeWorkingDirectory("  C:\\project  ")).toBe("C:\\project");
    expect(normalizeWorkingDirectory("\\\\server\\share")).toBe("\\\\server\\share");
  });
});

describe("resolveClaudeExecutable", () => {
  it("resolves claude from PATH only, so a project-local claude.cmd can't shadow it", () => {
    // A planted claude.cmd exists in the project AND the real one is on PATH. Because
    // the resolver never searches the working directory, the trusted PATH copy wins —
    // cmd.exe runs this absolute path, never the project-local shim, so the provider
    // credentials we pass in `env` can never reach a planted binary.
    const planted = "C:\\evil-project\\claude.cmd";
    const real = "C:\\Program Files\\claude\\claude.cmd";
    const exists = (p: string) => p === planted || p === real;
    const resolved = resolveClaudeExecutable({ PATH: "C:\\Program Files\\claude", PATHEXT: ".CMD" }, exists);
    expect(resolved).toBe(real);
    expect(resolved).not.toBe(planted);
  });

  it("honors PATH order then PATHEXT order, like cmd.exe", () => {
    // Everything "exists": first dir + first extension wins.
    expect(resolveClaudeExecutable({ PATH: "C:\\a;C:\\b", PATHEXT: ".COM;.EXE;.CMD" }, () => true))
      .toBe("C:\\a\\claude.com");
    // Only C:\b\claude.exe exists: skips C:\a, resolves the later dir.
    const only = (p: string) => p === "C:\\b\\claude.exe";
    expect(resolveClaudeExecutable({ PATH: "C:\\a;C:\\b", PATHEXT: ".EXE" }, only)).toBe("C:\\b\\claude.exe");
  });

  it("reads PATH case-insensitively (provider PATH override or inherited Path)", () => {
    const exists = (p: string) => p === "C:\\provider\\bin\\claude.cmd";
    expect(resolveClaudeExecutable({ PATH: "C:\\provider\\bin", PATHEXT: ".CMD" }, exists)).toBe("C:\\provider\\bin\\claude.cmd");
    expect(resolveClaudeExecutable({ Path: "C:\\provider\\bin", PATHEXT: ".CMD" }, exists)).toBe("C:\\provider\\bin\\claude.cmd");
  });

  it("returns null when claude is not found on PATH", () => {
    expect(resolveClaudeExecutable({ PATH: "C:\\nope", PATHEXT: ".CMD" }, () => false)).toBeNull();
    expect(resolveClaudeExecutable({ PATHEXT: ".CMD" }, () => true)).toBeNull(); // no PATH at all
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
    const child = new EventEmitter();
    const launched = awaitTerminalLaunch(child as unknown as ChildProcess);
    expect(() => child.emit("error", new Error("boom"))).not.toThrow();
    return expect(launched).rejects.toThrow("boom");
  });
});

describe("isUncPath", () => {
  it("flags UNC network paths so the terminal can't launch in the wrong place", () => {
    expect(isUncPath("\\\\server\\share\\project")).toBe(true);
    expect(isUncPath("//server/share")).toBe(true);
    expect(isUncPath("\\\\?\\UNC\\server\\share\\project")).toBe(true);
    expect(isUncPath("\\\\?\\unc\\server\\share")).toBe(true);
    expect(isUncPath("\\\\server")).toBe(true);
  });

  it("accepts local drive paths", () => {
    expect(isUncPath("C:\\Users\\me\\project")).toBe(false);
    expect(isUncPath("D:\\project")).toBe(false);
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
      "cmd.exe", ["/K", "C:\\real\\claude.cmd"], { cwd: "C:\\proj", env: { PATH: "C:\\x" } },
      fakeSpawn(child => child.emit("spawn"), options => { seen = options; })
    );
    expect(seen).toMatchObject({ cwd: "C:\\proj", env: { PATH: "C:\\x" }, detached: true, windowsHide: false, stdio: "ignore" });
  });
});
