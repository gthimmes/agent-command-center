export type AgentStatus = 'idle' | 'running' | 'stopped' | 'error'
export type ChatItemKind = 'user' | 'assistant' | 'tool_call' | 'system_error'

export interface ChatItem {
  id: string
  kind: ChatItemKind
  text?: string
  toolName?: string
  toolInput?: string
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
  dailyCostLimitUsd?: number
  runTimeoutMs?: number
  isWorktree?: boolean
  worktreeSource?: string
  slackWebhookUrl?: string
  slackNotifyOn?: SlackNotifyEvent[]
}

export type SlackNotifyEvent = 'completed' | 'failed' | 'skipped' | 'cancelled'

// --- Schedules ---

export type ScheduleStatus = 'active' | 'paused'

export type ScheduleMode = 'interval' | 'cron'

export interface Schedule {
  id: string
  agentId: string
  name: string
  prompt: string
  mode?: ScheduleMode
  intervalMs: number
  cronExpression?: string
  status: ScheduleStatus
  runCount: number
  createdAt: number
  lastRunAt?: number
  lastSkippedAt?: number
  nextRunAt?: number
  freshSessionPerRun?: boolean
  onCompleteAgentId?: string
  onCompletePrompt?: string
}

// --- Triggers ---

export type TriggerKind = 'webhook'
export type TriggerStatus = 'active' | 'paused'

export interface Trigger {
  id: string
  agentId: string
  name: string
  prompt: string
  kind: TriggerKind
  token: string
  status: TriggerStatus
  triggerCount: number
  createdAt: number
  lastFiredAt?: number
  freshSessionPerRun?: boolean
  onCompleteAgentId?: string
  onCompletePrompt?: string
}

// --- Runs ---

export type RunStatus = 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled'
export type RunTrigger = 'schedule' | 'webhook' | 'chain' | 'manual' | 'chat'

export interface Run {
  id: string
  agentId: string
  scheduleId?: string
  triggerId?: string
  parentRunId?: string
  triggeredBy: RunTrigger
  prompt: string
  status: RunStatus
  startedAt: number
  endedAt?: number
  costUsd: number
  summary?: string
  error?: string
  chatItemIds: string[]
}

export type ServerFrame =
  | { type: 'init'; agents: AgentSession[]; schedules: Schedule[]; runs: Run[]; triggers: Trigger[] }
  | { type: 'agent_created'; agent: AgentSession }
  | { type: 'agent_updated'; agent: AgentSession }
  | { type: 'agent_status'; agentId: string; status: AgentStatus }
  | { type: 'agent_chat_item'; agentId: string; item: ChatItem; runId?: string }
  | { type: 'agent_tool_updated'; agentId: string; toolId: string; result: string; isError: boolean }
  | { type: 'agent_cost'; agentId: string; totalCostUsd: number }
  | { type: 'agent_deleted'; agentId: string }
  | { type: 'agent_session_id'; agentId: string; claudeSessionId: string }
  | { type: 'schedule_created'; schedule: Schedule }
  | { type: 'schedule_updated'; schedule: Schedule }
  | { type: 'schedule_deleted'; scheduleId: string }
  | { type: 'trigger_created'; trigger: Trigger }
  | { type: 'trigger_updated'; trigger: Trigger }
  | { type: 'trigger_deleted'; triggerId: string }
  | { type: 'run_started'; run: Run }
  | { type: 'run_updated'; run: Run }
  | { type: 'error'; message: string }
