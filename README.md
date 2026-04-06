# AgentPower

**Your personal Agent Command Center.**

AgentPower is a local web application that lets you manage multiple Claude Code agents working on different projects, on schedules, triggered by webhooks, chained into workflows — and monitor everything from a single dashboard. It uses your own locally installed Claude CLI and auth token — no API keys to configure, no cloud dependency, no credentials in code.

## The Vision

A single dashboard where you run a fleet of Claude agents, each scoped to its own project and goal. You define the work once — "review PRs on this repo", "triage new issues", "refactor the auth module" — schedule it, and let the agents execute autonomously while you monitor from one place.

The goal is to turn Claude Code from a tool you babysit into a team of workers you orchestrate. You give them context and tasks; they get the work done. You check in when you want to.

Key principles:
- **Your credentials, your machine** — the app spawns your local `claude` CLI, never touches tokens directly
- **Agents are independent** — each agent has its own working directory, conversation history, model, and schedule
- **Durable by default** — sessions, schedules, runs, and triggers survive restarts
- **Real-time visibility** — watch every tool call, file edit, and bash command as it happens
- **Safe by default** — daily cost limits and run timeouts prevent runaway spending

## Getting Started

### Prerequisites

- **Node.js 18+**
- **Claude CLI** installed and authenticated (`claude` must be in your PATH)
- **Windows 11** (primary target — other platforms may work but are untested)

### Install & Run

