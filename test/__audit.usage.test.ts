// TEMPORARY audit against the real ~/.claude/projects — run locally, then delete.
// Purpose: verify the usage-ranking algorithm's assumptions against ALL real transcripts:
//   1. cross-file duplication of tool_use ids (resume copying rows => inflated counts?)
//   2. every shape a Skill invocation takes (Skill tool input keys, SlashCommand tool,
//      user-typed <command-name> rows)
//   3. Task/Agent input shapes
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function collectJsonl(dir: string, depth = 0): string[] {
  if (depth > 4) return [];
  const out: string[] = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsonl(full, depth + 1));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function top(map: Map<string, number>, n: number) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}=${v}`).join(" ");
}

describe("audit: real usage data", () => {
  it("measures duplication and skill shapes", () => {
    const projectsDir = join(homedir(), ".claude", "projects");
    const files = collectJsonl(projectsDir);

    // tool_use id -> set of files it appears in
    const idFiles = new Map<string, Set<string>>();
    let totalToolUseBlocks = 0;
    const toolNames = new Map<string, number>();
    const skillInputShapes = new Map<string, number>();
    const skillNames = new Map<string, number>();
    const slashCommandInputs = new Map<string, number>();
    const userCommandNames = new Map<string, number>();
    const agentInputShapes = new Map<string, number>();
    let userCommandRows = 0;
    const commandRegex = /<command-name>([^<]+)<\/command-name>/g;

    for (const filePath of files) {
      let text: string;
      try { text = readFileSync(filePath, "utf8"); } catch { continue; }
      for (const line of text.split("\n")) {
        if (!line) continue;
        const hasToolUse = line.includes('"tool_use"');
        const hasCommand = line.includes("<command-name>");
        if (!hasToolUse && !hasCommand) continue;
        let row: Record<string, unknown>;
        try { row = JSON.parse(line) as Record<string, unknown>; } catch { continue; }

        if (row.type === "user" && hasCommand) {
          const content = (row.message as Record<string, unknown> | undefined)?.content;
          const textContent = typeof content === "string" ? content
            : Array.isArray(content) ? content.map(block => (block as Record<string, unknown>)?.text ?? "").join("\n") : "";
          let match;
          let found = false;
          while ((match = commandRegex.exec(textContent)) !== null) {
            bump(userCommandNames, match[1].trim());
            found = true;
          }
          if (found) userCommandRows++;
          continue;
        }

        if (row.type !== "assistant" || !hasToolUse) continue;
        const content = (row.message as Record<string, unknown> | undefined)?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const value = block as Record<string, unknown>;
          if (value.type !== "tool_use" || typeof value.name !== "string") continue;
          totalToolUseBlocks++;
          bump(toolNames, value.name);
          const id = typeof value.id === "string" ? value.id : "";
          if (id) {
            const set = idFiles.get(id) ?? new Set<string>();
            set.add(filePath);
            idFiles.set(id, set);
          }
          const input = value.input && typeof value.input === "object" ? value.input as Record<string, unknown> : {};
          if (value.name === "Skill") {
            bump(skillInputShapes, Object.keys(input).sort().join(","));
            const skillValue = typeof input.skill === "string" ? input.skill : typeof input.command === "string" ? input.command : "?";
            bump(skillNames, skillValue);
          }
          if (value.name === "SlashCommand") {
            bump(slashCommandInputs, String(input.command ?? "?"));
          }
          if (value.name === "Task" || value.name === "Agent") {
            bump(agentInputShapes, Object.keys(input).sort().join(","));
          }
        }
      }
    }

    let idsInMultipleFiles = 0;
    let extraOccurrences = 0;
    for (const set of idFiles.values()) {
      if (set.size > 1) {
        idsInMultipleFiles++;
        extraOccurrences += set.size - 1;
      }
    }

    const report = [
      `files=${files.length} totalToolUseBlocks=${totalToolUseBlocks} distinctIds=${idFiles.size}`,
      `idsInMultipleFiles=${idsInMultipleFiles} extraOccurrences=${extraOccurrences} (inflation=${(extraOccurrences / Math.max(1, idFiles.size) * 100).toFixed(1)}%)`,
      `TOOL NAMES: ${top(toolNames, 15)}`,
      `SKILL tool input shapes: ${top(skillInputShapes, 8)}`,
      `SKILL names via tool: ${top(skillNames, 10)}`,
      `SLASHCOMMAND inputs: ${top(slashCommandInputs, 10)}`,
      `AGENT input shapes: ${top(agentInputShapes, 8)}`,
      `USER <command-name> rows=${userCommandRows}: ${top(userCommandNames, 20)}`
    ].join("\n");
    writeFileSync(join(process.env.SMOKE_REPORT_DIR ?? ".", "audit-usage.txt"), report);
    expect(totalToolUseBlocks).toBeGreaterThan(0);
  }, 120_000);
});
