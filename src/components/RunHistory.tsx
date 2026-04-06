import { useState } from 'react'
import type { Run, RunStatus } from '../types.ts'

const STATUS_STYLES: Record<RunStatus, string> = {
  running:   'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  failed:    'bg-red-500/20 text-red-400 border-red-500/30',
  skipped:   'bg-slate-700 text-slate-500 border-slate-600',
  cancelled: 'bg-slate-700 text-slate-500 border-slate-600',
}

const STATUS_DOT: Record<RunStatus, string> = {
  running:   'bg-amber-400 animate-pulse',
  completed: 'bg-emerald-400',
  failed:    'bg-red-400',
  skipped:   'bg-slate-500',
  cancelled: 'bg-slate-500',
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: number, end?: number): string {
  if (!end) return 'running…'
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function formatCost(cost: number): string {
  if (cost === 0) return '—'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

function RunRow({ run, expanded, onToggle }: { run: Run; expanded: boolean; onToggle: () => void }) {
  const isError = run.status === 'failed' || run.status === 'cancelled'
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-slate-800 hover:bg-slate-800/40 cursor-pointer transition-colors"
      >
        <td className="py-2 px-2">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[run.status]}`} />
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[run.status]}`}>
              {run.status}
            </span>
          </div>
        </td>
        <td className="py-2 px-2 text-slate-400 text-xs whitespace-nowrap">{formatTime(run.startedAt)}</td>
        <td className="py-2 px-2 text-slate-500 text-xs whitespace-nowrap">
          {formatDuration(run.startedAt, run.endedAt)}
        </td>
        <td className="py-2 px-2 text-slate-500 text-xs whitespace-nowrap">{formatCost(run.costUsd)}</td>
        <td className="py-2 px-2 text-xs">
          <span className="text-[10px] uppercase text-slate-600 mr-1">{run.triggeredBy}</span>
        </td>
        <td className="py-2 px-2 text-slate-300 text-xs">
          <div className="line-clamp-1 max-w-md">
            {isError && run.error ? (
              <span className="text-red-400">{run.error}</span>
            ) : (
              <span>{run.summary || <span className="text-slate-600 italic">no summary</span>}</span>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-800 bg-slate-900/40">
          <td colSpan={6} className="py-3 px-4">
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-500">Prompt: </span>
                <span className="text-slate-300 whitespace-pre-wrap">{run.prompt}</span>
              </div>
              {run.summary && (
                <div>
                  <span className="text-slate-500">Summary: </span>
                  <span className="text-slate-300 whitespace-pre-wrap">{run.summary}</span>
                </div>
              )}
              {run.error && (
                <div>
                  <span className="text-slate-500">Error: </span>
                  <span className="text-red-400 whitespace-pre-wrap">{run.error}</span>
                </div>
              )}
              <div className="flex gap-4 text-slate-600">
                <span>Run ID: <code className="text-slate-500">{run.id.slice(0, 8)}</code></span>
                <span>Items: {run.chatItemIds.length}</span>
                {run.scheduleId && <span>Schedule: <code className="text-slate-500">{run.scheduleId.slice(0, 8)}</code></span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function RunHistory({ runs, agentId }: { runs: Run[]; agentId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const agentRuns = runs
    .filter(r => r.agentId === agentId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 50)

  const totalCost = agentRuns.reduce((sum, r) => sum + r.costUsd, 0)
  const completedCount = agentRuns.filter(r => r.status === 'completed').length
  const failedCount = agentRuns.filter(r => r.status === 'failed').length

  if (agentRuns.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-600 p-8">
        <div className="text-4xl opacity-20 mb-3">◷</div>
        <div className="text-sm">No runs yet</div>
        <div className="text-xs mt-1 text-slate-700">Runs will appear here when you chat or schedules fire</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-800 text-xs flex-shrink-0">
        <span className="text-slate-500">
          <span className="text-slate-300">{agentRuns.length}</span> run{agentRuns.length !== 1 ? 's' : ''}
        </span>
        <span className="text-slate-500">
          <span className="text-emerald-400">{completedCount}</span> ok
        </span>
        {failedCount > 0 && (
          <span className="text-slate-500">
            <span className="text-red-400">{failedCount}</span> failed
          </span>
        )}
        <span className="text-slate-500 ml-auto">
          Total: <span className="text-slate-300">${totalCost.toFixed(4)}</span>
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-950 border-b border-slate-800">
            <tr>
              <th className="py-2 px-2 text-slate-500 text-[10px] font-medium uppercase tracking-wider">Status</th>
              <th className="py-2 px-2 text-slate-500 text-[10px] font-medium uppercase tracking-wider">Started</th>
              <th className="py-2 px-2 text-slate-500 text-[10px] font-medium uppercase tracking-wider">Duration</th>
              <th className="py-2 px-2 text-slate-500 text-[10px] font-medium uppercase tracking-wider">Cost</th>
              <th className="py-2 px-2 text-slate-500 text-[10px] font-medium uppercase tracking-wider">Trigger</th>
              <th className="py-2 px-2 text-slate-500 text-[10px] font-medium uppercase tracking-wider">Summary</th>
            </tr>
          </thead>
          <tbody>
            {agentRuns.map(run => (
              <RunRow
                key={run.id}
                run={run}
                expanded={expanded === run.id}
                onToggle={() => setExpanded(expanded === run.id ? null : run.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