```bash
git clone <repo-url>
cd AgentPower
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. You'll land on the dashboard.

### What You Can Do

1. **Create an agent** — give it a name, point it at a working directory, pick a model (Sonnet, Opus, Haiku), set a daily cost limit and run timeout
2. **Give it context** — click ⚙ Settings and write persistent system instructions (project overview, coding conventions, priorities). Injected on every run via `--append-system-prompt`.
3. **Chat with it** — send messages, watch it work in real-time with tool call visualization, click file paths to open them locally
4. **Schedule it** — add a recurring prompt with interval (`30m`, `2h`) or cron (`0 9 * * 1-5` for weekdays at 9am). Use template variables like `{{date}}`, `{{last_run_summary}}` in prompts.
5. **Expose it as a webhook** — create a webhook trigger to get a secret URL. External systems (GitHub, Slack, curl, Zapier) can POST JSON to fire the agent with `{{payload}}` in the prompt.
6. **Chain agents into workflows** — set an `onComplete` target so when one agent finishes, another fires automatically with the previous run's summary.
7. **Monitor everything** — the global dashboard shows all agents, today's runs, costs, schedules, webhooks, and a live activity feed. `Ctrl+K` to search across everything.

## Features

### Agent Management
- Multi-agent with independent working directories, models, and system prompts
- Autonomous execution (`--dangerously-skip-permissions`) — agents write files, run commands, and edit code without prompts
- Auto-created working directories on first use
- Editable agent config post-creation (⚙ Settings modal: name, workdir, model, system prompt, cost limit, timeout)
- Session resumption via `--resume` — agents maintain conversation context across messages

### Scheduling
- **Interval-based**: `30s`, `5m`, `2h`, `1d` — runs immediately, then repeats
- **Cron-based**: standard 5-field cron expressions (e.g. `0 9 * * 1-5`). Presets: hourly, daily 9am, weekdays 9am, Monday 9am, midnight
- Smart scheduling: skips execution if agent is already running, auto-pauses if agent is deleted
- **Fresh session per run** toggle (default: on) — prevents context/cost bloat for scheduled agents
- **Prompt templates** with variables: `{{date}}`, `{{time}}`, `{{day}}`, `{{agent_name}}`, `{{workdir}}`, `{{run_count}}`, `{{last_run_summary}}`, `{{last_run_status}}`

### Webhook Triggers
- Create a webhook to get a secret URL: `POST /api/trigger/:id?token=XYZ`
- Send any JSON payload — exposed in the prompt as `{{payload}}`
- Token-based auth (random 24-byte secret per trigger)
- Start/pause/delete controls. Paused triggers return 409; bad tokens return 404.
- Works with GitHub webhooks, Slack, Zapier, curl, or any HTTP client

### Workflow Chains
- Schedules and triggers can specify an `onCompleteAgentId` + `onCompletePrompt`
- When a run completes, the system fires the chained agent with `{{previous_run_summary}}`
- Chained runs are tagged `triggeredBy: 'chain'` with `parentRunId` for traceability
- Single-level only (no infinite loops)

### Run History & Observability
- Every execution (chat, schedule, webhook, chain) creates a first-class **Run** record
- Run table per agent: status, started time, duration, cost, trigger type, summary
- Summaries auto-extracted from the last assistant message, or from explicit `<summary>...</summary>` tags
- Runs persist at `~/.agentpower/runs.json`, trimmed to 200 per agent

### Safety
- **Daily cost limits** per agent (UTC day) — skips runs that would exceed the limit
- **Run timeout** per agent (wall-clock) — kills runaway processes, marks the run as `cancelled`
- Budget bar in agent header turns red at 80% usage
- Cost tracking from Claude CLI's `total_cost_usd` / `cost_usd` fields

### Notifications
- Desktop notifications via browser Notification API on run completion or failure
- Suppressed when actively viewing the agent (no noise)
- Unread badge per agent in sidebar with count, persisted in localStorage

### Dashboard & Search
- **Global Dashboard** (default landing page): stat cards (agents, runs today, cost, schedules, webhooks), agent card grid, activity feed
- **Activity Feed**: last 30 runs across all agents with status, agent name, trigger type, duration
- **Global Search** (`Ctrl+K`): searches agent names, run summaries, run prompts, and chat text. Click a result to navigate.

### Chat & Rendering
- Real-time streaming of Claude CLI output via WebSocket
- Tool call visualization: see every Bash, Read, Write, Edit, Glob, Grep, WebFetch invocation
- Markdown rendering via ReactMarkdown with syntax highlighting
- Clickable URLs and Windows file paths (opened via server-side `start` command to bypass browser `file://` restrictions)
- Custom `urlTransform` to allow `file://` protocol through ReactMarkdown's sanitizer

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐     stdio/spawn    ┌───────────┐
│  React Frontend │ ◄────────────────► │  Express Server  │ ◄────────────────► │ Claude CLI│
│  (Vite + TW)    │                    │  (Node.js + ws)  │    (per agent)     │ (your auth)│
└─────────────────┘                    └──────────────────┘                    └───────────┘
                                              │
                                       ┌──────┼──────────────┐
                                       │      │              │
                                    Scheduler  RunManager  TriggerManager
                                    (cron +    (run CRUD,  (webhook CRUD,
                                     interval)  summaries)  HTTP endpoint)
                                       │      │              │
                                       ▼      ▼              ▼
                                       ~/.agentpower/
                                       ├── sessions.json
                                       ├── schedules.json
                                       ├── runs.json
                                       └── triggers.json
