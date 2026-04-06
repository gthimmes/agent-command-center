import type { AgentSession, Run, Schedule, Trigger } from '../types.ts'

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function formatDuration(start: number, end?: number): string {
  if (!end) return '...'
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const STATUS_DOT: Record<string, string> = {
  idle:    'bg-slate-500',
  running: 'bg-amber-400 animate-pulse',
  stopped: 'bg-slate-600',
  error:   'bg-red-500',
}

const RUN_STATUS_STYLES: Record<string, string> = {
  running:   'text-amber-400',
  completed: 'text-emerald-400',
  failed:    'text-red-400',
  skipped:   'text-slate-500',
  cancelled: 'text-slate-500',
}

const TRIGGER_LABELS: Record<string, string> = {
  chat:     'chat',
  schedule: 'sched',
  webhook:  'hook',
  chain:    'chain',
  manual:   'manual',
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
      <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">{label}</div>
      <div className="text-slate-100 text-xl font-semibold">{value}</div>
      {sub && <div className="text-slate-600 text-[10px] mt-0.5">{sub}</div>}
    </div>
  )
}

function AgentCard({
  agent,
  lastRun,
  todayCost,
  onClick,
}: {
  agent: AgentSession
  lastRun?: Run
  todayCost: number
  onClick: () => void
}) {
  const shortModel = agent.model.replace('claude-', '').replace(/-\d{8}$/, '')

  return (
    <button
      onClick={onClick}
      className="text-left bg-slate-800/30 border border-slate-700/50 rounded-xl px-4 py-3 hover:bg-slate-800/50 hover:border-slate-600 transition-all group"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[agent.status]}`} />
        <span className="text-slate-200 text-sm font-medium truncate flex-1">{agent.name}</span>
        <span className="text-slate-600 text-[10px]">{shortModel}</span>
      </div>

      {lastRun ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-medium ${RUN_STATUS_STYLES[lastRun.status]}`}>
              {lastRun.status}
            </span>
            <span className="text-slate-600 text-[10px]">{timeAgo(lastRun.startedAt)}</span>
            <span className="text-slate-700 text-[10px]">{TRIGGER_LABELS[lastRun.triggeredBy]}</span>
          </div>
          {lastRun.summary && (
            <div className="text-slate-500 text-[10px] line-clamp-2">{lastRun.summary}</div>
          )}
        </div>
      ) : (
        <div className="text-slate-700 text-[10px]">No runs yet</div>
      )}

      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-800">
        <span className="text-slate-600 text-[10px]">
          Today: <span className="text-slate-400">{formatCost(todayCost)}</span>
        </span>
        <span className="text-slate-600 text-[10px]">
          Total: <span className="text-slate-400">{formatCost(agent.totalCostUsd)}</span>
        </span>
      </div>
    </button>
  )
}

function ActivityRow({ run, agentName }: { run: Run; agentName: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 hover:bg-slate-800/30 transition-colors rounded">
      <span className={`text-[10px] font-medium w-16 flex-shrink-0 ${RUN_STATUS_STYLES[run.status]}`}>
        {run.status}
      </span>
      <span className="text-slate-300 text-xs truncate flex-1 min-w-0">
        {agentName}
      </span>
      <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded flex-shrink-0">
        {TRIGGER_LABELS[run.triggeredBy]}
      </span>
      <span className="text-slate-600 text-[10px] w-14 text-right flex-shrink-0">
        {formatDuration(run.startedAt, run.endedAt)}
      </span>
      <span className="text-slate-700 text-[10px] w-16 text-right flex-shrink-0">
        {timeAgo(run.startedAt)}
      </span>
    </div>
  )
}

export function Dashboard({
  agents,
  runs,
  schedules,
  triggers,
  onSelectAgent,
  onNewAgent,
}: {
  agents: AgentSession[]
  runs: Run[]
  schedules: Schedule[]
  triggers: Trigger[]
  onSelectAgent: (id: string) => void
  onNewAgent: () => void
}) {
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  const todayStart = now.getTime()

  const totalAgents = agents.length
  const runningAgents = agents.filter(a => a.status === 'running').length
  const todayRuns = runs.filter(r => r.startedAt >= todayStart)
  const todayCost = todayRuns.reduce((sum, r) => sum + r.costUsd, 0)
  const totalCost = agents.reduce((sum, a) => sum + a.totalCostUsd, 0)
  const activeSchedules = schedules.filter(s => s.status === 'active').length
  const activeTriggers = triggers.filter(t => t.status === 'active').length
  const failedToday = todayRuns.filter(r => r.status === 'failed').length

  // Per-agent today's cost and last run
  const agentTodayCost = new Map<string, number>()
  const agentLastRun = new Map<string, Run>()
  for (const r of runs) {
    if (r.startedAt >= todayStart) {
      agentTodayCost.set(r.agentId, (agentTodayCost.get(r.agentId) ?? 0) + r.costUsd)
    }
    const existing = agentLastRun.get(r.agentId)
    if (!existing || r.startedAt > existing.startedAt) {
      agentLastRun.set(r.agentId, r)
    }
  }

  // Recent activity: last 30 runs sorted by most recent
  const recentRuns = [...runs]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 30)

  const agentNameMap = new Map<string, string>()
  for (const a of agents) agentNameMap.set(a.id, a.name)

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600 select-none gap-4">
        <div className="text-5xl opacity-20">&#x2B21;</div>
        <div className="text-sm">No agents yet</div>
        <button
          onClick={onNewAgent}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
        >
          + Create your first agent
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stats */}
      <div className="px-6 pt-5 pb-3 flex-shrink-0">
        <h1 className="text-slate-200 text-base font-semibold mb-4">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard label="Agents" value={totalAgents} sub={runningAgents > 0 ? `${runningAgents} running` : undefined} />
          <StatCard label="Runs Today" value={todayRuns.length} sub={failedToday > 0 ? `${failedToday} failed` : undefined} />
          <StatCard label="Cost Today" value={formatCost(todayCost)} />
          <StatCard label="Total Cost" value={formatCost(totalCost)} />
          <StatCard label="Schedules" value={activeSchedules} sub={`of ${schedules.length} total`} />
          <StatCard label="Webhooks" value={activeTriggers} sub={`of ${triggers.length} total`} />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 px-6 pb-6 gap-6">
        {/* Agent cards grid */}
        <div className="flex-1 flex flex-col min-w-0">
          <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">Agents</h2>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  lastRun={agentLastRun.get(agent.id)}
                  todayCost={agentTodayCost.get(agent.id) ?? 0}
                  onClick={() => onSelectAgent(agent.id)}
                />
              ))}
              <button
                onClick={onNewAgent}
                className="flex items-center justify-center border-2 border-dashed border-slate-700 rounded-xl px-4 py-6 text-slate-600 hover:border-violet-500/40 hover:text-violet-400 transition-all text-sm"
              >
                + New Agent
              </button>
            </div>
          </div>
        </div>

        {/* Activity feed */}
        <div className="hidden lg:flex flex-col w-80 flex-shrink-0">
          <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">Recent Activity</h2>
          <div className="flex-1 overflow-y-auto bg-slate-800/20 border border-slate-700/30 rounded-xl">
            {recentRuns.length === 0 ? (
              <div className="text-slate-600 text-xs text-center py-8">No runs yet</div>
            ) : (
              <div className="py-1">
                {recentRuns.map(run => (
                  <ActivityRow
                    key={run.id}
                    run={run}
                    agentName={agentNameMap.get(run.agentId) ?? 'Unknown'}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
