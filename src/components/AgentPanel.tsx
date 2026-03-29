import type { AgentSession, Schedule } from '../types.ts'
import { ChatMessages } from './ChatMessages.tsx'
import { InputBar } from './InputBar.tsx'
import { SchedulePanel } from './SchedulePanel.tsx'

const STATUS_BADGE: Record<string, string> = {
  idle:    'bg-slate-700 text-slate-400',
  running: 'bg-amber-500/20 text-amber-400',
  stopped: 'bg-slate-700 text-slate-500',
  error:   'bg-red-500/20 text-red-400',
}

export function AgentPanel({
  agent,
  schedules,
  onSend,
  onStop,
  onDelete,
  onCreateSchedule,
  onStartSchedule,
  onPauseSchedule,
  onDeleteSchedule,
  onTriggerSchedule,
}: {
  agent: AgentSession
  schedules: Schedule[]
  onSend: (text: string) => void
  onStop: () => void
  onDelete: () => void
  onCreateSchedule: (data: { agentId: string; prompt: string; interval: string; name?: string }) => void
  onStartSchedule: (scheduleId: string) => void
  onPauseSchedule: (scheduleId: string) => void
  onDeleteSchedule: (scheduleId: string) => void
  onTriggerSchedule: (scheduleId: string) => void
}) {
  const shortModel = agent.model.replace('claude-', '').replace(/-\d{8}$/, '')

  return (
    <div className="flex flex-col h-full">
      {/* Agent header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-900/30 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-slate-200 font-medium text-sm truncate">{agent.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[agent.status]}`}>
            {agent.status}
          </span>
          <span className="text-slate-600 text-xs flex-shrink-0 hidden sm:block">{shortModel}</span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {agent.totalCostUsd > 0 && (
            <span className="text-slate-600 text-xs">${agent.totalCostUsd.toFixed(4)}</span>
          )}
          {agent.workdir && (
            <span
              title={agent.workdir}
              className="text-slate-600 text-xs border border-slate-800 rounded px-1.5 py-0.5 truncate max-w-[140px] hidden md:block"
            >
              {agent.workdir.split(/[\\/]/).pop()}
            </span>
          )}
          {agent.status === 'running' && (
            <button
              onClick={onStop}
              title="Stop agent"
              className="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs transition-colors"
            >
              Stop
            </button>
          )}
          <button
            onClick={onDelete}
            title="Delete agent"
            className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-600 hover:text-red-400 text-xs transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Schedules */}
      <SchedulePanel
        agentId={agent.id}
        schedules={schedules}
        onCreateSchedule={onCreateSchedule}
        onStartSchedule={onStartSchedule}
        onPauseSchedule={onPauseSchedule}
        onDeleteSchedule={onDeleteSchedule}
        onTriggerSchedule={onTriggerSchedule}
      />

      {/* Messages */}
      <ChatMessages agent={agent} />

      {/* Input */}
      <InputBar
        onSend={onSend}
        onStop={onStop}
        isRunning={agent.status === 'running'}
        disabled={false}
      />
    </div>
  )
}
