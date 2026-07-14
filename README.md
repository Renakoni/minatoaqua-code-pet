# Chara Desk

Chara Desk is a local Windows desktop companion and control panel for Claude Code. It combines an animated desktop pet with Claude Code hook activity, permission prompts, session and usage views, provider routing, and Unified Profiles for personal Skills, user Plugins, and global MCP servers.

> [!IMPORTANT]
> Chara Desk is currently a `0.1.0` pre-release that runs from source. There is no supported installer or public binary yet. The current integration target is Claude Code. Support for `codex-pet` packages is theme compatibility, not Codex CLI integration.

## Current Features

- Desktop pet reactions for Claude Code session, prompt, tool, notification, completion, and error events.
- Permission cards that return allow or deny decisions to Claude Code through the hook protocol.
- One-click Hook installation, repair, removal, and connection diagnostics from the app.
- Session browsing and resume, token and runtime statistics, and local-data controls.
- Unified Profiles that atomically apply personal Skills, user-scope Plugins, and top-level global MCP servers.
- Claude provider routing, connectivity checks, and terminal launch.
- Configurable action and idle animations, notifications, appearance, and pet behavior.
- Validated local import and optional gallery install of compatible `codex-pet` themes.

## Scope and Requirements

The current source build is intended for Windows development and evaluation. It requires:

- Node.js and npm.
- Claude Code installed locally.
- `claude.exe` or `claude.ps1` on `PATH` for session resume and provider-terminal workflows.
- System `node` on `PATH` for the current Claude Code Hook forwarder.

Chara Desk does not currently ship a Windows installer, bundled Hook runtime, signing metadata, or release artifacts for `electron-updater`. Clean-machine install, upgrade, and uninstall behavior has not been release-qualified.

## Run from Source

```powershell
npm install
npm run dev:electron
```

When Chara Desk opens, use the connection action in Overview to install the Claude Code Hooks. Start a new Claude Code session after installation; already-running sessions do not reload Hook or Unified Profile configuration.

For a production-style local build:

```powershell
npm run build
npm run start
```

This builds and launches the unpackaged Electron application. It does not create an installer.

## Development Commands

- `npm run dev`: start the Vite renderer development server.
- `npm run dev:electron`: compile Electron main/preload code and launch the application with Vite.
- `npm run typecheck`: type-check renderer, main, preload, and test projects.
- `npm test`: run the Vitest suite.
- `npm run build`: build renderer and Electron code.
- `npm run start`: launch the previously built unpackaged application.
- `npm run hook:forward -- <HookName>`: forward one Claude Code Hook payload from stdin during development.
- `npm run hook:doctor`: inspect the local forwarder and loopback event-server setup without modifying Claude settings.

Normal validation before a pull request:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

## Configuration and Data Safety

Chara Desk is local-first. It reads Claude Code settings, sessions, Skills, Plugins, and MCP configuration from the current Windows user profile. Operations that intentionally change Claude configuration are initiated from the UI.

- Hook operations update `~/.claude/settings.json`, create a timestamped backup, preserve unrelated Hooks, and use atomic replacement.
- Provider switching backs up and atomically replaces the relevant Claude settings.
- Unified Profiles preserve unrelated settings and project-local data. They manage personal Skills and user Plugins in `~/.claude/settings.json`, plus only the top-level global `mcpServers` map in `~/.claude.json`.
- MCP definitions remain in a main-process-only preservation store so inactive servers can be selected later; secret-bearing definitions are not sent to renderer windows.
- Display redaction hides sensitive paths and content in the UI. It is not encryption or deletion.

The local Hook event and permission server listens on `127.0.0.1:17321`. The forwarder exits successfully when the app is unavailable so it does not block an ordinary Claude Code Hook flow.

## Network Use

The application can make outbound requests in these cases:

- GitHub Releases when a packaged build checks for application updates.
- `codex-pet.org` and its gallery assets when the user requests a pet install.
- LiteLLM's public pricing data on GitHub for token-cost estimates, with local cache and embedded fallback.
- User-requested provider connectivity tests and external links.

Claude session content, MCP definitions, and provider secrets are not uploaded by the Hook forwarder.

## Release Status

The product feature set is close to a first alpha, but the public binary lifecycle is not ready. The remaining release gates are packaging, external Hook delivery, licensing and asset-rights decisions, release/update automation, accurate release collateral, and clean-machine acceptance testing.

This repository currently has no software license or asset-attribution package. Do not assume redistribution rights for the source, bundled media, or derived binaries until that release-governance work is complete.
