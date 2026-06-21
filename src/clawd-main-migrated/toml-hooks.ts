import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Minimal hand-rolled TOML reader/writer for Codex's `config.toml`.
 *
 * The TOML we accept is restricted to:
 *   - top-level key/values (`key = "value"`, `key = 5`, `key = true`)
 *   - `[section]` and `[[arr]]` foreign blocks (preserved verbatim)
 *   - `[[EventName]]` and `[[EventName.hooks]]` blocks (where EventName
 *     is in KNOWN_HOOK_EVENT_NAMES)
 *
 * Anything else (multiline strings, inline tables, etc.) is rejected with
 * a `TomlParseError`. The reader does not try to be a full TOML parser.
 */

export interface TomlHookCommand {
  type?: string;
  command?: string;
  commandWindows?: string;
  timeout?: number;
}

export interface TomlHookEntry {
  /** `[[EventName]]` body, including all `[[EventName.hooks]]` children. */
  body: string;
}

export interface TomlHooksFile {
  events: Record<string, TomlHookEntry[]>;
  /** Top-level key/values that appear before any section header, verbatim. */
  preamble: string;
  /** `[section]` or `[[array_of_tables]]` blocks we don't model, verbatim. */
  foreignSections: string[];
}

const KNOWN_HOOK_EVENT_NAMES = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "PermissionRequest"
]);

export function readTomlHooks(path: string): TomlHooksFile {
  const source = readFileSync(path, "utf8");
  return parseTomlHooks(source);
}

export function parseTomlHooks(source: string): TomlHooksFile {
  const lines = source.split(/\r?\n/);
  const events: Record<string, TomlHookEntry[]> = {};
  const foreignSections: string[] = [];
  let preamble = "";
  let i = 0;

  // 1) Top-level key/values + comments/blank lines up to first section.
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#") || isTopLevelKeyValue(line)) {
      preamble += lines[i] + "\n";
      i++;
      continue;
    }
    if (line.startsWith("[")) break;
    throw new TomlParseError(`unrecognized top-level syntax at line ${i + 1}: ${line}`);
  }

  // 2) Sections.
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) {
      if (foreignSections.length > 0) {
        foreignSections[foreignSections.length - 1] += lines[i] + "\n";
      }
      i++;
      continue;
    }
    if (line.startsWith("[[") && line.endsWith("]]")) {
      const header = line.slice(2, -2).trim();
      // [[EventName.hooks]] can never appear at the top level — they are
      // always nested inside [[EventName]]. If we see one at the top level,
      // treat as foreign to avoid silently dropping it.
      if (header.includes(".")) {
        foreignSections.push(captureForeignSection(lines, i));
        i += countLines(foreignSections[foreignSections.length - 1]);
        continue;
      }
      if (KNOWN_HOOK_EVENT_NAMES.has(header)) {
        const block = captureEventBlock(lines, i, header);
        events[header] = events[header] ?? [];
        events[header].push({ body: block });
        i += countLines(block);
        continue;
      }
      foreignSections.push(captureForeignSection(lines, i));
      i += countLines(foreignSections[foreignSections.length - 1]);
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      foreignSections.push(captureForeignSection(lines, i));
      i += countLines(foreignSections[foreignSections.length - 1]);
      continue;
    }
    throw new TomlParseError(`unrecognized top-level syntax at line ${i + 1}: ${line}`);
  }

  return { events, preamble, foreignSections };
}

function countLines(s: string): number {
  if (!s) return 0;
  return s.split(/\r?\n/).length - (s.endsWith("\n") ? 1 : 0);
}

function captureEventBlock(lines: string[], start: number, eventName: string): string {
  // Capture from `[[EventName]]` (at lines[start]) up to (but not including)
  // the next sibling `[[EventName]]`, `[[OtherEvent]]`, or `[section]`. Inner
  // `[[EventName.hooks]]` blocks are part of the body.
  const buf: string[] = [];
  let i = start;
  buf.push(lines[i] + "\n");
  i++;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith(`[[${eventName}.hooks]]`)) {
      buf.push(line + "\n");
      i++;
      // Continue reading the inner-hook block's key/values until the next header.
      while (i < lines.length) {
        const inner = lines[i].trim();
        if (inner.startsWith("[[") || inner.startsWith("[")) break;
        buf.push(lines[i] + "\n");
        i++;
      }
      continue;
    }
    if (trimmed.startsWith("[[") || trimmed.startsWith("[")) break;
    buf.push(line + "\n");
    i++;
  }
  return buf.join("");
}

