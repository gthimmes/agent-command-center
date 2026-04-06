import { useState } from 'react'
import type { Schedule } from '../types.ts'

function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1).replace(/\.0$/, '')}h`
  return `${(ms / 86_400_000).toFixed(1).replace(/\.0$/, '')}d`
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function ScheduleItem({
  schedule,
  onStart,
  onPause,
  onDelete,
  onTrigger,
}: {
  schedule: Schedule
  onStart: () => void
  onPause: () => void
  onDelete: () => void
  onTrigger: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isActive = schedule.status === 'active'

  return (
    <div className={`rounded-lg border ${isActive ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/30'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-slate-500 text-xs"
        >
          {expanded ? '▼' : '▶'}
        </button>

        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />

        <span className="text-slate-200 text-xs font-medium truncate flex-1">{schedule.name}</span>

        <span className="text-slate-500 text-xs flex-shrink-0">
          {schedule.mode === 'cron' && schedule.cronExpression
            ? <code className="font-mono">{schedule.cronExpression}</code>
            : <>every {formatInterval(schedule.intervalMs)}</>}
        </span>

        {schedule.freshSessionPerRun && (
          <span
            title="Each run starts with a fresh Claude session (no context from prior runs)"
            className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full flex-shrink-0"
          >
            fresh
          </span>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onTrigger}
            title="Run now"
            className="px-1.5 py-0.5 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 text-xs transition-colors"
          >
            ▶
          </button>
          {isActive ? (
            <button
              onClick={onPause}
              title="Pause"
              className="px-1.5 py-0.5 rounded text-amber-500 hover:bg-amber-500/10 text-xs transition-colors"
            >
              ⏸
            </button>
          ) : (
            <button
              onClick={onStart}
              title="Start"
              className="px-1.5 py-0.5 rounded text-emerald-500 hover:bg-emerald-500/10 text-xs transition-colors"
            >
              ⏵
            </button>
          )}
          <button
            onClick={onDelete}
            title="Delete schedule"
            className="px-1.5 py-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 text-xs transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-slate-700/50 pt-2">
          <div>
            <span className="text-slate-500 text-xs">Prompt: </span>
            <span className="text-slate-300 text-xs">{schedule.prompt}</span>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-slate-500">
              Runs: <span className="text-slate-400">{schedule.runCount}</span>
            </span>
            {schedule.lastRunAt && (
              <span className="text-slate-500">
                Last: <span className="text-slate-400">{timeAgo(schedule.lastRunAt)}</span>
              </span>
            )}
            {schedule.lastSkippedAt && (
              <span className="text-slate-500">
                Skipped: <span className="text-amber-400/70">{timeAgo(schedule.lastSkippedAt)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily 9am', value: '0 9 * * *' },
  { label: 'Weekdays 9am', value: '0 9 * * 1-5' },
  { label: 'Monday 9am', value: '0 9 * * 1' },
  { label: 'Midnight', value: '0 0 * * *' },
]

type ScheduleFormMode = 'interval' | 'cron'

function NewScheduleForm({
  agentId,
  onSubmit,
  onCancel,
}: {
  agentId: string
  onSubmit: (data: { agentId: string; prompt: string; interval?: string; cronExpression?: string; name?: string; freshSessionPerRun?: boolean }) => void
  onCancel: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [interval, setInterval] = useState('30m')
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [mode, setMode] = useState<ScheduleFormMode>('interval')
  const [name, setName] = useState('')
  const [freshSession, setFreshSession] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    onSubmit({
      agentId,
      prompt: prompt.trim(),
      interval: mode === 'interval' ? (interval.trim() || '30m') : undefined,
      cronExpression: mode === 'cron' ? cronExpr.trim() : undefined,
      name: name.trim() || undefined,
      freshSessionPerRun: freshSession,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-3 rounded-lg border border-violet-500/30 bg-violet-500/5">
      <div>
        <label className="block text-slate-400 text-xs mb-1">Schedule Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Code Review Check"
          className="w-full bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs placeholder-slate-600 outline-none focus:border-violet-500/60 transition-colors"
        />
      </div>
      <div>
        <label className="block text-slate-400 text-xs mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="What should the agent do each run? Supports {{date}}, {{last_run_summary}}, etc."
          rows={2}
          className="w-full bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs placeholder-slate-600 outline-none focus:border-violet-500/60 transition-colors resize-y"
        />
        <p className="text-slate-600 text-[10px] mt-1">
          Variables: <code className="text-slate-500">{'{{date}}'}</code>{' '}
          <code className="text-slate-500">{'{{time}}'}</code>{' '}
          <code className="text-slate-500">{'{{day}}'}</code>{' '}
          <code className="text-slate-500">{'{{agent_name}}'}</code>{' '}
          <code className="text-slate-500">{'{{last_run_summary}}'}</code>{' '}
          <code className="text-slate-500">{'{{last_run_status}}'}</code>{' '}
          <code className="text-slate-500">{'{{run_count}}'}</code>
        </p>
      </div>

      <div>
        <div className="flex items-center gap-1 mb-1.5">
          <button
            type="button"
            onClick={() => setMode('interval')}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              mode === 'interval' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Interval
          </button>
          <button
            type="button"
            onClick={() => setMode('cron')}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              mode === 'cron' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Cron
          </button>
        </div>

        {mode === 'interval' ? (
          <>
            <div className="flex gap-1.5 flex-wrap">
              {['5m', '15m', '30m', '1h', '4h', '1d'].map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setInterval(preset)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    interval === preset
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
              <input
                type="text"
                value={interval}
                onChange={e => setInterval(e.target.value)}
                className="flex-1 bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs placeholder-slate-600 outline-none focus:border-violet-500/60 transition-colors min-w-[60px]"
                placeholder="e.g. 2h"
              />
            </div>
            <p className="text-slate-600 text-xs mt-1">Supports: 30s, 5m, 2h, 1d — runs immediately, then on interval</p>
          </>
        ) : (
          <>
            <div className="flex gap-1 flex-wrap mb-2">
              {CRON_PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setCronExpr(p.value)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    cronExpr === p.value
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={cronExpr}
              onChange={e => setCronExpr(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs font-mono placeholder-slate-600 outline-none focus:border-violet-500/60 transition-colors"
              placeholder="e.g. 0 9 * * 1-5"
            />
            <p className="text-slate-600 text-[10px] mt-1">
              Format: <code className="text-slate-500">min hour day month day-of-week</code>
            </p>
          </>
        )}
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={freshSession}
            onChange={e => setFreshSession(e.target.checked)}
            className="w-3 h-3 accent-violet-500"
          />
          <span className="text-slate-400 text-xs">Fresh session each run</span>
          <span className="text-slate-600 text-xs">(recommended — prevents context bloat)</span>
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs text-slate-400 border border-slate-700 hover:border-slate-600 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 rounded text-xs bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
        >
          Create Schedule
        </button>
      </div>
    </form>
  )
}

export function SchedulePanel({
  agentId,
  schedules,
  onCreateSchedule,
  onStartSchedule,
  onPauseSchedule,
  onDeleteSchedule,
  onTriggerSchedule,
}: {
  agentId: string
  schedules: Schedule[]
  onCreateSchedule: (data: { agentId: string; prompt: string; interval?: string; cronExpression?: string; name?: string; freshSessionPerRun?: boolean }) => void
  onStartSchedule: (scheduleId: string) => void
  onPauseSchedule: (scheduleId: string) => void
  onDeleteSchedule: (scheduleId: string) => void
  onTriggerSchedule: (scheduleId: string) => void
}) {
  const [showNewForm, setShowNewForm] = useState(false)
  const agentSchedules = schedules.filter(s => s.agentId === agentId)
  const activeCount = agentSchedules.filter(s => s.status === 'active').length

  return (
    <div className="border-t border-slate-800">
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="text-slate-400 text-xs font-medium">Schedules</span>
        {activeCount > 0 && (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
            {activeCount} active
          </span>
        )}
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="ml-auto text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          {showNewForm ? '- Cancel' : '+ Add'}
        </button>
      </div>

      <div className="px-4 pb-3 space-y-1.5">
        {showNewForm && (
          <NewScheduleForm
            agentId={agentId}
            onSubmit={(data) => {
              onCreateSchedule(data)
              setShowNewForm(false)
            }}
            onCancel={() => setShowNewForm(false)}
          />
        )}

        {agentSchedules.length === 0 && !showNewForm && (
          <div className="text-slate-600 text-xs py-2 text-center">
            No schedules. Add one to automate this agent.
          </div>
        )}

        {agentSchedules.map(schedule => (
          <ScheduleItem
            key={schedule.id}
            schedule={schedule}
            onStart={() => onStartSchedule(schedule.id)}
            onPause={() => onPauseSchedule(schedule.id)}
            onDelete={() => onDeleteSchedule(schedule.id)}
            onTrigger={() => onTriggerSchedule(schedule.id)}
          />
        ))}
      </div>
    </div>
  )
}
