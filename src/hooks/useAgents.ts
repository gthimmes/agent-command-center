import { useCallback, useReducer } from 'react'
import type { AgentSession, ChatItem, AgentStatus, Schedule, ServerFrame } from '../types.ts'

type State = {
  agents: Map<string, AgentSession>
  schedules: Map<string, Schedule>
  selectedAgentId: string | null
}

type Action =
  | { type: 'INIT'; agents: AgentSession[]; schedules: Schedule[] }
  | { type: 'AGENT_CREATED'; agent: AgentSession }
  | { type: 'AGENT_STATUS'; agentId: string; status: AgentStatus }
  | { type: 'AGENT_CHAT_ITEM'; agentId: string; item: ChatItem }
  | { type: 'AGENT_TOOL_UPDATED'; agentId: string; toolId: string; result: string; isError: boolean }
  | { type: 'AGENT_COST'; agentId: string; totalCostUsd: number }
  | { type: 'AGENT_DELETED'; agentId: string }
  | { type: 'AGENT_SESSION_ID'; agentId: string; claudeSessionId: string }
  | { type: 'SELECT_AGENT'; agentId: string | null }
  | { type: 'SCHEDULE_CREATED'; schedule: Schedule }
  | { type: 'SCHEDULE_UPDATED'; schedule: Schedule }
  | { type: 'SCHEDULE_DELETED'; scheduleId: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INIT': {
      const agents = new Map<string, AgentSession>()
      for (const a of action.agents) agents.set(a.id, a)
      const schedules = new Map<string, Schedule>()
      for (const s of action.schedules) schedules.set(s.id, s)
      const selectedAgentId = state.selectedAgentId && agents.has(state.selectedAgentId)
        ? state.selectedAgentId
        : (action.agents[0]?.id ?? null)
      return { agents, schedules, selectedAgentId }
    }

    case 'AGENT_CREATED': {
      const agents = new Map(state.agents)
      agents.set(action.agent.id, action.agent)
      return { ...state, agents, selectedAgentId: action.agent.id }
    }

    case 'AGENT_STATUS': {
      const session = state.agents.get(action.agentId)
      if (!session) return state
      const agents = new Map(state.agents)
      agents.set(action.agentId, { ...session, status: action.status })
      return { ...state, agents }
    }

    case 'AGENT_CHAT_ITEM': {
      const session = state.agents.get(action.agentId)
      if (!session) return state
      // Deduplicate by item ID (broadcasts go to all clients including sender)
      if (session.chatItems.some(i => i.id === action.item.id)) return state
      const agents = new Map(state.agents)
      agents.set(action.agentId, {
        ...session,
        chatItems: [...session.chatItems, action.item],
        lastActiveAt: Date.now(),
      })
      return { ...state, agents }
    }

    case 'AGENT_TOOL_UPDATED': {
      const session = state.agents.get(action.agentId)
      if (!session) return state
      const agents = new Map(state.agents)
      agents.set(action.agentId, {
        ...session,
        chatItems: session.chatItems.map(item =>
          item.id === action.toolId
            ? { ...item, toolResult: action.result, toolIsError: action.isError, toolStatus: action.isError ? 'error' as const : 'done' as const }
            : item
        ),
      })
      return { ...state, agents }
    }

    case 'AGENT_COST': {
      const session = state.agents.get(action.agentId)
      if (!session) return state
      const agents = new Map(state.agents)
      agents.set(action.agentId, { ...session, totalCostUsd: action.totalCostUsd })
      return { ...state, agents }
    }

    case 'AGENT_DELETED': {
      const agents = new Map(state.agents)
      agents.delete(action.agentId)
      // Also remove schedules for this agent
      const schedules = new Map(state.schedules)
      for (const [id, s] of schedules) {
        if (s.agentId === action.agentId) schedules.delete(id)
      }
      const ids = Array.from(agents.keys())
      const selectedAgentId = action.agentId === state.selectedAgentId ? (ids[0] ?? null) : state.selectedAgentId
      return { agents, schedules, selectedAgentId }
    }

    case 'AGENT_SESSION_ID': {
      const session = state.agents.get(action.agentId)
      if (!session) return state
      const agents = new Map(state.agents)
      agents.set(action.agentId, { ...session, claudeSessionId: action.claudeSessionId })
      return { ...state, agents }
    }

    case 'SELECT_AGENT':
      return { ...state, selectedAgentId: action.agentId }

    case 'SCHEDULE_CREATED': {
      const schedules = new Map(state.schedules)
      schedules.set(action.schedule.id, action.schedule)
      return { ...state, schedules }
    }

    case 'SCHEDULE_UPDATED': {
      const schedules = new Map(state.schedules)
      schedules.set(action.schedule.id, action.schedule)
      return { ...state, schedules }
    }

    case 'SCHEDULE_DELETED': {
      const schedules = new Map(state.schedules)
      schedules.delete(action.scheduleId)
      return { ...state, schedules }
    }

    default:
      return state
  }
}

export function useAgents() {
  const [state, dispatch] = useReducer(reducer, { agents: new Map(), schedules: new Map(), selectedAgentId: null })

  const handleFrame = useCallback((frame: ServerFrame) => {
    switch (frame.type) {
      case 'init':          dispatch({ type: 'INIT', agents: frame.agents, schedules: frame.schedules }); break
      case 'agent_created': dispatch({ type: 'AGENT_CREATED', agent: frame.agent }); break
      case 'agent_status':  dispatch({ type: 'AGENT_STATUS', agentId: frame.agentId, status: frame.status }); break
      case 'agent_chat_item': dispatch({ type: 'AGENT_CHAT_ITEM', agentId: frame.agentId, item: frame.item }); break
      case 'agent_tool_updated': dispatch({ type: 'AGENT_TOOL_UPDATED', agentId: frame.agentId, toolId: frame.toolId, result: frame.result, isError: frame.isError }); break
      case 'agent_cost':    dispatch({ type: 'AGENT_COST', agentId: frame.agentId, totalCostUsd: frame.totalCostUsd }); break
      case 'agent_deleted': dispatch({ type: 'AGENT_DELETED', agentId: frame.agentId }); break
      case 'agent_session_id': dispatch({ type: 'AGENT_SESSION_ID', agentId: frame.agentId, claudeSessionId: frame.claudeSessionId }); break
      case 'schedule_created': dispatch({ type: 'SCHEDULE_CREATED', schedule: frame.schedule }); break
      case 'schedule_updated': dispatch({ type: 'SCHEDULE_UPDATED', schedule: frame.schedule }); break
      case 'schedule_deleted': dispatch({ type: 'SCHEDULE_DELETED', scheduleId: frame.scheduleId }); break
    }
  }, [])

  const selectAgent = useCallback((agentId: string | null) => {
    dispatch({ type: 'SELECT_AGENT', agentId })
  }, [])

  return {
    agents: state.agents,
    schedules: state.schedules,
    selectedAgentId: state.selectedAgentId,
    selectedAgent: state.selectedAgentId ? state.agents.get(state.selectedAgentId) ?? null : null,
    agentList: Array.from(state.agents.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt),
    handleFrame,
    selectAgent,
  }
}
