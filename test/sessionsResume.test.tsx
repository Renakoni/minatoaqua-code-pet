// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionsPage } from "../src/renderer/clawd-migrated/components/sessions/SessionsPage";

const session = {
  filePath: "C:\\project\\session.jsonl",
  sessionId: "abc123def456",
  projectPath: "C:\\project",
  projectName: "project",
  title: "Test session",
  firstPrompt: "hello",
  model: "claude-sonnet",
  branch: "main",
  status: "idle",
  messageCount: 3,
  lastMessageAt: 0
};

function installCompanion(resumeResult: unknown) {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Reflect.set(window, "companion", {
    getClaudeSessions: async () => ({ sessions: [session], scannedAt: 0, projectsDir: "~/.claude/projects" }),
    getClaudeSessionDetail: async () => ({ messages: [], totalMessages: 0 }),
    resumeClaudeSession: vi.fn(async () => resumeResult)
  });
  return { writeText };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "companion");
});

describe("SessionsPage resume", () => {
  it("surfaces the actionable error and copies nothing when claude is missing (not copyable)", async () => {
    const notOnPath = "Claude Code (claude) isn't on PATH. Install it — or restart Chara Desk if you just installed it — then try again.";
    const { writeText } = installCompanion({ ok: false, command: "claude --resume abc123def456", error: notOnPath });
    render(<SessionsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /恢复/ }));

    // The install/restart guidance reaches the UI instead of a useless copied command.
    await waitFor(() => expect(screen.getByText(/isn't on PATH/)).toBeTruthy());
    expect(writeText).not.toHaveBeenCalled();
  });

  it("surfaces the error and copies the command on an async launch failure (copyable)", async () => {
    const { writeText } = installCompanion({ ok: false, command: "claude --resume abc123def456", error: "spawn cmd.exe ENOENT", copyable: true });
    render(<SessionsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /恢复/ }));

    await waitFor(() => expect(screen.getByText(/ENOENT/)).toBeTruthy());
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("claude --resume abc123def456"));
  });
});
