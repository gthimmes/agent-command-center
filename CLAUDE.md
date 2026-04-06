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
| `server/run-manager.ts` | Run lifecycle — create, update, finalize, summary extraction |
| `server/run-store.ts` | JSON file persistence for runs |
| `server/trigger-manager.ts` | Webhook trigger CRUD, fire execution, template resolution |
| `server/template.ts` | Prompt template variable resolver (`{{date}}`, `{{payload}}`, etc.) |
| `src/App.tsx` | Main React app layout |
| `src/hooks/useAgents.ts` | Client-side state management (useReducer) — agents + schedules + runs + triggers |
| `src/hooks/useWebSocket.ts` | WebSocket connection + message handling |
| `src/hooks/useNotifications.ts` | Desktop notifications on run completion/failure |
| `src/hooks/useUnreadRuns.ts` | Unread run tracking per agent (localStorage) |
| `src/components/AgentPanel.tsx` | Main agent chat interface + schedule + webhook panels |
| `src/components/AgentSettingsModal.tsx` | Edit agent config post-creation |
| `src/components/Dashboard.tsx` | Global dashboard: stats, agent cards, activity feed |
| `src/components/RunHistory.tsx` | Run history table per agent |
| `src/components/SchedulePanel.tsx` | Schedule creation (interval + cron), start/pause/delete/trigger UI |
| `src/components/TriggerPanel.tsx` | Webhook trigger CRUD with copyable URLs |
| `src/components/SearchBar.tsx` | Global search (Ctrl+K) |
| `src/components/Sidebar.tsx` | Agent list + unread badges + Dashboard link |
| `src/components/NewAgentModal.tsx` | Agent creation form |

### WebSocket Protocol

Frames are JSON with a `type` field.

**Client → Server:** `create_agent`, `update_agent`, `send_message`, `stop_agent`, `delete_agent`, `list_agents`, `create_schedule`, `start_schedule`, `pause_schedule`, `delete_schedule`, `trigger_schedule`, `update_schedule`, `create_trigger`, `start_trigger`, `pause_trigger`, `delete_trigger`

**Server → Client:** `init`, `agent_created`, `agent_updated`, `agent_status`, `agent_chat_item`, `agent_tool_updated`, `agent_cost`, `agent_deleted`, `agent_session_id`, `schedule_created`, `schedule_updated`, `schedule_deleted`, `trigger_created`, `trigger_updated`, `trigger_deleted`, `run_started`, `run_updated`, `error`

### Claude CLI Integration

Each message spawns a shell command:
```
claude -p "<text>" --output-format stream-json --verbose --model <model> --dangerously-skip-permissions [--append-system-prompt "<context>"] [--resume <sessionId>]
```

