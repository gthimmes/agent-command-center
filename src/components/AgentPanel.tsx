import { useState } from 'react'
import type { AgentSession, Schedule, Run, Trigger } from '../types.ts'
import { ChatMessages } from './ChatMessages.tsx'
import { InputBar } from './InputBar.tsx'
import { SchedulePanel } from './SchedulePanel.tsx'
import { TriggerPanel } from './TriggerPanel.tsx'
import { RunHistory } from './RunHistory.tsx'
import { AgentSettingsModal } from './AgentSettingsModal.tsx'

type ViewMode = 'chat' | 'runs'

type AgentUpdates = Partial<Pick<AgentSession, 'name' | 'workdir' | 'model' | 'systemPrompt' | 'dailyCostLimitUsd' | 'runTimeoutMs'>>

const STATUS_BADGE: Record<string, string> = {
  idle:    'bg-slate-700 text-slate-400',
  running: 'bg-amber-500/20 text-amber-400',
  stopped: 'bg-slate-700 text-slate-500',
  error:   'bg-red-500/20 text-red-400',
}

export function AgentPanel({
  agent,
  schedules,
  runs,
  triggers,
  onSend,
  onStop,
  onDelete,
  onUpdate,
  onCreateSchedule,
  onStartSchedule,
  onPauseSchedule,
  onDeleteSchedule,
  onTriggerSchedule,
  onCreateTrigger,
  onStartTrigger,
  onPauseTrigger,
  onDeleteTrigger,
}: {
  agent: AgentSession
  schedules: Schedule[]
  runs: Run[]
  triggers: Trigger[]
  onSend: (text: string) => void
  onStop: () => void
  onDelete: () => void
  onUpdate: (agentId: string, updates: AgentUpdates) => void
  onCreateSchedule: (data: { agentId: string; prompt: string; interval?: string; cronExpression?: string; name?: string; freshSessionPerRun?: boolean }) => void
  onStartSchedule: (scheduleId: string) => void
  onPauseSchedule: (scheduleId: string) => void
  onDeleteSchedule: (scheduleId: string) => void
  onTriggerSchedule: (scheduleId: string) => void
  onCreateTrigger: (data: { agentId: string; name?: string; prompt: string; freshSessionPerRun?: boolean }) => void
  onStartTrigger: (triggerId: string) => void
  onPauseTrigger: (triggerId: string) => void
  onDeleteTrigger: (triggerId: string) => void
}) {
  const [view, setView] = useState<ViewMode>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const shortModel = agent.model.replace('claude-', '').replace(/-\d{8}$/, '')
  const agentRunCount = runs.filter(r => r.agentId === agent.id).length

  // Today's cost (UTC) from runs
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayCost = runs
    .filter(r => r.agentId === agent.id && r.startedAt >= todayStart.getTime())
    .reduce((sum, r) => sum + r.costUsd, 0)
  const costLimit = agent.dailyCostLimitUsd ?? 0
  const pctUsed = costLimit > 0 ? Math.min(100, (todayCost / costLimit) * 100) : 0
  const costWarning = costLimit > 0 && pctUsed >= 80

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
          {agent.isWorktree && (
            <span
              title={`Git worktree from ${agent.worktreeSource}`}
              className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full flex-shrink-0 hidden sm:block"
            >
              worktree
            </span>
          )}
          {agent.slackWebhookUrl && (
            <span
              title="Slack notifications enabled"
              className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full flex-shrink-0 hidden sm:block"
            >
              slack
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {costLimit > 0 && (
            <div
              title={`Today: $${todayCost.toFixed(4)} of $${costLimit.toFixed(2)} daily limit`}
              className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded border border-slate-800"
            >
              <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${costWarning ? 'bg-red-400' : 'bg-emerald-400'}`}
                  style={{ width: `${pctUsed}%` }}
                />
              </div>
              <span className={`text-[10px] ${costWarning ? 'text-red-400' : 'text-slate-500'}`}>
                ${todayCost.toFixed(2)}/${costLimit.toFixed(0)}
              </span>
            </div>
          )}
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
            onClick={() => setShowSettings(true)}
            title="Edit agent settings"
            className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-200 text-xs transition-colors"
          >
            ⚙ Settings
          </button>
          <button
            onClick={onDelete}
            title="Delete agent"
            className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-600 hover:text-red-400 text-xs transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {showSettings && (
        <AgentSettingsModal
          agent={agent}
          onClose={() => setShowSettings(false)}
          onSave={(updates) => {
            onUpdate(agent.id, updates)
            setShowSettings(false)
          }}
        />
      )}

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

      {/* Webhooks */}
      <TriggerPanel
        agentId={agent.id}
        triggers={triggers}
        onCreateTrigger={onCreateTrigger}
        onStartTrigger={onStartTrigger}
        onPauseTrigger={onPauseTrigger}
        onDeleteTrigger={onDeleteTrigger}
      />

      {/* View tabs */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-t border-slate-800 bg-slate-900/20 flex-shrink-0">
        <button
          onClick={() => setView('chat')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            view === 'chat'
              ? 'bg-slate-800 text-slate-200'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setView('runs')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            view === 'runs'
              ? 'bg-slate-800 text-slate-200'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Runs
          {agentRunCount > 0 && (
            <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full">
              {agentRunCount}
            </span>
          )}
        </button>
      </div>

      {/* Body: chat or runs */}
      {view === 'chat' ? (
        <>
          <ChatMessages agent={agent} />
          <InputBar
            onSend={onSend}
            onStop={onStop}
            isRunning={agent.status === 'running'}
            disabled={false}
          />
        </>
      ) : (
        <RunHistory runs={runs} agentId={agent.id} />
      )}
    </div>
  )
}
