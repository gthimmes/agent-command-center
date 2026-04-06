# AgentPower Roadmap

This document captures the product vision and phased plan for AgentPower. It's the source of truth for "what are we building and why."

## The Core Gap

Today AgentPower is a **chat client with a timer attached**. To become a true agent command center, it needs to bridge the gap between "running agents" and "running agents you can trust to work autonomously and report back."

Every missing feature traces back to one of three questions:

1. **Can I trust this agent unattended?** (reliability, safety, observability)
2. **Can I see what it's done without wading through chat?** (artifacts, summaries, history)
3. **Can the agent actually get things done?** (context, tools, coordination)

---

## What's Been Addressed (Phases 1-4)

All of the original critical and significant gaps have been resolved:

| Original Gap | Resolution |
|-------------|------------|
| No run history/observability | ✅ Phase 1 — first-class Run records, run table, summaries |
| No notifications | ✅ Phase 1 — desktop notifications, unread badges |
| No cost/time limits | ✅ Phase 1 — daily cost limits, run timeouts, budget bar |
| No per-agent context | ✅ Phase 2 — persistent system prompt via `--append-system-prompt` |
| Interval-only scheduling | ✅ Phase 2 — cron expressions via `node-cron` |
| No event triggers | ✅ Phase 3 — webhook triggers with token auth |
| No prompt templates | ✅ Phase 2 — template variables (`{{date}}`, `{{payload}}`, etc.) |
| No workflows | ✅ Phase 3 — agent chains via `onComplete` fields |
| Context grows forever | ✅ Phase 1 — fresh session per run toggle |
| No dashboard | ✅ Phase 4 — global dashboard with stats, agent cards, activity feed |
| No search | ✅ Phase 4 — `Ctrl+K` global search across agents, runs, chat |

## Remaining Gaps (Phase 5+)

- Multi-user auth
- Agent groups / tags
- Git worktree isolation per agent
- File watcher triggers
- Shared agent memory / knowledge base
- Task queues
- MCP server integrations
- Approval gates for destructive actions
- Cross-platform (macOS, Linux)
- Remote workers / distributed execution

---

## Phased Roadmap

### Phase 1: Trustworthy Autonomy — ✅ **complete**

**Goal:** Make scheduled agents actually useful by making them observable and safe.

1. ✅ **Run history per schedule** — every execution becomes a first-class Run record (status, cost, duration, summary, prompt, error). Persisted at `~/.agentpower/runs.json`, trimmed to 200 per agent. Server broadcasts `run_started` / `run_updated` frames.
2. ✅ **Run summaries & structured outputs** — extracts the final assistant message (first 240 chars) or an explicit `<summary>...</summary>` tag. Shown in the Runs tab table.
3. ✅ **Cost & time limits** — per-agent `dailyCostLimitUsd` (UTC-day rollup from runs, enforced pre-spawn → creates a `skipped` run with reason), per-agent `runTimeoutMs` (wall-clock kill → `cancelled` run). Budget bar in agent header turns red at 80%.
4. ✅ **Notifications** — desktop notifications via browser `Notification` API on run completion/failure (skipped if user is actively viewing that agent). Unread badge count per agent in sidebar, persisted in localStorage.
5. ✅ **Fresh context per scheduled run** — per-schedule `freshSessionPerRun` flag (default: on). When true, the scheduler passes `freshSession: true` to `sendMessage` which skips `--resume` and doesn't persist the new session id, so each run starts clean.

**Still to build in Phase 1 (deferred):**
- Webhook notifications (Slack/Discord) — currently desktop-only
- `<summary>` tag emission guidance in default system prompts
- Monthly cost limits (not just daily)

### Phase 2: Smarter Agents — ✅ (4/5 shipped)

**Goal:** Once you trust them, make them capable.

1. ✅ **Per-agent context injection** — `systemPrompt` field is now actually passed to the Claude CLI via `--append-system-prompt`. It's persistent, editable, and cached by Claude across runs (cheaper than putting it in every user prompt). A dedicated textarea in the Settings modal with markdown support and guidance.
2. ✅ **Prompt templates with variables** — schedule prompts support `{{date}}`, `{{time}}`, `{{datetime}}`, `{{day}}`, `{{agent_name}}`, `{{workdir}}`, `{{run_count}}`, `{{last_run_summary}}`, `{{last_run_status}}`. Resolved at execution time in `server/template.ts`. Unknown vars pass through unchanged (typo-safe).
3. ✅ **Cron expression scheduling** — schedules can now use either `interval` (e.g. `30m`) or `cron` (e.g. `0 9 * * 1-5`). Uses `node-cron` under the hood. UI tab switcher with presets (every hour, daily 9am, weekdays 9am, Monday 9am, midnight).
4. ✅ **Editable agent config post-creation** — new `AgentSettingsModal` accessible via a ⚙ Settings button in the agent header. Edits name, workdir, model, system prompt, daily cost limit, and run timeout. Backed by a new `update_agent` WS frame and `AgentManager.updateSession`.
5. ⏳ **Auto-summarization of long conversations** — deferred. With per-agent context files and fresh-session scheduling, the main pain point (ballooning costs from `--resume`) is now mitigated. Revisit if we see it become a problem.

### Phase 3: Coordination & Events — ✅ (2/5 shipped, rest deferred)

**Goal:** Move from solo agents to systems.

