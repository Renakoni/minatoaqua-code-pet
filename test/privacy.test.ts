import { describe, expect, it } from "vitest";
import { redactDisplayEvent } from "../src/shared/privacy";

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
