import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";

export async function visitJsonlTail(
  filePath: string,
  maxBytes: number,
  visit: (line: string, index: number) => void
) {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) throw new Error("maxBytes must be positive");
  const size = statSync(filePath).size;
  const start = Math.max(0, size - Math.floor(maxBytes));
  const stream = createReadStream(filePath, { encoding: "utf8", start });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let skipPartialLine = start > 0;
  let index = 0;

  try {
    for await (const line of reader) {
      if (skipPartialLine) {
        skipPartialLine = false;
        continue;
      }
      visit(line, index);
      index += 1;
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  return { truncated: start > 0, linesRead: index };
}
