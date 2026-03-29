# AgentPower

**Your personal Agent Command Center.**

AgentPower is a local web application that lets you manage multiple Claude Code agents working on different projects, on schedules, to keep work moving. It uses your own locally installed Claude CLI and auth token — no API keys to configure, no cloud dependency.

The vision: set up agents scoped to different repos and tasks, give them scheduled prompts, and let them work autonomously while you monitor progress from a single dashboard.

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

Open **http://localhost:5173** in your browser.

### What You Can Do

1. **Create an agent** — give it a name, point it at a working directory, pick a model (Sonnet, Opus, Haiku)
2. **Chat with it** — send messages, watch it work in real-time with tool call visualization
3. **Schedule it** — add a recurring prompt (e.g. "check for new issues and triage them" every 30 minutes)
4. **Monitor** — see status, cost tracking, and run history across all agents

## Features

### Working Now
- **Multi-agent management** — create and run multiple Claude agents, each with its own project directory, model, and system prompt
- **Real-time streaming** — watch agent output as it happens via WebSocket
- **Tool call visualization** — see every file read, edit, bash command, and search agents perform
- **Interval-based scheduling** — automate agents with recurring prompts (30s, 5m, 2h, 1d intervals)
- **Smart scheduling** — skips execution if agent is still running, auto-pauses if agent is deleted
- **Schedule controls** — start, pause, trigger-now, and delete schedules per agent
- **Session persistence** — agent conversations and schedules survive server restarts
- **Session resumption** — agents continue previous Claude conversations (maintains context)
- **Model selection** — choose between Sonnet, Opus, Haiku, or custom model IDs per agent
- **Cost tracking** — monitor API spend per agent

### Not Yet Built
- Task queuing with priorities and dependencies
- Agent-to-agent communication
- Prompt templates and reusable workflows
- Dashboard with aggregate status and cost rollups
- Authentication / multi-user support
- Timeout handling and auto-retry

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐     stdio/spawn    ┌───────────┐
│  React Frontend │ ◄────────────────► │  Express Server  │ ◄────────────────► │ Claude CLI│
│  (Vite + TW)    │                    │  (Node.js + ws)  │    (per agent)     │ (your auth)│
└─────────────────┘                    └──────────────────┘                    └───────────┘
                                              │
                                       ┌──────┴──────┐
                                       │ Scheduler   │
                                       │ (setInterval)│
                                       └─────────────┘
                                              │
                                              ▼
                                       ~/.agentpower/
                                       ├── sessions.json
                                       └── schedules.json
```

- **Frontend**: React 18 + TypeScript + Tailwind CSS. State via `useReducer`, real-time updates via WebSocket.
- **Backend**: Express + ws (WebSocket). `AgentManager` spawns Claude CLI as child processes, parses streaming JSONL output, broadcasts to all clients.
- **Scheduler**: Interval-based timer system. Each schedule ties an agent to a prompt + interval. Persisted to JSON. Skips if agent is busy.
- **Persistence**: Flat JSON files in `~/.agentpower/`. No database.
- **CLI Integration**: Each message spawns `claude -p "<prompt>" --output-format stream-json --verbose --model <model>`. Session resumption via `--resume <sessionId>`.

## Project Structure

```
src/                          # React frontend
  components/
    AgentPanel.tsx            # Agent chat interface + schedule panel
    ChatMessages.tsx          # Message rendering (markdown, code)
    InputBar.tsx              # Message input
    NewAgentModal.tsx         # Agent creation form
    SchedulePanel.tsx         # Schedule management UI
    Sidebar.tsx               # Agent list
    ToolCallBlock.tsx         # Tool execution visualization
  hooks/
    useAgents.ts              # Client state management (useReducer)
    useWebSocket.ts           # WebSocket connection + reconnect
  types.ts                    # Shared TypeScript types

server/                       # Node.js backend
  agent-manager.ts            # Core: spawns Claude CLI, parses events, manages state
  scheduler.ts                # Schedule engine (setInterval, persistence, execution)
  index.ts                    # Express + WebSocket server, frame routing
  session-store.ts            # JSON file persistence
  types.ts                    # Shared types (AgentSession, Schedule, WS frames)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server + client with hot reload |
| `npm run dev:server` | Start backend only (port 3001) |
| `npm run dev:client` | Start frontend only (port 5173) |
| `npm run build` | Build for production |
| `npm start` | Run production server |

## Roadmap

### Phase 1: Scheduling & Automation (in progress)
- [x] Interval-based agent scheduling
- [x] Schedule persistence across restarts
- [x] Skip-if-busy execution
- [ ] Cron expression support (specific times, days of week)
- [ ] Task queue with priorities and dependencies
- [ ] Auto-retry with configurable backoff
- [ ] Timeout handling for long-running tasks

### Phase 2: Agent Intelligence
- [ ] CLAUDE.md injection — attach project context per agent
- [ ] Prompt templates & reusable workflows
- [ ] Agent-to-agent message passing
- [ ] Conditional execution (run agent B when agent A completes)
- [ ] Goal-based agents with success/failure criteria

### Phase 3: Observability & Control
- [ ] Dashboard with agent status overview, cost rollups, activity timeline
- [ ] Log retention and searchable history
- [ ] Alerting (agent failures, cost thresholds, schedule misses)
- [ ] Agent groups / tags for organization

### Phase 4: Scale & Distribution
- [ ] Authentication & multi-user support
- [ ] Git worktree isolation per agent
- [ ] Cross-platform support (macOS, Linux)
- [ ] Remote worker nodes
- [ ] REST API for programmatic agent management

## Platform Notes

Currently **Windows-first** (Windows 11). The Claude CLI child process spawning uses `shell: true` with Windows-compatible patterns. Cross-platform support is planned for Phase 4.

## License

Private — not yet published.
