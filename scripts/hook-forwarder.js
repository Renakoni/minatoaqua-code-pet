#!/usr/bin/env node

const http = require("node:http");

const eventPort = Number(process.env.MINATO_AQUA_PET_PORT ?? 17321);
const hookName = process.argv[2];

function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve(null);

  return new Promise(resolve => {
    let body = "";
    let done = false;

    function finish(value) {
      if (done) return;
      done = true;
      resolve(value);
    }

    const timer = setTimeout(() => finish(body || null), 250);

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        body = body.slice(0, 1024 * 1024);
        process.stdin.destroy();
      }
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      finish(body);
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}

function parsePayload(input) {
  if (!input || !input.trim()) return {};

  try {
    const value = JSON.parse(input);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function pickHookName(payload) {
  return (
    hookName ||
    payload.hook_event_name ||
    payload.hookEventName ||
    payload.hook_name ||
    payload.hookName ||
    payload.event ||
    "Unknown"
  );
}

function pickToolName(payload) {
  const tool = payload.tool;
  if (typeof payload.tool_name === "string") return payload.tool_name;
  if (typeof payload.toolName === "string") return payload.toolName;
  if (typeof tool === "string") return tool;
  if (tool && typeof tool === "object" && typeof tool.name === "string") return tool.name;
  return undefined;
}

function shorten(value, maxLength = 500) {
  if (value === undefined || value === null) return undefined;

  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function pickDetail(payload) {
  return (
    shorten(payload.tool_input) ||
    shorten(payload.toolInput) ||
    shorten(payload.message) ||
    shorten(payload.prompt) ||
    undefined
  );
}

function isPermissionLike(hook, toolName, payload) {
  const combined = `${hook} ${toolName ?? ""} ${payload.permission ?? ""} ${payload.approval ?? ""} ${payload.requires_permission ?? ""}`.toLowerCase();
  return /permission|approval|approve|notification|bash|shell|powershell|cmd|edit|write|notebookedit/.test(combined);
}

function mapHookToPetEvent(hook, payload) {
  const tool = pickToolName(payload);
  const detail = pickDetail(payload);

  switch (hook) {
    case "SessionStart":
      return { event: "idle", title: "Claude session started", message: "Ready" };
    case "UserPromptSubmit":
      return { event: "running", title: "Working", message: "Handling prompt" };
    case "PreToolUse":
      if (isPermissionLike(hook, tool, payload)) {
        return { event: "permission-prompt", title: "Permission needed", tool, detail };
      }
      return { event: "running", title: "Using tool", tool, detail };
    case "PostToolUse":
      return { event: "running", title: "Tool completed", tool, detail };
    case "Notification":
      return { event: "permission-prompt", title: "Permission needed", tool, detail: detail ?? "Claude Code needs attention" };
    case "Stop":
      return { event: "completed", title: "Completed", message: "Task finished" };
    default:
      return { event: "running", title: hook || "Claude Code event", tool, detail };
  }
}

function postPetEvent(event) {
  const body = JSON.stringify({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    ...event
  });

  return new Promise(resolve => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: eventPort,
        path: "/event",
        method: "POST",
        timeout: 800,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(body)
        }
      },
      res => {
        res.resume();
        res.on("end", resolve);
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve();
    });
    req.on("error", resolve);
    req.end(body);
  });
}

async function main() {
  const payload = parsePayload(await readStdin());
  const hook = pickHookName(payload);
  const event = mapHookToPetEvent(hook, payload);
  await postPetEvent(event);
}

main().finally(() => process.exit(0));
