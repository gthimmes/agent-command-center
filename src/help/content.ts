import type { HelpContent } from 'help-navigator'

// The in-app help corpus: categories + markdown articles, rendered by the
// help-navigator widget mounted in App.tsx.
export const helpContent: HelpContent = {
  categories: [
    {
      id: 'getting-started',
      title: 'Getting started',
      icon: '🚀',
      description: 'What AgentPower is, the dashboard, and where your data lives.',
    },
    {
      id: 'agents',
      title: 'Agents',
      icon: '🤖',
      description: 'Creating agents, editing settings, models, and git worktrees.',
    },
    {
      id: 'chat',
      title: 'Chat & search',
      icon: '💬',
      description: 'Talking to agents, tool call visibility, global search, notifications.',
    },
    {
      id: 'scheduling',
      title: 'Scheduling',
      icon: '⏰',
      description: 'Interval and cron schedules, template variables, fresh sessions.',
    },
    {
      id: 'automation',
      title: 'Webhooks & chains',
      icon: '🔗',
      description: 'Firing agents from external systems and chaining agents together.',
    },
    {
      id: 'runs',
      title: 'Runs & monitoring',
      icon: '📊',
      description: 'Run history, statuses, summaries, and the activity feed.',
    },
    {
      id: 'safety',
      title: 'Cost & safety',
      icon: '🛡️',
      description: 'Daily cost limits, run timeouts, and keeping spend under control.',
    },
  ],
  articles: [
    // ---------- Getting started ----------
    {
      id: 'welcome-tour',
      title: 'AgentPower in two minutes',
      category: 'getting-started',
      featured: true,
      tags: ['overview', 'tour', 'basics', 'claude'],
      body: `AgentPower is your personal **Agent Command Center**: a local web app that runs a fleet of Claude Code agents — each scoped to its own project — and lets you monitor everything from one dashboard.

## How it works

1. **Create an agent** — name it, point it at a working directory, pick a model
2. **Give it context** — persistent system instructions injected on every run
3. **Put it to work** — chat with it directly, **schedule** recurring prompts, or expose it as a **webhook** for external systems
4. **Monitor** — every execution becomes a **Run** with status, duration, cost, and a summary

Agents run through your locally installed **Claude CLI** and your own auth token — no API keys to configure, nothing leaves your machine except Claude traffic itself.

> Press **F1** anytime to open this help panel. Press **Ctrl+K** to search across agents and runs.`,
      related: ['dashboard-overview', 'creating-agents', 'data-storage'],
    },
    {
      id: 'dashboard-overview',
      title: 'The dashboard',
      category: 'getting-started',
      tags: ['dashboard', 'stats', 'activity', 'monitoring'],
      body: `The **Dashboard** is the landing view — click **Dashboard** at the top of the sidebar to return to it anytime.

## Stat cards

Six cards summarize the whole fleet at a glance:

- **Agents** — how many exist, and how many are running right now
- **Runs Today** — executions since midnight (UTC), with a failure count if any failed
- **Cost Today** and **Total Cost** — spend across all agents
- **Schedules** and **Webhooks** — how many are active of the total

## Agent cards

Each agent gets a card showing its status dot, model, last run (status, when, what triggered it, summary), and today's vs. total cost. **Click a card** to open that agent.

## Recent Activity

The right-hand feed lists the last 30 runs across every agent — status, agent name, trigger type, and duration — so you can spot failures without visiting each agent.`,
      related: ['welcome-tour', 'run-history', 'global-search'],
    },
    {
      id: 'data-storage',
      title: 'Where your data lives',
      category: 'getting-started',
      tags: ['storage', 'persistence', 'json', 'files', 'durability'],
      body: `Everything is stored as flat JSON files in \`~/.agentpower/\` on your machine — no database, no cloud:

- \`sessions.json\` — agents (name, workdir, model, system prompt, chat history, cost)
- \`schedules.json\` — schedules and their status
- \`runs.json\` — run history, trimmed to the most recent **200 runs per agent**
- \`triggers.json\` — webhook triggers and their secret tokens

Sessions, schedules, runs, and triggers all **survive restarts** — stop the server, start it again, and your fleet picks up where it left off.

Your Claude credentials are never stored by AgentPower: it spawns your local \`claude\` CLI, which uses its own auth.`,
      related: ['welcome-tour', 'run-history'],
    },

    // ---------- Agents ----------
    {
      id: 'creating-agents',
      title: 'Creating an agent',
      category: 'agents',
      featured: true,
      tags: ['create', 'new', 'workdir', 'model'],
      body: `Click **+ New Agent** (in the sidebar or on the dashboard) to open the creation form:

- **Agent Name** — how it appears everywhere (e.g. *Backend Refactor*)
- **Working Directory** — where the agent operates; it's created automatically if it doesn't exist
- **Use git worktree** — isolate the agent's changes on its own branch (see the worktree article)
- **Model** — pick a Claude model, or supply a custom model ID

Under **Advanced options** you can also set:

- **System Prompt** — persistent instructions appended to every run
- **Daily cost limit** (USD) and **Run timeout** (minutes) — the safety rails

Agents run autonomously (Claude Code's permission prompts are skipped), so the working directory and the safety limits are the levers that keep an agent scoped.`,
      related: ['agent-settings', 'worktree-agents', 'models-choice', 'cost-limits'],
    },
    {
      id: 'agent-settings',
      title: 'Agent settings and system prompts',
      category: 'agents',
      tags: ['settings', 'system prompt', 'context', 'edit', 'configure'],
      body: `Open an agent and click **⚙ Settings** in its header to edit everything after creation: name, working directory, model, system prompt, cost limit, run timeout, and Slack notifications.

## The system prompt is your agent's memory

The **System Prompt** is injected on every run — chat messages, scheduled runs, and webhook fires alike. Use it for the context you'd otherwise repeat:

- What the project is and how it's structured
- Coding conventions and priorities
- Standing instructions ("always run the tests before finishing")

## Everything is editable

Changes take effect on the agent's next run. Setting cost limit or timeout to **0** removes that limit.`,
      related: ['creating-agents', 'notifications-help', 'cost-limits'],
    },
    {
      id: 'worktree-agents',
      title: 'Git worktree isolation',
      category: 'agents',
      tags: ['worktree', 'git', 'branch', 'isolation'],
      body: `When creating an agent, check **Use git worktree** to give it an isolated copy of the repository.

## What it does

AgentPower creates a separate **git worktree** from the repo you pointed at, and the agent works there on its own branch — your main checkout is never touched while the agent edits files, runs commands, or commits.

## When to use it

- An agent doing **autonomous, scheduled work** on a repo you also work in yourself
- Running **multiple agents against the same repository** without them stepping on each other

Agents created this way show a **worktree** badge in their header, with the source repo in the tooltip.`,
      related: ['creating-agents', 'schedules-basics'],
    },
    {
      id: 'models-choice',
      title: 'Choosing a model',
      category: 'agents',
      tags: ['model', 'sonnet', 'opus', 'haiku', 'custom'],
      body: `Each agent has its own model, chosen at creation and editable later in **⚙ Settings**:

- **Sonnet** — the default; strong coding ability at moderate cost, right for most agents
- **Opus** — the most capable; use it for agents doing complex, open-ended work
- **Haiku** — fast and cheap; good for high-frequency scheduled checks where depth matters less

Pick **Custom model ID...** in the dropdown to enter any model identifier your Claude CLI accepts — useful for pinned versions or newly released models.

A practical pattern: run frequent schedules on a cheaper model, and keep an Opus agent for the work you chat through interactively. The per-agent **daily cost limit** backstops whichever you choose.`,
      related: ['creating-agents', 'cost-limits'],
    },

    // ---------- Chat & search ----------
    {
      id: 'chat-basics',
      title: 'Chatting with an agent',
      category: 'chat',
      featured: true,
      tags: ['chat', 'messages', 'tools', 'streaming', 'files'],
      body: `Select an agent and use the **Chat** tab to work with it directly.

## Watch it work in real time

Output streams live over WebSocket. Every tool the agent uses — **Bash**, **Read**, **Write**, **Edit**, **Glob**, **Grep**, **WebFetch** — appears as a tool call block, so you see exactly which files it touched and which commands it ran.

## Rich output

Responses render as markdown with syntax-highlighted code. **URLs and Windows file paths are clickable** — file paths open locally in your default application.

## Conversation context

Agents resume their session between messages, so a conversation keeps its context. The **Stop** button in the header halts a running agent mid-flight.`,
      related: ['run-history', 'agent-settings', 'global-search'],
    },
    {
      id: 'global-search',
      title: 'Global search (Ctrl+K)',
      category: 'chat',
      tags: ['search', 'ctrl+k', 'find', 'shortcut'],
      body: `Press **Ctrl+K** (or click the search box in the top bar) to search across the entire fleet:

- **Agent names**
- **Run summaries** and **run prompts**
- **Chat text**

Type at least two characters; results appear in a dropdown grouped with the agent name and how long ago it happened. **Click a result** to jump to that agent. Press **Escape** to close.

Search is the fastest way to answer "which agent handled that?" — summaries are indexed, so searching for a topic finds the run even if you don't remember which agent ran it.`,
      related: ['dashboard-overview', 'run-summaries'],
    },
    {
      id: 'notifications-help',
      title: 'Notifications: desktop, badges, and Slack',
      category: 'chat',
      tags: ['notifications', 'desktop', 'unread', 'slack', 'badges'],
      body: `AgentPower tells you when background work finishes, three ways:

## Desktop notifications

Browser notifications fire when a run **completes or fails** — but are suppressed for the agent you're actively viewing, so chatting stays quiet.

## Unread badges

Agents with runs you haven't looked at show a **count badge** in the sidebar. Selecting the agent clears it. Badges persist across page reloads.

## Slack

Per agent, in **⚙ Settings**, paste a **Slack webhook URL** and pick which events post: run **completed**, **failed**, **skipped** (cost limit), or **cancelled** (timeout). Agents with Slack configured show a green **slack** badge in their header.`,
      related: ['agent-settings', 'run-history', 'cost-limits'],
    },

    // ---------- Scheduling ----------
    {
      id: 'schedules-basics',
      title: 'Scheduling recurring work',
      category: 'scheduling',
      featured: true,
      tags: ['schedule', 'interval', 'cron', 'recurring', 'automation'],
      body: `The **Schedules** panel on each agent runs a prompt automatically. Click **+ Add** and choose a mode:

## Interval

Plain durations: \`30s\`, \`5m\`, \`2h\`, \`1d\` — the first run happens immediately, then repeats. Presets from 5 minutes to 1 day, or type your own.

## Cron

Standard 5-field cron expressions (\`min hour day month day-of-week\`), with presets for common cases — **Daily 9am** (\`0 9 * * *\`), **Weekdays 9am** (\`0 9 * * 1-5\`), every hour, midnight.

## Controls

Each schedule row has **▶ Run now**, **⏸ Pause** / **⏵ Start**, and **✕ Delete**. Expand a row to see its prompt, run count, and last run time.

Scheduling is smart about collisions: if the agent is **already running** when a schedule fires, that execution is skipped (shown as *Skipped* on the expanded row) rather than queued.`,
      related: ['template-variables', 'fresh-sessions', 'workflow-chains'],
    },
    {
      id: 'template-variables',
      title: 'Prompt template variables',
      category: 'scheduling',
      tags: ['template', 'variables', 'placeholders', 'prompts'],
      body: `Schedule and webhook prompts support **template variables**, resolved at execution time:

- \`{{date}}\`, \`{{time}}\`, \`{{day}}\` — when the run fires
- \`{{agent_name}}\`, \`{{workdir}}\` — which agent, where
- \`{{run_count}}\` — how many times this schedule has run
- \`{{last_run_summary}}\`, \`{{last_run_status}}\` — what happened last time
- \`{{payload}}\` — the JSON body of a webhook fire (webhooks only)

## Why they matter

\`{{last_run_summary}}\` gives a fresh-session schedule continuity without context bloat:

> *Review open PRs. Last time you reported: {{last_run_summary}} — only report what changed since.*

Unknown variables are left as-is, so a typo shows up visibly in the run's prompt rather than silently disappearing.`,
      related: ['schedules-basics', 'webhook-triggers', 'fresh-sessions'],
    },
    {
      id: 'fresh-sessions',
      title: 'Fresh session per run',
      category: 'scheduling',
      tags: ['fresh', 'session', 'context', 'resume'],
      body: `Schedules and webhooks have a **Fresh session each run** toggle, on by default.

## Why fresh is the default

A resumed session carries its whole history into every run. For a schedule firing every 30 minutes, that means ever-growing context — slower runs, higher cost, and eventually noise drowning out the prompt. A fresh session starts clean each time; rows with this setting show a blue **fresh** badge.

## When to resume instead

Turn it off when the work is genuinely one long task — an agent iterating toward a goal across runs, where losing the conversation would lose progress.

The middle path: keep fresh sessions on and pass \`{{last_run_summary}}\` in the prompt — continuity without the bloat. The agent's **system prompt** is always included either way.`,
      related: ['schedules-basics', 'template-variables', 'agent-settings'],
    },

    // ---------- Webhooks & chains ----------
    {
      id: 'webhook-triggers',
      title: 'Webhook triggers',
      category: 'automation',
      featured: true,
      tags: ['webhook', 'trigger', 'url', 'token', 'external'],
      body: `The **Webhooks** panel on each agent lets external systems fire it over HTTP. Click **+ Add**, give the webhook a name and a prompt, and you get a secret URL:

\`\`\`
POST /api/trigger/<id>?token=<secret>
\`\`\`

Expand the webhook row to **Copy** the full URL. Send any JSON body — it's substituted into the prompt as \`{{payload}}\`.

## Security & lifecycle

- Each webhook has its own random **secret token**; a wrong token returns **404**
- **⏸ Pause** a webhook and calls return **409** until you start it again — the URL stays stable
- **✕ Delete** kills the URL immediately

## What to hook up

GitHub webhooks (PR opened → agent reviews it), Slack, Zapier, monitoring alerts, or plain \`curl\`. The expanded row shows fire count and last fired time.`,
      related: ['workflow-chains', 'template-variables', 'run-history'],
    },
    {
      id: 'workflow-chains',
      title: 'Chaining agents into workflows',
      category: 'automation',
      tags: ['chain', 'workflow', 'onComplete', 'pipeline'],
      body: `A schedule or webhook can name a follow-up agent: when its run completes, the system automatically fires the chained agent.

## How it works

The chain is configured on the schedule or webhook via two fields — the target agent and the prompt to send it (today these are set through the WebSocket API rather than the panel forms). The chain prompt supports \`{{previous_run_summary}}\`, which receives the first run's summary:

1. **Agent A** (schedule): *"Review today's commits"* → produces a summary
2. **Agent B** (chained): *"Write release notes based on: {{previous_run_summary}}"*

## Traceability and limits

Chained runs are tagged **chain** in run history and the activity feed, and carry a reference to their parent run. Chains are **single-level** — a chained run never fires another chain, so loops are impossible by construction.`,
      related: ['webhook-triggers', 'schedules-basics', 'run-summaries'],
    },

    // ---------- Runs & monitoring ----------
    {
      id: 'run-history',
      title: 'Run history',
      category: 'runs',
      featured: true,
      tags: ['runs', 'history', 'status', 'duration', 'cost'],
      body: `Every execution — a chat message, a schedule fire, a webhook, or a chain — becomes a **Run**. Open an agent and switch to the **Runs** tab for its table:

- **Status** — \`running\`, \`completed\`, \`failed\`, \`skipped\` (cost limit), or \`cancelled\` (timeout)
- **Started**, **duration**, and **cost** for each run
- **Trigger** — what fired it: chat, schedule, webhook, chain, or manual
- **Summary** — one line of what the run accomplished (failed runs show the error instead)

**Click a row** to expand it: the full prompt, the full summary, any error, and the run/schedule IDs.

The table keeps the most recent 50 runs visible; history persists on disk trimmed to 200 per agent.`,
      related: ['run-summaries', 'dashboard-overview', 'cost-limits'],
    },
    {
      id: 'run-summaries',
      title: 'How run summaries work',
      category: 'runs',
      tags: ['summary', 'extraction', 'reporting'],
      body: `Each run gets a one-line **summary** — it's what appears in the run table, agent cards, the activity feed, global search, and \`{{last_run_summary}}\`.

## Where summaries come from

By default, the summary is auto-extracted from the agent's **last assistant message**. For precise control, ask the agent (in its system prompt or the scheduled prompt) to end with explicit tags:

\`\`\`
<summary>Reviewed 3 PRs; approved 2, requested changes on #142</summary>
\`\`\`

Whatever is inside the tags becomes the summary verbatim.

## Why it's worth doing

Good summaries make schedules self-documenting, feed \`{{previous_run_summary}}\` to chained agents cleanly, and turn global search into a log of what your fleet actually did.`,
      related: ['run-history', 'workflow-chains', 'template-variables'],
    },

    // ---------- Cost & safety ----------
    {
      id: 'cost-limits',
      title: 'Daily cost limits',
      category: 'safety',
      featured: true,
      tags: ['cost', 'limit', 'budget', 'spend', 'skipped'],
      body: `Each agent can have a **daily cost limit** in USD (set at creation or in **⚙ Settings**; the day resets at midnight UTC).

## What happens at the limit

A run that would exceed the limit is **skipped**, not started — it appears in run history as \`skipped\` with the reason, and can notify Slack if configured. Chat, schedules, and webhooks are all covered.

## The budget bar

Agents with a limit show a **budget bar** in their header — today's spend against the limit — which **turns red at 80%**. The dashboard's **Cost Today** and **Total Cost** cards, plus per-agent costs on each card, complete the picture.

Costs come from the Claude CLI's own reported cost per run. Set the limit to **0** to remove it — sensible for an agent you only drive interactively.`,
      related: ['run-timeouts', 'run-history', 'notifications-help'],
    },
    {
      id: 'run-timeouts',
      title: 'Run timeouts',
      category: 'safety',
      tags: ['timeout', 'cancelled', 'runaway', 'wall-clock'],
      body: `Each agent can have a **run timeout** in minutes — a wall-clock cap on any single execution, set at creation or in **⚙ Settings**.

## What happens on timeout

When a run exceeds the cap, the process is **killed** and the run is marked \`cancelled\` in run history (with a Slack notification if you've enabled the *cancelled* event). This is the backstop against an agent stuck in a loop, wedged on a hung command, or wandering far beyond the task.

## Choosing a value

Size it to the work: a few minutes for quick scheduled checks, longer for heavy refactoring agents. Combined with the daily cost limit, a runaway agent is bounded in **both time and money**. Set to **0** for no limit.

You can also stop any running agent manually with the **Stop** button in its header.`,
      related: ['cost-limits', 'run-history'],
    },
  ],
}