- **`--dangerously-skip-permissions`** — required so agents can execute tools (file writes, bash, etc.) without interactive permission prompts. Since the CLI runs headless as a child process, there's no way for the user to respond to prompts.
- **`--append-system-prompt`** — injects the agent's persistent context/instructions. Set via the ⚙ Settings modal. Claude caches this across runs (cheaper than bloating the user prompt).
- **Working directory**: set via `cwd` on the child process spawn. If the directory doesn't exist, it's auto-created with `mkdirSync(workdir, { recursive: true })`.
- **Env vars**: all `CLAUDE*` environment variables are stripped from the child process to prevent "nested session" detection (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION_ACCESS_TOKEN`).
- **Session resumption**: once the first message captures a `session_id` from the `system.init` event, all subsequent messages are resumed with `--resume <sessionId>` so the agent maintains full conversation context. For scheduled runs with `freshSessionPerRun: true`, `--resume` is skipped and the session ID is not persisted.
- **Cost tracking**: parsed from `total_cost_usd` (newer CLI) or `cost_usd` (older) in the `result` event.

### Scheduler

- Schedules support **interval** (e.g. every 5m, 2h, 1d) or **cron** (e.g. `0 9 * * 1-5`) modes
- Intervals parsed from human strings: `parseInterval("30s")` → 30000ms
- Cron expressions validated via `node-cron`
- On start (interval mode): fires immediately then repeats. On start (cron mode): fires at next cron match.
- Skips execution if the bound agent is currently running
- Auto-pauses if the bound agent is deleted
- All schedules persisted to `~/.agentpower/schedules.json`
- **Prompt templates** resolved at execution time via `server/template.ts`: `{{date}}`, `{{time}}`, `{{datetime}}`, `{{day}}`, `{{agent_name}}`, `{{workdir}}`, `{{run_count}}`, `{{last_run_summary}}`, `{{last_run_status}}`
- **Fresh session per run**: when enabled (default for new schedules), each run starts a new Claude session, preventing context/cost bloat

### Webhook Triggers

- HTTP POST (or GET) to `/api/trigger/:id?token=X` fires the bound agent
- JSON body exposed as `{{payload}}` in the prompt template
- Token-based auth (random 24-byte base64url secret per trigger)
- Paused triggers return 409; bad ID or token returns 404
- Persisted to `~/.agentpower/triggers.json`

### Workflow Chains

- `Schedule` and `Trigger` support optional `onCompleteAgentId` + `onCompletePrompt`
- When a run completes successfully, the system fires the chained agent with `{{previous_run_summary}}`
- Chained runs tagged `triggeredBy: 'chain'` with `parentRunId`
- Single-level only: chained runs don't re-chain (prevents infinite loops)
- Chain handler is wired in `server/index.ts` listening to `RunManager.run_finished` events

### Run History

- Every execution (chat, schedule, webhook, chain) creates a `Run` record
- Runs track: status, cost, duration, summary, error, prompt, trigger attribution, chat item IDs
- Summaries auto-extracted from last assistant message (first 240 chars) or explicit `<summary>...</summary>` tags
- Persisted to `~/.agentpower/runs.json`, trimmed to 200 per agent on save
- In-progress runs marked as `failed` on server restart

### Dashboard

- Global dashboard shown when no agent is selected (or via sidebar Dashboard button)
- Stat cards: agents, runs today, cost today, total cost, active schedules, active webhooks
- Agent card grid: each shows status, last run summary, today's cost, total cost. Click navigates to agent.
- Activity feed: last 30 runs across all agents

### Search

- `Ctrl+K` focuses the global search bar
- Searches across: agent names, run summaries, run prompts, chat item text
- Results dropdown with type badge, agent name, timestamp
- Click navigates to the corresponding agent

### Notifications

- Desktop notifications via browser Notification API on run completion/failure
- Suppressed when actively viewing that agent and page is visible
- Unread badge per agent in sidebar, count persisted in localStorage

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
- **Bare URLs are linkified** — a `linkifyText()` pre-processor wraps `http(s)://...` in markdown link syntax (skips content inside backticks).
- **File paths in code spans** are auto-linkified — the custom `code` component detects URLs and Windows paths (`C:\...` or `C:/...`) inside inline `<code>` elements and wraps them in `<a>` tags with `file:///` hrefs.
- **Links open via server** — clicking a link calls `POST /api/open` which spawns `cmd /c start "" "<path>"` on Windows. This bypasses browser `file://` navigation restrictions. HTTP/HTTPS URLs open in a new tab directly.

## Design Principles

1. **Claude CLI is the runtime** — we don't call the API directly, we orchestrate the CLI tool
2. **Real-time first** — all state changes broadcast via WebSocket immediately
3. **Persistence is simple** — JSON files, no database overhead
4. **Each agent is independent** — separate sessions, separate working directories, separate models
5. **Streaming output** — never wait for full completion, show progress as it happens
6. **Schedules are durable** — survive server restarts, auto-recover active schedules
7. **Runs are first-class** — every execution is tracked, summarized, and attributable
8. **Safety by default** — cost limits, timeouts, and single-level chains prevent runaway behavior
