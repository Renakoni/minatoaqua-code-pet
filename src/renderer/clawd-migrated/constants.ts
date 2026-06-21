// @ts-nocheck
import type { PetState } from "../shared/events";

export const clawdGifName: Record<PetState, string> = {
  idle: "clawd_png_idle",
  thinking: "thinking_speech",
  tool_read: "thinking_speech",
  tool_edit: "working_hardhat",
  tool_bash: "headset_focus",
  tool_search: "thinking_speech",
  tool_mcp: "thinking_speech",
  skill: "idea_bulb",
  task: "idea_bulb",
  agent: "welding_work",
  waiting_permission: "permission_prompt",
  done: "celebrate_bunny",
  error: "error_dead"
};

export const stateCopy: Record<PetState, { label: string; line: string; tone: string }> = {
  idle: { label: "idle", line: "Clawd is napping on the desktop", tone: "sand" },
  thinking: { label: "thinking", line: "Organizing context", tone: "blue" },
  tool_read: { label: "read", line: "Reading a file", tone: "green" },
  tool_edit: { label: "edit", line: "Editing code", tone: "coral" },
  tool_bash: { label: "terminal", line: "Running a command", tone: "ink" },
  tool_search: { label: "search", line: "Searching for clues", tone: "blue" },
  tool_mcp: { label: "mcp", line: "Calling MCP tool", tone: "blue" },
  skill: { label: "skill", line: "Using a skill", tone: "honey" },
  task: { label: "task", line: "Processing a task", tone: "steel" },
  agent: { label: "agent", line: "Calling sub-agent", tone: "steel" },
  waiting_permission: { label: "awaiting", line: "Needs your confirmation", tone: "honey" },
  done: { label: "done", line: "This round is done", tone: "green" },
  error: { label: "error", line: "Something went wrong", tone: "coral" }
};

export type FeedbackMode = "thought" | "card" | "ribbon";

export const stateFeedbackMode: Record<PetState, FeedbackMode> = {
  idle: "card",
  thinking: "card",
  tool_read: "thought",
  tool_edit: "card",
  tool_bash: "thought",
  tool_search: "thought",
  tool_mcp: "thought",
  skill: "thought",
  task: "thought",
  agent: "thought",
  waiting_permission: "card",
  done: "card",
  error: "card"
};

