import { useState, useCallback } from 'react'
import { useWebSocket, type WsStatus } from './hooks/useWebSocket.ts'
import { useAgents } from './hooks/useAgents.ts'
import { useNotifications } from './hooks/useNotifications.ts'
import { useUnreadRuns } from './hooks/useUnreadRuns.ts'
import { Sidebar } from './components/Sidebar.tsx'
import { AgentPanel } from './components/AgentPanel.tsx'
import { Dashboard } from './components/Dashboard.tsx'
import { SearchBar } from './components/SearchBar.tsx'
import { NewAgentModal } from './components/NewAgentModal.tsx'
import type { AgentSession, ServerFrame } from './types.ts'

type AgentUpdates = Partial<Pick<AgentSession, 'name' | 'workdir' | 'model' | 'systemPrompt' | 'dailyCostLimitUsd' | 'runTimeoutMs'>>

function ConnectionBadge({ status }: { status: WsStatus }) {
  const styles: Record<WsStatus, string> = {
    connected:    'bg-emerald-500/20 text-emerald-400',
    connecting:   'bg-amber-500/20 text-amber-400',
    disconnected: 'bg-red-500/20 text-red-400',
  }
  const labels: Record<WsStatus, string> = {
    connected:    '● connected',
    connecting:   '◌ connecting...',
    disconnected: '○ disconnected',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

export default function App() {
  const [showNewAgentModal, setShowNewAgentModal] = useState(false)
  const { agents, schedules, runs, triggers, agentList, selectedAgentId, selectedAgent, handleFrame, selectAgent } = useAgents()

  const onFrame = useCallback((frame: ServerFrame) => {
    handleFrame(frame)
  }, [handleFrame])

  const { status: wsStatus, send } = useWebSocket(onFrame)

  // Fire desktop notifications when runs finish
  useNotifications(runs, agents, selectedAgentId)

  // Track unread runs per agent for sidebar badges
  const { unreadByAgent, markViewed } = useUnreadRuns(runs, selectedAgentId)

  const handleSelectAgent = useCallback((id: string) => {
    selectAgent(id)
    markViewed(id)
  }, [selectAgent, markViewed])

  const handleCreateAgent = useCallback((opts: { name: string; workdir: string; model: string; systemPrompt?: string; dailyCostLimitUsd?: number; runTimeoutMs?: number }) => {
    send({ type: 'create_agent', payload: opts })
    setShowNewAgentModal(false)
  }, [send])

  const handleSendMessage = useCallback((text: string) => {
    if (!selectedAgentId) return
    send({ type: 'send_message', payload: { agentId: selectedAgentId, text } })
  }, [send, selectedAgentId])

  const handleStopAgent = useCallback((agentId?: string) => {
    const id = agentId ?? selectedAgentId
    if (!id) return
    send({ type: 'stop_agent', payload: { agentId: id } })
  }, [send, selectedAgentId])

  const handleDeleteAgent = useCallback((agentId?: string) => {
    const id = agentId ?? selectedAgentId
    if (!id) return
    if (!window.confirm('Delete this agent and its history?')) return
    send({ type: 'delete_agent', payload: { agentId: id } })
  }, [send, selectedAgentId])

  const handleUpdateAgent = useCallback((agentId: string, updates: AgentUpdates) => {
    send({ type: 'update_agent', payload: { agentId, updates } })
  }, [send])

  const handleCreateSchedule = useCallback((data: { agentId: string; prompt: string; interval?: string; cronExpression?: string; name?: string; freshSessionPerRun?: boolean }) => {
    send({ type: 'create_schedule', payload: data })
  }, [send])

  const handleStartSchedule = useCallback((scheduleId: string) => {
    send({ type: 'start_schedule', payload: { scheduleId } })
  }, [send])

  const handlePauseSchedule = useCallback((scheduleId: string) => {
    send({ type: 'pause_schedule', payload: { scheduleId } })
  }, [send])

  const handleDeleteSchedule = useCallback((scheduleId: string) => {
    if (!window.confirm('Delete this schedule?')) return
    send({ type: 'delete_schedule', payload: { scheduleId } })
  }, [send])

  const handleTriggerSchedule = useCallback((scheduleId: string) => {
    send({ type: 'trigger_schedule', payload: { scheduleId } })
  }, [send])

  const handleCreateTrigger = useCallback((data: { agentId: string; name?: string; prompt: string; freshSessionPerRun?: boolean }) => {
    send({ type: 'create_trigger', payload: data })
  }, [send])

  const handleStartTrigger = useCallback((triggerId: string) => {
    send({ type: 'start_trigger', payload: { triggerId } })
  }, [send])

  const handlePauseTrigger = useCallback((triggerId: string) => {
    send({ type: 'pause_trigger', payload: { triggerId } })
  }, [send])

  const handleDeleteTrigger = useCallback((triggerId: string) => {
    if (!window.confirm('Delete this webhook? The URL will stop working immediately.')) return
    send({ type: 'delete_trigger', payload: { triggerId } })
  }, [send])

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 h-9 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-violet-500 rounded-sm" />
          <span className="text-slate-300 text-xs font-semibold tracking-tight">AgentPower</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <SearchBar
            agents={Array.from(agents.values())}
            runs={Array.from(runs.values())}
            onSelectAgent={handleSelectAgent}
          />
          <span className="text-slate-600 text-xs">{agents.size} agent{agents.size !== 1 ? 's' : ''}</span>
          <ConnectionBadge status={wsStatus} />
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0 hidden sm:block">
          <Sidebar
            agents={agentList}
            selectedAgentId={selectedAgentId}
            unreadByAgent={unreadByAgent}
            onSelectAgent={handleSelectAgent}
            onDashboard={() => selectAgent(null)}
            onNewAgent={() => setShowNewAgentModal(true)}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {selectedAgent ? (
            <AgentPanel
              agent={selectedAgent}
              schedules={Array.from(schedules.values())}
              runs={Array.from(runs.values())}
              triggers={Array.from(triggers.values())}
              onSend={handleSendMessage}
              onStop={() => handleStopAgent()}
              onDelete={() => handleDeleteAgent()}
              onUpdate={handleUpdateAgent}
              onCreateSchedule={handleCreateSchedule}
              onStartSchedule={handleStartSchedule}
              onPauseSchedule={handlePauseSchedule}
              onDeleteSchedule={handleDeleteSchedule}
              onTriggerSchedule={handleTriggerSchedule}
              onCreateTrigger={handleCreateTrigger}
              onStartTrigger={handleStartTrigger}
              onPauseTrigger={handlePauseTrigger}
              onDeleteTrigger={handleDeleteTrigger}
            />
          ) : (
            <Dashboard
              agents={agentList}
              runs={Array.from(runs.values())}
              schedules={Array.from(schedules.values())}
              triggers={Array.from(triggers.values())}
              onSelectAgent={handleSelectAgent}
              onNewAgent={() => setShowNewAgentModal(true)}
            />
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="sm:hidden flex items-center gap-2 px-3 py-2 border-t border-slate-800 bg-slate-900 overflow-x-auto">
        {agentList.map(a => {
          const unread = unreadByAgent.get(a.id) ?? 0
          return (
            <button
              key={a.id}
              onClick={() => handleSelectAgent(a.id)}
              className={`relative flex-shrink-0 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                a.id === selectedAgentId ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {a.name}
              {unread > 0 && a.id !== selectedAgentId && (
                <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[9px] rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
          )
        })}
        <button
          onClick={() => setShowNewAgentModal(true)}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs bg-violet-600/20 text-violet-400 transition-colors"
        >
          + New
        </button>
      </div>

      {/* New agent modal */}
      {showNewAgentModal && (
        <NewAgentModal
          onClose={() => setShowNewAgentModal(false)}
          onCreate={handleCreateAgent}
        />
      )}
    </div>
  )
}
