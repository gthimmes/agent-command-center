import { useCallback, useReducer } from 'react'
import type { AgentSession, ChatItem, AgentStatus, Schedule, Run, Trigger, ServerFrame } from '../types.ts'

type State = {
  agents: Map<string, AgentSession>
  schedules: Map<string, Schedule>
  runs: Map<string, Run>
  triggers: Map<string, Trigger>
  selectedAgentId: string | null
}

type Action =
  | { type: 'INIT'; agents: AgentSession[]; schedules: Schedule[]; runs: Run[]; triggers: Trigger[] }
  | { type: 'AGENT_CREATED'; agent: AgentSession }
  | { type: 'AGENT_UPDATED'; agent: AgentSession }
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
  | { type: 'RUN_STARTED'; run: Run }
  | { type: 'RUN_UPDATED'; run: Run }
  | { type: 'TRIGGER_CREATED'; trigger: Trigger }
  | { type: 'TRIGGER_UPDATED'; trigger: Trigger }
  | { type: 'TRIGGER_DELETED'; triggerId: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INIT': {
      const agents = new Map<string, AgentSession>()
      for (const a of action.agents) agents.set(a.id, a)
      const schedules = new Map<string, Schedule>()
      for (const s of action.schedules) schedules.set(s.id, s)
      const runs = new Map<string, Run>()
      for (const r of action.runs) runs.set(r.id, r)
      const triggers = new Map<string, Trigger>()
      for (const t of action.triggers) triggers.set(t.id, t)
      const selectedAgentId = state.selectedAgentId && agents.has(state.selectedAgentId)
        ? state.selectedAgentId
        : (action.agents[0]?.id ?? null)
      return { agents, schedules, runs, triggers, selectedAgentId }
    }

    case 'AGENT_CREATED': {
      const agents = new Map(state.agents)
      agents.set(action.agent.id, action.agent)
      return { ...state, agents, selectedAgentId: action.agent.id }
    }

    case 'AGENT_UPDATED': {
      const existing = state.agents.get(action.agent.id)
      if (!existing) return state
      const agents = new Map(state.agents)
      // Merge: preserve chat items and volatile fields like status that come from other frames
      agents.set(action.agent.id, { ...existing, ...action.agent, chatItems: existing.chatItems })
      return { ...state, agents }
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
      // Also remove schedules, runs, and triggers for this agent
      const schedules = new Map(state.schedules)
      for (const [id, s] of schedules) {
        if (s.agentId === action.agentId) schedules.delete(id)
      }
      const runs = new Map(state.runs)
      for (const [id, r] of runs) {
        if (r.agentId === action.agentId) runs.delete(id)
      }
      const triggers = new Map(state.triggers)
      for (const [id, t] of triggers) {
        if (t.agentId === action.agentId) triggers.delete(id)
      }
      const ids = Array.from(agents.keys())
      const selectedAgentId = action.agentId === state.selectedAgentId ? (ids[0] ?? null) : state.selectedAgentId
      return { agents, schedules, runs, triggers, selectedAgentId }
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

    case 'RUN_STARTED':
    case 'RUN_UPDATED': {
      const runs = new Map(state.runs)
      runs.set(action.run.id, action.run)
      return { ...state, runs }
    }

    case 'TRIGGER_CREATED':
    case 'TRIGGER_UPDATED': {
      const triggers = new Map(state.triggers)
      triggers.set(action.trigger.id, action.trigger)
      return { ...state, triggers }
    }

    case 'TRIGGER_DELETED': {
      const triggers = new Map(state.triggers)
      triggers.delete(action.triggerId)
      return { ...state, triggers }
    }

    default:
      return state
  }
}

export function useAgents() {
  const [state, dispatch] = useReducer(reducer, { agents: new Map(), schedules: new Map(), runs: new Map(), triggers: new Map(), selectedAgentId: null })

  const handleFrame = useCallback((frame: ServerFrame) => {
    switch (frame.type) {
      case 'init':          dispatch({ type: 'INIT', agents: frame.agents, schedules: frame.schedules, runs: frame.runs, triggers: frame.triggers }); break
      case 'agent_created': dispatch({ type: 'AGENT_CREATED', agent: frame.agent }); break
      case 'agent_updated': dispatch({ type: 'AGENT_UPDATED', agent: frame.agent }); break
      case 'agent_status':  dispatch({ type: 'AGENT_STATUS', agentId: frame.agentId, status: frame.status }); break
      case 'agent_chat_item': dispatch({ type: 'AGENT_CHAT_ITEM', agentId: frame.agentId, item: frame.item }); break
      case 'agent_tool_updated': dispatch({ type: 'AGENT_TOOL_UPDATED', agentId: frame.agentId, toolId: frame.toolId, result: frame.result, isError: frame.isError }); break
      case 'agent_cost':    dispatch({ type: 'AGENT_COST', agentId: frame.agentId, totalCostUsd: frame.totalCostUsd }); break
      case 'agent_deleted': dispatch({ type: 'AGENT_DELETED', agentId: frame.agentId }); break
      case 'agent_session_id': dispatch({ type: 'AGENT_SESSION_ID', agentId: frame.agentId, claudeSessionId: frame.claudeSessionId }); break
      case 'schedule_created': dispatch({ type: 'SCHEDULE_CREATED', schedule: frame.schedule }); break
      case 'schedule_updated': dispatch({ type: 'SCHEDULE_UPDATED', schedule: frame.schedule }); break
      case 'schedule_deleted': dispatch({ type: 'SCHEDULE_DELETED', scheduleId: frame.scheduleId }); break
      case 'run_started':    dispatch({ type: 'RUN_STARTED', run: frame.run }); break
      case 'run_updated':    dispatch({ type: 'RUN_UPDATED', run: frame.run }); break
      case 'trigger_created': dispatch({ type: 'TRIGGER_CREATED', trigger: frame.trigger }); break
      case 'trigger_updated': dispatch({ type: 'TRIGGER_UPDATED', trigger: frame.trigger }); break
      case 'trigger_deleted': dispatch({ type: 'TRIGGER_DELETED', triggerId: frame.triggerId }); break
    }
  }, [])

  const selectAgent = useCallback((agentId: string | null) => {
    dispatch({ type: 'SELECT_AGENT', agentId })
  }, [])

  return {
    agents: state.agents,
    schedules: state.schedules,
    runs: state.runs,
    triggers: state.triggers,
    selectedAgentId: state.selectedAgentId,
    selectedAgent: state.selectedAgentId ? state.agents.get(state.selectedAgentId) ?? null : null,
    agentList: Array.from(state.agents.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt),
    handleFrame,
    selectAgent,
  }
}
