import type { AgentSession } from '../types.ts'

const STATUS_DOT: Record<string, string> = {
  idle:    'bg-slate-500',
  running: 'bg-amber-400 animate-pulse',
  stopped: 'bg-slate-600',
  error:   'bg-red-500',
}

const STATUS_LABEL: Record<string, string> = {
  idle:    'idle',
  running: 'running',
  stopped: 'stopped',
  error:   'error',
}

function AgentItem({
  agent,
  selected,
  unread,
  onClick,
}: {
  agent: AgentSession
  selected: boolean
  unread: number
  onClick: () => void
}) {
  const shortModel = agent.model.replace('claude-', '').replace(/-\d{8}$/, '')
  const showBadge = unread > 0 && !selected

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
        selected ? 'bg-slate-700/60 text-slate-100' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${STATUS_DOT[agent.status]}`} />
        <span className={`truncate text-xs flex-1 ${showBadge ? 'font-semibold text-slate-200' : 'font-medium'}`}>
          {agent.name}
        </span>
        {showBadge && (
          <span className="flex-shrink-0 bg-violet-500 text-white text-[9px] rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center font-semibold">
            {unread}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-0.5 pl-4">
        <span className="text-slate-600 text-xs truncate">{shortModel}</span>
        <span className={`text-xs ml-auto ${selected ? 'text-slate-500' : 'text-slate-700'}`}>
          {STATUS_LABEL[agent.status]}
        </span>
      </div>
      {agent.totalCostUsd > 0 && (
        <div className="pl-4 mt-0.5">
          <span className="text-slate-700 text-xs">${agent.totalCostUsd.toFixed(4)}</span>
        </div>
      )}
    </button>
  )
}

export function Sidebar({
  agents,
  selectedAgentId,
  unreadByAgent,
  onSelectAgent,
  onDashboard,
  onNewAgent,
}: {
  agents: AgentSession[]
  selectedAgentId: string | null
  unreadByAgent: Map<string, number>
  onSelectAgent: (id: string) => void
  onDashboard: () => void
  onNewAgent: () => void
}) {
  const running = agents.filter(a => a.status === 'running').length
  const totalUnread = Array.from(unreadByAgent.values()).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col h-full bg-slate-900/50 border-r border-slate-800">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-violet-500 rounded-sm" />
          <span className="text-slate-200 font-semibold text-sm tracking-tight">AgentPower</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {totalUnread > 0 && (
            <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full font-semibold">
              {totalUnread} new
            </span>
          )}
          {running > 0 && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
              {running} running
            </span>
          )}
        </div>
      </div>

      {/* Dashboard link */}
      <div className="px-2 pt-2">
        <button
          onClick={onDashboard}
          className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-xs ${
            selectedAgentId === null
              ? 'bg-slate-700/60 text-slate-100 font-medium'
              : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
          }`}
        >
          &#x25A6; Dashboard
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {agents.length === 0 && (
          <div className="text-center py-8 text-slate-600 text-xs">
            No agents yet.
            <br />
            Create one below.
          </div>
        )}
        {agents.map(agent => (
          <AgentItem
            key={agent.id}
            agent={agent}
            selected={agent.id === selectedAgentId}
            unread={unreadByAgent.get(agent.id) ?? 0}
            onClick={() => onSelectAgent(agent.id)}
          />
        ))}
      </div>

      {/* New agent button */}
      <div className="p-3 border-t border-slate-800">
        <button
          onClick={onNewAgent}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New Agent
        </button>
      </div>
    </div>
  )
}
