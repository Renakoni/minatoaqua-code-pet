# Claude Codex Pet

Anime pixel desktop companion for Claude Code and Codex.

## Development

```powershell
npm install
npm run dev:electron
```

## Scripts

- `npm run dev`: start the Vite renderer dev server.
- `npm run dev:electron`: compile Electron main/preload and launch the app.
- `npm run typecheck`: run TypeScript checks.
- `npm run build`: build renderer and Electron code.
- `npm run hook:forward -- <HookName>`: forward a Claude Code/Codex hook payload from stdin to the pet event API.
- `npm run hook:doctor`: check hook-forwarder setup and whether the local pet event server is listening.

## Manual hook setup

Start the pet app before using hooks:

```powershell
npm run start
```

The first integration stage is manual: point Claude Code/Codex hooks at `scripts/hook-forwarder.js`. The forwarder reads hook JSON from stdin, maps it to a pet state, and posts to `http://127.0.0.1:17321/event`. If the pet app is not running, it exits successfully without blocking the hook.

Run the doctor command to check the local setup:

```powershell
npm run hook:doctor
```

The doctor checks local files, package scripts, and whether `127.0.0.1:17321` is listening. It does not install hooks, modify Claude/Codex settings, upload payloads, or send pet events.

Example commands for hook configuration:

```powershell
node E:\claude-plugins\pet\claude-codex-pet\scripts\hook-forwarder.js SessionStart
node E:\claude-plugins\pet\claude-codex-pet\scripts\hook-forwarder.js UserPromptSubmit
node E:\claude-plugins\pet\claude-codex-pet\scripts\hook-forwarder.js PreToolUse
node E:\claude-plugins\pet\claude-codex-pet\scripts\hook-forwarder.js PostToolUse
node E:\claude-plugins\pet\claude-codex-pet\scripts\hook-forwarder.js Notification
node E:\claude-plugins\pet\claude-codex-pet\scripts\hook-forwarder.js Stop
```

Current event mapping:

- `SessionStart` -> `idle`
- `UserPromptSubmit` -> `running`
- `PreToolUse` -> `running` or `permission-prompt` for permission-like/dangerous tools
- `PostToolUse` -> `running`
- `Notification` -> `permission-prompt`
- `Stop` -> `completed`
