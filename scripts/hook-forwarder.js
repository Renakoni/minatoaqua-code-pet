#!/usr/bin/env node

const http = require("node:http");
const { spawn } = require("node:child_process");
const { existsSync, readFileSync, statSync } = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");

const cli = parseArgs(process.argv.slice(2));
const eventPort = Number(cli.port ?? process.env.MINATO_AQUA_PET_PORT ?? 17321);
const hookName = cli.hookName;

function parseArgs(args) {
  const result = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--settings") result.settingsPath = args[++index];
    else if (arg === "--app-path") result.appPath = args[++index];
    else if (arg === "--app-root") result.appRoot = args[++index];
    else if (arg === "--port") result.port = args[++index];
    else if (!arg.startsWith("--") && !result.hookName) result.hookName = arg;
  }

  return result;
}

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
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
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

function nestedValue(payload, path) {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function payloadIndicatesError(payload) {
  const statusValues = [
    payload.status,
    payload.result,
    payload.outcome,
    nestedValue(payload, ["tool_response", "status"]),
    nestedValue(payload, ["toolResponse", "status"])
  ].filter(value => typeof value === "string").map(value => value.toLowerCase());
  if (statusValues.some(value => /error|fail|failed|failure|exception/.test(value))) return true;

  const exitCodes = [
    payload.exit_code,
    payload.exitCode,
    nestedValue(payload, ["tool_response", "exit_code"]),
    nestedValue(payload, ["toolResponse", "exitCode"])
  ];
  if (exitCodes.some(value => Number.isFinite(Number(value)) && Number(value) !== 0)) return true;

  return Boolean(payload.error || payload.exception || nestedValue(payload, ["tool_response", "error"]) || nestedValue(payload, ["toolResponse", "error"]));
}

function mapHookToPetEvent(hook, payload) {
  const tool = pickToolName(payload);
  const detail = pickDetail(payload);
  const isError = payloadIndicatesError(payload);

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
      if (isError) {
        return { event: "error", title: "Tool failed", message: detail ?? "Claude Code reported a tool error.", tool, detail };
      }
      return { event: "running", title: "Tool completed", tool, detail };
    case "Notification":
      return { event: "permission-prompt", title: "Permission needed", tool, detail: detail ?? "Claude Code needs attention" };
    case "Stop":
      if (isError) {
        return { event: "error", title: "Claude Code error", message: detail ?? "Claude Code reported an error.", tool, detail };
      }
      return { event: "completed", title: "Completed", message: "Task finished" };
    default:
      if (isError) {
        return { event: "error", title: hook ? `${hook} failed` : "Claude Code error", message: detail ?? "Claude Code reported an error.", tool, detail };
      }
      return { event: "running", title: hook || "Claude Code event", tool, detail };
  }
}

function postPetEvent(event, timeout = 800) {
  const body = JSON.stringify({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    ...event
  });

  return new Promise(resolve => {
    let settled = false;
    function finish(ok) {
      if (settled) return;
      settled = true;
      resolve(ok);
    }

    const req = http.request(
      {
        host: "127.0.0.1",
        port: eventPort,
        path: "/event",
        method: "POST",
        timeout,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(body)
        }
      },
      res => {
        res.resume();
        res.on("end", () => finish(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300)));
      }
    );

    req.on("timeout", () => {
      req.destroy();
      finish(false);
    });
    req.on("error", () => finish(false));
    req.end(body);
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function candidateSettingsPaths() {
  const appNames = ["claude-codex-pet", "Claude Codex Pet", "Clawd Companion", "Minato Aqua Code Pet"];
  const candidates = [cli.settingsPath, process.env.CLAWD_COMPANION_SETTINGS_PATH];

  if (process.env.APPDATA) {
    for (const appName of appNames) candidates.push(join(process.env.APPDATA, appName, "companion-settings.json"));
  }

  if (process.platform === "darwin") {
    for (const appName of appNames) candidates.push(join(homedir(), "Library", "Application Support", appName, "companion-settings.json"));
  } else if (process.platform !== "win32") {
    const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    for (const appName of appNames) candidates.push(join(configHome, appName, "companion-settings.json"));
  }

  return unique(candidates);
}

function readCompanionSettings() {
  for (const candidate of candidateSettingsPaths()) {
    try {
      if (!existsSync(candidate)) continue;
      const parsed = JSON.parse(readFileSync(candidate, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Ignore corrupt or inaccessible settings. Hooks must never block Claude Code.
    }
  }

  return {};
}

function shouldAutoStartWithCli() {
  return readCompanionSettings().autoStartWithCli === true;
}

function directoryIfUsable(candidate) {
  try {
    return candidate && existsSync(candidate) && statSync(candidate).isDirectory() ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function appRoot() {
  return directoryIfUsable(cli.appRoot || process.env.CLAWD_COMPANION_APP_ROOT) || directoryIfUsable(resolve(__dirname, "..")) || process.cwd();
}

function isElectronBinary(command) {
  const normalized = command.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/node_modules/electron/") || /(^|\/)electron(\.exe)?$/.test(normalized);
}

function launcherFromAppPath(root) {
  const command = cli.appPath || process.env.CLAWD_COMPANION_APP_PATH;
  if (!command || !existsSync(command)) return null;

  return {
    command,
    args: isElectronBinary(command) ? [root] : [],
    cwd: root,
    shell: false
  };
}

function launcherFromLocalElectron(root) {
  const binPath = process.platform === "win32"
    ? join(root, "node_modules", ".bin", "electron.cmd")
    : join(root, "node_modules", ".bin", "electron");
  if (existsSync(binPath)) {
    return {
      command: binPath,
      args: [root],
      cwd: root,
      shell: process.platform === "win32"
    };
  }

  const unpackedPath = process.platform === "win32"
    ? join(root, "node_modules", "electron", "dist", "electron.exe")
    : process.platform === "darwin"
      ? join(root, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron")
      : join(root, "node_modules", "electron", "dist", "electron");
  if (!existsSync(unpackedPath)) return null;

  return {
    command: unpackedPath,
    args: [root],
    cwd: root,
    shell: false
  };
}

function launcherFromNpmStart(root) {
  if (!existsSync(join(root, "package.json"))) return null;

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "start"],
    cwd: root,
    shell: process.platform === "win32"
  };
}

function resolveLauncher() {
  const root = appRoot();
  return launcherFromAppPath(root) || launcherFromLocalElectron(root) || launcherFromNpmStart(root);
}

function startCompanionApp() {
  const launcher = resolveLauncher();
  if (!launcher) return false;

  try {
    const child = spawn(launcher.command, launcher.args, {
      cwd: launcher.cwd,
      detached: true,
      env: { ...process.env, MINATO_AQUA_PET_PORT: String(eventPort) },
      shell: launcher.shell,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryPostPetEvent(event) {
  for (const waitMs of [300, 600, 900, 1200]) {
    await delay(waitMs);
    if (await postPetEvent(event, 1000)) return true;
  }
  return false;
}

async function main() {
  const payload = parsePayload(await readStdin());
  const hook = pickHookName(payload);
  const event = mapHookToPetEvent(hook, payload);
  if (await postPetEvent(event)) return;
  if (!shouldAutoStartWithCli()) return;

  startCompanionApp();
  await retryPostPetEvent(event);
}

main().finally(() => process.exit(0));
