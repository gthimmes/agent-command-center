export type AgentStatus = 'idle' | 'running' | 'stopped' | 'error'

export type ChatItemKind = 'user' | 'assistant' | 'tool_call' | 'system_error'

export interface ChatItem {
  id: string
  kind: ChatItemKind
  text?: string
  toolName?: string
  toolInput?: string   // JSON string
  toolResult?: string
  toolIsError?: boolean
  toolStatus?: 'running' | 'done' | 'error'
  timestamp: number
}

export interface AgentSession {
  id: string
  name: string
  claudeSessionId?: string
  workdir: string
  model: string
  systemPrompt?: string
  status: AgentStatus
  chatItems: ChatItem[]
  createdAt: number
  lastActiveAt: number
  totalCostUsd: number
}

// --- Schedules ---

export type ScheduleStatus = 'active' | 'paused'

export interface Schedule {
  id: string
  agentId: string
  name: string
  prompt: string
  intervalMs: number
  status: ScheduleStatus
  runCount: number
  createdAt: number
  lastRunAt?: number
  lastSkippedAt?: number
  nextRunAt?: number
}

// WebSocket frames: Server -> Client
export type ServerFrame =
  | { type: 'init'; agents: AgentSession[]; schedules: Schedule[] }
  | { type: 'agent_created'; agent: AgentSession }
  | { type: 'agent_status'; agentId: string; status: AgentStatus }
  | { type: 'agent_chat_item'; agentId: string; item: ChatItem }
  | { type: 'agent_tool_updated'; agentId: string; toolId: string; result: string; isError: boolean }
  | { type: 'agent_cost'; agentId: string; totalCostUsd: number }
  | { type: 'agent_deleted'; agentId: string }
  | { type: 'agent_session_id'; agentId: string; claudeSessionId: string }
  | { type: 'schedule_created'; schedule: Schedule }
  | { type: 'schedule_updated'; schedule: Schedule }
  | { type: 'schedule_deleted'; scheduleId: string }
  | { type: 'error'; message: string }

// WebSocket frames: Client -> Server
export type ClientFrame =
  | { type: 'create_agent'; payload: { name: string; workdir: string; model: string; systemPrompt?: string } }
  | { type: 'send_message'; payload: { agentId: string; text: string } }
  | { type: 'stop_agent'; payload: { agentId: string } }
  | { type: 'delete_agent'; payload: { agentId: string } }
  | { type: 'list_agents' }
  | { type: 'create_schedule'; payload: { agentId: string; prompt: string; interval: string; name?: string } }
  | { type: 'start_schedule'; payload: { scheduleId: string } }
  | { type: 'pause_schedule'; payload: { scheduleId: string } }
  | { type: 'delete_schedule'; payload: { scheduleId: string } }
  | { type: 'trigger_schedule'; payload: { scheduleId: string } }
  | { type: 'update_schedule'; payload: { scheduleId: string; prompt?: string; interval?: string; name?: string } }