```

- **Frontend**: React 18 + TypeScript + Tailwind CSS. State via `useReducer`. WebSocket for real-time.
- **Backend**: Express + ws. `AgentManager` spawns Claude CLI, parses JSONL, broadcasts to clients.
- **Scheduler**: Interval (`setInterval`) or cron (`node-cron`). Template variable resolution at execution time.
- **RunManager**: Creates/updates/finalizes Run records. Extracts summaries. Emits `run_finished` for chain handling.
- **TriggerManager**: Webhook CRUD + HTTP endpoint. Token auth. Template resolution including `{{payload}}`.
- **Persistence**: Flat JSON files in `~/.agentpower/`. No database.

## Project Structure

```
src/                              # React frontend
  components/
    AgentPanel.tsx                # Agent view: header, schedules, webhooks, tabs (Chat/Runs)
    AgentSettingsModal.tsx        # Edit agent config post-creation
    ChatMessages.tsx              # Message rendering (markdown, links, tool calls)
    Dashboard.tsx                 # Global dashboard: stats, agent cards, activity feed
    InputBar.tsx                  # Message input
    NewAgentModal.tsx             # Agent creation form (with cost/timeout fields)
    RunHistory.tsx                # Run history table with expandable rows
    SchedulePanel.tsx             # Schedule CRUD (interval + cron tabs, template var hints)
    SearchBar.tsx                 # Global search (Ctrl+K) with results dropdown
    Sidebar.tsx                   # Agent list with unread badges, Dashboard link
    ToolCallBlock.tsx             # Tool execution visualization
    TriggerPanel.tsx              # Webhook trigger CRUD with copyable URLs
  hooks/
    useAgents.ts                  # Client state (useReducer) — agents, schedules, runs, triggers
    useNotifications.ts           # Desktop notifications on run completion
    useUnreadRuns.ts              # Unread run tracking per agent (localStorage)
    useWebSocket.ts               # WebSocket connection + reconnect
  types.ts                        # Client-side TypeScript types

server/                           # Node.js backend
  agent-manager.ts                # Core: spawns Claude CLI, parses events, run lifecycle
  index.ts                        # Express + WS server, HTTP endpoints, chain handler
  run-manager.ts                  # Run CRUD, summaries, persistence
  run-store.ts                    # JSON file persistence for runs
  scheduler.ts                    # Schedule engine (interval + cron, template resolution)
  session-store.ts                # JSON file persistence for sessions
  template.ts                     # Prompt template variable resolver
  trigger-manager.ts              # Webhook trigger CRUD, fire execution
  types.ts                        # Shared types (all data models + WS frames)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server + client with hot reload |
| `npm run dev:server` | Start backend only (port 3001) |
| `npm run dev:client` | Start frontend only (port 5173) |
| `npm run build` | Build for production |
| `npm start` | Run production server |

## Data Files

All data is stored as flat JSON in `~/.agentpower/`:

| File | Contents |
|------|----------|
| `sessions.json` | Agent sessions (name, workdir, model, systemPrompt, chatItems, cost) |
| `schedules.json` | Schedules (prompt, interval/cron, status, chain config) |
| `runs.json` | Run history (status, cost, summary, attribution, chat item IDs) |
| `triggers.json` | Webhook triggers (prompt, token, status, chain config) |

## WebSocket Protocol

All frames are JSON with a `type` field.

**Client → Server:**
`create_agent`, `update_agent`, `send_message`, `stop_agent`, `delete_agent`, `list_agents`,
`create_schedule`, `start_schedule`, `pause_schedule`, `delete_schedule`, `trigger_schedule`, `update_schedule`,
`create_trigger`, `start_trigger`, `pause_trigger`, `delete_trigger`

**Server → Client:**
`init`, `agent_created`, `agent_updated`, `agent_status`, `agent_chat_item`, `agent_tool_updated`, `agent_cost`, `agent_deleted`, `agent_session_id`,
`schedule_created`, `schedule_updated`, `schedule_deleted`,
`trigger_created`, `trigger_updated`, `trigger_deleted`,
`run_started`, `run_updated`,
`error`

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/open` | Open a local file/path with the OS default handler |
| POST/GET | `/api/trigger/:id?token=X` | Fire a webhook trigger (JSON body = `{{payload}}`) |

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full phased plan. Current status: Phases 1-4 shipped, Phase 5 (Scale) next.

## Platform Notes

Currently **Windows-first** (Windows 11). CLI spawning uses `shell: true` with a single-string command (Windows-compatible). All `CLAUDE*` env vars are stripped from child processes to prevent nested session detection. Cross-platform support is planned for Phase 5.

## License

Private — not yet published.