function captureForeignSection(lines: string[], start: number): string {
  const buf: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (i > start && (trimmed.startsWith("[[") || trimmed.startsWith("["))) break;
    buf.push(line + "\n");
    i++;
  }
  return buf.join("");
}

function isTopLevelKeyValue(line: string): boolean {
  if (!line.includes("=")) return false;
  if (line.startsWith("#") || line.startsWith("[")) return false;
  // Accept: string ("..." / '...'), int, float, bool, array ([ ... ]).
  // Reject bare identifiers (e.g. `???`) and unparseable garbage.
  const after = line.slice(line.indexOf("=") + 1).trim().replace(/[#].*$/, "").trim();
  if (after === "") return false;
  if (after.startsWith('"') || after.startsWith("'")) return after.length >= 2;
  if (after.startsWith("[")) return after.endsWith("]");
  if (/^-?\d+(\.\d+)?$/.test(after)) return true;
  if (after === "true" || after === "false") return true;
  return false;
}

function mergeEntries(existing: TomlHookEntry[], additions: TomlHookEntry[]): TomlHookEntry[] {
  return [...existing, ...additions];
}

export class TomlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TomlParseError";
  }
}

// --- writer ----------------------------------------------------------------

export interface WriteTomlOptions {
  command: string;
  commandWindows?: string;
  timeout?: number;
}

export function writeTomlHooks(path: string, file: TomlHooksFile, requiredEvents: readonly string[], opts: WriteTomlOptions): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (existsSync(path)) copyFileSync(path, path + ".clawd-backup");
  const serialized = serializeTomlHooks(file, requiredEvents, opts);
  writeFileSync(path, serialized, "utf8");
}

function serializeTomlHooks(file: TomlHooksFile, requiredEvents: readonly string[], opts: WriteTomlOptions): string {
  const blocks: string[] = [];
  if (file.preamble) blocks.push(file.preamble.trimEnd() + "\n");

  for (const eventName of requiredEvents) {
    const existing = file.events[eventName] ?? [];
    const userEntries = existing.filter(entry => !entry.body.includes(`command = "${escapeTomlString(opts.command)}"`));
    for (const entry of userEntries) blocks.push(entry.body);
    blocks.push(serializeEventEntry(eventName, opts));
  }
  for (const [eventName, entries] of Object.entries(file.events)) {
    if (requiredEvents.includes(eventName)) continue;
    for (const entry of entries) blocks.push(entry.body);
  }
  for (const section of file.foreignSections) blocks.push(section.trimEnd() + "\n");
  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function serializeEventEntry(eventName: string, opts: WriteTomlOptions): string {
  const lines: string[] = [];
  lines.push(`[[${eventName}]]`);
  lines.push(`matcher = "*"`);
  lines.push(`[[${eventName}.hooks]]`);
  lines.push(`type = "command"`);
  lines.push(`command = "${escapeTomlString(opts.command)}"`);
  if (opts.commandWindows) lines.push(`commandWindows = "${escapeTomlString(opts.commandWindows)}"`);
  if (typeof opts.timeout === "number") lines.push(`timeout = ${opts.timeout}`);
  return lines.join("\n") + "\n";
}

function escapeTomlString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

export function checkTomlHooks(file: TomlHooksFile, requiredEvents: readonly string[], command: string): { installed: boolean; missingEvents: string[]; hookCount: number; requiredCount: number } {
  const missing: string[] = [];
  let count = 0;
  for (const eventName of requiredEvents) {
    const entries = file.events[eventName] ?? [];
    if (entries.some(entry => entry.body.includes(`command = "${escapeTomlString(command)}"`))) {
      count++;
    } else {
      missing.push(eventName);
    }
  }
  return { installed: missing.length === 0, missingEvents: missing, hookCount: count, requiredCount: requiredEvents.length };
}

/**
 * Serialize a `TomlHooksFile` verbatim without adding or removing any
 * companion hooks. Used by removeHooks so the writer doesn't re-add the
 * entry we just removed.
 */
export function serializeTomlHooksPreserve(file: TomlHooksFile): string {
  const blocks: string[] = [];
  if (file.preamble) blocks.push(file.preamble.trimEnd() + "\n");
  for (const [, entries] of Object.entries(file.events)) {
    for (const entry of entries) blocks.push(entry.body);
  }
  for (const section of file.foreignSections) blocks.push(section.trimEnd() + "\n");
  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
