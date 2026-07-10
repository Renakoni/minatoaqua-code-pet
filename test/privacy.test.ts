import { describe, expect, it } from "vitest";
import { redactDisplayEvent, redactSensitiveText } from "../src/shared/privacy";

describe("redactDisplayEvent", () => {
  it("removes paths, commands, and prompt text while preserving event identity", () => {
    const event = {
      id: "event-1",
      event: "tool_start",
      tool: "Bash",
      title: "Run npm publish",
      message: "Publishing private package",
      detail: "npm publish --//registry.example.test/:_authToken=secret",
      cwd: "C:\\Users\\private\\project",
      timestamp: 123
    };

    expect(redactDisplayEvent(event)).toEqual({
      id: "event-1",
      event: "tool_start",
      tool: "Bash",
      title: "Bash activity",
      message: "",
      detail: undefined,
      cwd: undefined,
      timestamp: 123
    });
  });

  it("uses stable labels for notifications and completed work", () => {
    expect(redactDisplayEvent({ event: "notification", notificationKind: "info", title: "private", message: "private" }).title).toBe("Notification");
    expect(redactDisplayEvent({ event: "done", title: "private", message: "private" }).title).toBe("Completed");
  });

  it("localizes stable labels without restoring sensitive details", () => {
    expect(redactDisplayEvent({ event: "error", title: "private", message: "secret" }, "zh")).toMatchObject({
      title: "任务出错",
      message: ""
    });
  });
});

describe("redactSensitiveText", () => {
  it("strips a Windows drive path from a hook-operation error, keeping the rest", () => {
    const message = "Hook forwarder not found: C:\\Users\\private\\AppData\\hook-forwarder.js";
    expect(redactSensitiveText(message)).toBe("Hook forwarder not found: [path hidden]");
  });

  it("strips UNC and POSIX home paths", () => {
    expect(redactSensitiveText("Backup at \\\\nas\\share\\clawd\\settings.json")).toBe("Backup at [path hidden]");
    expect(redactSensitiveText("Wrote ~/.claude/settings.json")).toBe("Wrote [path hidden]");
    expect(redactSensitiveText("Reading /Users/private/project/a.ts")).toBe("Reading [path hidden]");
  });

  it("redacts every path when several appear in one message", () => {
    const message = "Moved C:\\a\\forwarder.js to C:\\b\\forwarder.js";
    expect(redactSensitiveText(message)).toBe("Moved [path hidden] to [path hidden]");
  });

  it("leaves status words, counts, versions, and event names intact (no false positives)", () => {
    for (const safe of ["Configured 6 / 6 events", "OK/Check", "v1.2.3", "Repair complete. Fixed 3 config items.", "PreToolUse"]) {
      expect(redactSensitiveText(safe)).toBe(safe);
    }
  });

  it("localizes the placeholder for Chinese without leaking the path", () => {
    const redacted = redactSensitiveText("Hook forwarder not found: C:\\Users\\private\\hook-forwarder.js", "zh");
    expect(redacted).toBe("Hook forwarder not found: [路径已隐藏]");
    expect(redacted).not.toContain("private");
  });
});
