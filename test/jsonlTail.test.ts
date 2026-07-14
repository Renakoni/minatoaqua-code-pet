import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { visitJsonlTail } from "../src/main/jsonlTail";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("visitJsonlTail", () => {
  it("visits the whole file when it fits within the byte limit", async () => {
    const root = mkdtempSync(join(tmpdir(), "chara-jsonl-tail-"));
    tempRoots.push(root);
    const filePath = join(root, "session.jsonl");
    writeFileSync(filePath, "one\ntwo\nthree\n", "utf8");
    const lines: string[] = [];

    const result = await visitJsonlTail(filePath, 1024, line => lines.push(line));

    expect(result).toEqual({ truncated: false, linesRead: 3 });
    expect(lines).toEqual(["one", "two", "three"]);
  });

  it("bounds reads to the tail and discards the leading partial row", async () => {
    const root = mkdtempSync(join(tmpdir(), "chara-jsonl-tail-bounded-"));
    tempRoots.push(root);
    const filePath = join(root, "session.jsonl");
    writeFileSync(filePath, "first-row-is-outside\nsecond\nthird\n", "utf8");
    const lines: string[] = [];

    const result = await visitJsonlTail(filePath, 16, line => lines.push(line));

    expect(result.truncated).toBe(true);
    expect(lines).toEqual(["second", "third"]);
  });
});
