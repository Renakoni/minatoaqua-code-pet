// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionsPage } from "../src/renderer/clawd-migrated/components/sessions/SessionsPage";

const session = {
  filePath: "C:\\Users\\me\\.claude\\projects\\proj\\session.jsonl",
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

type EventListener = (event: { event: string }) => void;

function installCompanion() {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const listeners: EventListener[] = [];
  const getClaudeSessions = vi.fn(async () => ({ sessions: [session], scannedAt: 1, projectsDir: "~/.claude/projects" }));
  const openClaudeResource = vi.fn(async () => true);
  Reflect.set(window, "companion", {
    getClaudeSessions,
    getClaudeSessionDetail: async () => ({ messages: [], totalMessages: 0 }),
    resumeClaudeSession: vi.fn(),
    openClaudeResource,
    onEvent: (listener: EventListener) => {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    }
  });
  return { writeText, getClaudeSessions, openClaudeResource, emit: (event: { event: string }) => listeners.forEach(listener => listener(event)) };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "companion");
});

describe("SessionsPage quick actions", () => {
  it("copies the resume command with a cd prefix", async () => {
    const { writeText } = installCompanion();
    render(<SessionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /复制恢复命令/ }));
    expect(writeText).toHaveBeenCalledWith('cd "C:\\project" && claude --resume abc123def456');
  });

  it("copies the bare session id", async () => {
    const { writeText } = installCompanion();
    render(<SessionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /复制会话 ID/ }));
    expect(writeText).toHaveBeenCalledWith("abc123def456");
  });

  it("reveals the transcript through the existing allow-listed IPC", async () => {
    const { openClaudeResource } = installCompanion();
    render(<SessionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /在资源管理器中显示日志/ }));
    expect(openClaudeResource).toHaveBeenCalledWith(session.filePath);
  });
});

describe("SessionsPage live refresh", () => {
  it("debounces session lifecycle events into one refresh", async () => {
    const { getClaudeSessions, emit } = installCompanion();
    render(<SessionsPage active />);
    await screen.findAllByText("Test session");
    expect(getClaudeSessions).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    act(() => {
      emit({ event: "session_start" });
      emit({ event: "done" });
      emit({ event: "tool_start" }); // irrelevant event must not schedule anything
    });
    act(() => { vi.advanceTimersByTime(1499); });
    expect(getClaudeSessions).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(2); });
    expect(getClaudeSessions).toHaveBeenCalledTimes(2);
    expect(getClaudeSessions).toHaveBeenLastCalledWith(false);
  });

  it("does not listen while the tab is hidden", async () => {
    const { getClaudeSessions, emit } = installCompanion();
    render(<SessionsPage active={false} />);
    await act(async () => {});
    const callsBefore = getClaudeSessions.mock.calls.length;

    vi.useFakeTimers();
    act(() => { emit({ event: "session_start" }); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(getClaudeSessions).toHaveBeenCalledTimes(callsBefore);
  });
});