1. ✅ **Webhook triggers** — new `Trigger` primitive firing on HTTP POST (or GET) to `/api/trigger/:id?token=X`. Each trigger has a random token for auth. JSON body is exposed to the prompt template via `{{payload}}`. Full CRUD via WS frames (`create_trigger`, `start_trigger`, `pause_trigger`, `delete_trigger`). UI: webhooks panel per agent with copyable URL, start/pause/delete controls. Paused triggers return 409; bad tokens return 404. Runs produced by triggers are attributed with `triggeredBy: 'webhook'` and `triggerId`.
2. ✅ **Agent workflow chains** — `Schedule` and `Trigger` now support optional `onCompleteAgentId` + `onCompletePrompt` fields. When a run from a schedule/trigger completes successfully, the system automatically fires the chained agent with the previous run's summary substituted via `{{previous_run_summary}}`. Chained runs are tagged `triggeredBy: 'chain'` with `parentRunId` for traceability. Single-level only — chained runs don't re-chain (prevents infinite loops).
3. ⏳ **File watcher triggers** — deferred. Webhooks cover most integration needs; file watchers can be added as another `TriggerKind`.
4. ⏳ **Shared memory / knowledge base** — deferred. Design needs more thought (per-project markdown files? key-value? SQLite?). Per-agent context (Phase 2) covers most use cases for now.
5. ⏳ **Task queues** — deferred. Workflow chains cover simple producer/consumer patterns; full task queues need more product thought.
6. ⏳ **MCP server support** — deferred. Complex integration; worth doing as its own phase.

### Phase 4: Command Center Polish — ✅ (3/7 shipped, rest deferred)

**Goal:** Make it feel like a real dashboard.

1. ✅ **Global Dashboard** — shows when no agent is selected (or via sidebar "Dashboard" button). Stat cards: agents, runs today, cost today, total cost, active schedules, active webhooks. Agent card grid with last run summary, today's cost, total cost — click to navigate. Responsive grid layout (1-3 columns).
2. ✅ **Cross-agent Activity Feed** — right panel on dashboard showing last 30 runs across all agents. Each row: status, agent name, trigger type, duration, time ago. Scrollable.
3. ✅ **Global Search** — `Ctrl+K` to focus. Searches across agent names, run summaries/prompts, and chat text. Results dropdown with type badge, agent name, timestamp. Click a result to navigate to that agent. Minimum 2 chars to trigger.
4. ⏳ **Agent groups / tags** — deferred. The search bar covers finding agents for now.
5. ⏳ **Template library** — deferred. Per-agent context + templates cover most use cases.
6. ⏳ **Approval gates** — deferred. Cost limits + timeouts provide safety for now.
7. ⏳ **Themes, keyboard shortcuts, mobile polish** — deferred for a UX-focused sprint.

### Phase 5: Scale — ✅ (3/5 shipped)

1. ✅ **Token-based auth** — configurable via `AGENTPOWER_AUTH_TOKEN` env var or `~/.agentpower/auth.json`. When enabled, all HTTP API calls require `Authorization: Bearer <token>` and WS connections require the token in query string or `Sec-WebSocket-Protocol`. Auth is **disabled by default** on first launch (a token is pre-generated and printed to console, ready to enable). Webhook trigger endpoints use their own per-trigger tokens and are not double-authed.
2. ✅ **Git worktree isolation per agent** — when creating an agent with "Use git worktree" checked, the system creates a `git worktree` at `~/.agentpower/worktrees/<shortId>` from the source repo. The agent works on its own branch (`agentpower/<shortId>`) without affecting the main checkout. Worktree is cleaned up (removed + branch deleted) when the agent is deleted. Falls back to the original workdir if the source is not a git repo. `isWorktree` badge shown in agent header.
3. ✅ **Cross-platform file opening** — `/api/open` now uses `cmd /c start` on Windows, `open` on macOS, and `xdg-open` on Linux.
4. ⏳ **Remote workers** — deferred. Single-machine is sufficient for current use cases.
5. ⏳ **Cloud-hosted option** — deferred. Requires auth + multi-user first.

---

## Current Status

**Phase 1 shipped** — Trustworthy Autonomy (run history, notifications, cost/time limits, fresh-session toggle).

**Phase 2 shipped** — Smarter Agents (persistent system prompts, prompt templates with variables, cron scheduling, editable agent settings).

**Phase 3 shipped (core)** — Coordination & Events (webhook triggers, agent workflow chains).

**Phase 4 shipped (core)** — Command Center Polish (global dashboard, activity feed, search).

**Phase 5 shipped (core)** — Scale (token auth, git worktree isolation, cross-platform file opening).

AgentPower is now a complete agent orchestration platform. You can:
- Create an agent scoped to a project with a persistent context/system prompt
- Edit any setting after the fact via a ⚙ Settings modal
- Schedule it with cron (e.g. `0 9 * * 1-5` for weekdays at 9am) or interval
- **Expose it as a webhook** — external systems (GitHub, Slack, curl, Zapier, etc.) can POST to a secret URL to fire the agent with payload data
- **Chain agents into workflows** — when a run completes, automatically trigger a follow-up agent with the previous summary as context
- Use template variables (`{{date}}`, `{{payload}}`, `{{previous_run_summary}}`, etc.) anywhere
- **See everything at a glance** from a global dashboard with stat cards, agent cards, and an activity feed
- **Search across everything** — agents, runs, chat text — with `Ctrl+K`
- Watch agents work in real time with tool call visualization
- See a clean run history with summaries, costs, durations, and chain lineage (parentRunId)
- Get desktop notifications when runs finish
- Trust that daily cost limits and run timeouts will keep it safe
- **Lock it down** with token-based auth when you're ready
- **Isolate agents** with git worktrees so they don't step on each other's files

All five phases are now shipped. Remaining backlog items are tracked in the deferred sections above.
