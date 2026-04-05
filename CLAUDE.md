# AgentPower - Claude Code Project Instructions

## What This Project Is

AgentPower is an **Agent Command Center** — a web application that manages multiple Claude Code CLI agents working on different tasks, on schedules, to keep them moving. It uses the user's own Claude auth token (via the locally installed `claude` CLI) to orchestrate work across agents.

## Architecture

```
React Frontend (Vite + Tailwind)
    ↕ WebSocket (real-time bidirectional)
Express Backend (Node.js + TypeScript)
    ↕ Child Process spawn
Claude CLI (`claude -p "..." --output-format stream-json --verbose`)
    ↕
Scheduler (setInterval-based, persisted to JSON)
```

- **Frontend** (`src/`): React 18 + TypeScript. State managed via `useReducer` in `useAgents.ts`. WebSocket hook in `useWebSocket.ts`. Components render agent panels, chat messages, tool call visualizations, and schedule management.
- **Backend** (`server/`): Express + ws. `AgentManager` (EventEmitter) spawns Claude CLI as child processes, parses JSONL streaming output, broadcasts state to all connected clients.
- **Scheduler** (`server/scheduler.ts`): Interval-based timer system. Each schedule binds an agent to a prompt + interval. Skips execution if agent is busy. Auto-pauses if agent is deleted.
- **Persistence**: JSON files at `~/.agentpower/sessions.json` and `~/.agentpower/schedules.json` via `SessionStore`.
- **No database** — flat file storage only.

### Key Files

| File | Purpose |
|------|---------|
| `server/agent-manager.ts` | Core orchestration — spawns Claude CLI, parses events, manages state |
| `server/scheduler.ts` | Schedule engine — interval timers, skip-if-busy, persistence |
| `server/index.ts` | Express + WebSocket server setup, frame routing |
| `server/session-store.ts` | JSON file persistence to `~/.agentpower/` |
| `server/types.ts` | Shared TypeScript types (AgentSession, Schedule, ChatItem, frames) |
| `src/App.tsx` | Main React app layout |
| `src/hooks/useAgents.ts` | Client-side state management (useReducer) — agents + schedules |
| `src/hooks/useWebSocket.ts` | WebSocket connection + message handling |
| `src/components/AgentPanel.tsx` | Main agent chat interface + schedule panel |
| `src/components/SchedulePanel.tsx` | Schedule creation, start/pause/delete/trigger UI |
| `src/components/Sidebar.tsx` | Agent list + selection |
| `src/components/NewAgentModal.tsx` | Agent creation form |

### WebSocket Protocol

Frames are JSON with a `type` field.

**Client → Server:** `create_agent`, `send_message`, `stop_agent`, `delete_agent`, `list_agents`, `create_schedule`, `start_schedule`, `pause_schedule`, `delete_schedule`, `trigger_schedule`, `update_schedule`

**Server → Client:** `init`, `agent_created`, `agent_status`, `agent_chat_item`, `agent_tool_updated`, `agent_cost`, `agent_deleted`, `agent_session_id`, `schedule_created`, `schedule_updated`, `schedule_deleted`, `error`

### Claude CLI Integration

Each message spawns a shell command:
```
claude -p "<text>" --output-format stream-json --verbose --model <model> --dangerously-skip-permissions [--resume <sessionId>]
```

- **`--dangerously-skip-permissions`** — required so agents can execute tools (file writes, bash, etc.) without interactive permission prompts. Since the CLI runs headless as a child process, there's no way for the user to respond to prompts.
- **Working directory**: set via `cwd` on the child process spawn. If the directory doesn't exist, it's auto-created with `mkdirSync(workdir, { recursive: true })`.
- **Env vars**: all `CLAUDE*` environment variables are stripped from the child process to prevent "nested session" detection (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION_ACCESS_TOKEN`).
- **Session resumption**: once the first message captures a `session_id` from the `system.init` event, all subsequent messages are resumed with `--resume <sessionId>` so the agent maintains full conversation context.

### Scheduler

- Schedules are interval-based (e.g. every 5m, 2h, 1d)
- Intervals parsed from human strings: `parseInterval("30s")` → 30000ms
- On start, fires immediately then repeats on interval
- Skips execution if the bound agent is currently running
- Auto-pauses if the bound agent is deleted
- All schedules persisted to `~/.agentpower/schedules.json`

## Development

```bash
npm run dev          # Runs server (tsx watch) + client (vite) concurrently
npm run dev:server   # Server only on port 3001
npm run dev:client   # Client only on port 5173
npm run build        # Production build
npm start            # Production server
```

## Code Conventions

- TypeScript strict mode everywhere
- Functional React components with hooks
- Tailwind CSS for all styling (no CSS modules, no styled-components)
- Server uses EventEmitter pattern for state broadcasting
- All IDs are UUIDs (uuid v4)
- Timestamps are `Date.now()` epoch milliseconds
- Chat items deduplicated by ID on the client (broadcasts go to all clients)

## Platform

- **Primary target: Windows** (Windows 11). Cross-platform support is a future goal.
- CLI spawned with `shell: true` and command as a single string (Windows-compatible).
- Use `path` module (not hardcoded `/` or `\`) for file paths.
- Use `os.homedir()` for user directory resolution.
- All `CLAUDE*` env vars must be stripped from child processes to avoid nested session detection.

## Markdown Rendering Notes

Chat messages render through `ReactMarkdown` in `src/components/ChatMessages.tsx`. A few things worth knowing:

- **`file://` URLs are sanitized by default** — ReactMarkdown only permits `http/https/irc/mailto/xmpp` out of the box. The custom `urlTransform` in `ChatMessages.tsx` whitelists `file` so agent-generated file paths can be opened.
- **Bare URLs and Windows paths are linkified** — a `linkifyText()` pre-processor wraps `http(s)://...` and `C:\path\to\file.ext` in markdown link syntax before rendering. Windows paths become `file:///C:/path/to/file.ext`.
- **Links open in new tabs** — the custom `a` component sets `target="_blank"` and `rel="noopener noreferrer"`.

## Current Limitations (To Be Addressed)

- No cron-style scheduling (only intervals)
- No agent-to-agent communication
- No task queuing or retry logic
- No timeout handling on long-running processes
- No authentication/authorization on the web UI
- No CLAUDE.md or project context injection per agent
- Single-machine only (no distributed workers)

## Design Principles

1. **Claude CLI is the runtime** — we don't call the API directly, we orchestrate the CLI tool
2. **Real-time first** — all state changes broadcast via WebSocket immediately
3. **Persistence is simple** — JSON files, no database overhead
4. **Each agent is independent** — separate sessions, separate working directories, separate models
5. **Streaming output** — never wait for full completion, show progress as it happens
6. **Schedules are durable** — survive server restarts, auto-recover active schedules
