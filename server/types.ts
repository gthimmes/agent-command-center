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
  /** Max cost per UTC day, in USD. 0 or undefined = no limit. */
  dailyCostLimitUsd?: number
  /** Max wall-clock time per run, in milliseconds. 0 or undefined = no limit. */
  runTimeoutMs?: number
}

// --- Schedules ---

export type ScheduleStatus = 'active' | 'paused'

export type ScheduleMode = 'interval' | 'cron'

export interface Schedule {
  id: string
  agentId: string
  name: string
  prompt: string
  /** Either 'interval' (use intervalMs) or 'cron' (use cronExpression). Defaults to 'interval' for older records. */
  mode?: ScheduleMode
  /** Used when mode is 'interval' */
  intervalMs: number
  /** Used when mode is 'cron' — standard 5-field cron expression (e.g. "0 9 * * 1-5") */
  cronExpression?: string
  status: ScheduleStatus
  runCount: number
  createdAt: number
  lastRunAt?: number
  lastSkippedAt?: number
  nextRunAt?: number
  /** If true, each run starts a fresh Claude session (no --resume). */
  freshSessionPerRun?: boolean
  /** Chain: when a run from this schedule completes, fire another agent with this prompt. */
  onCompleteAgentId?: string
  /** Prompt sent to the chained agent. Supports {{previous_run_summary}} + standard vars. */
  onCompletePrompt?: string
}

// --- Triggers ---

export type TriggerKind = 'webhook'
export type TriggerStatus = 'active' | 'paused'

export interface Trigger {
  id: string
  agentId: string
  name: string
  /** Prompt sent to the agent when the trigger fires. Supports template vars including {{payload}}. */
  prompt: string
  kind: TriggerKind
  /** Secret token required in the webhook URL to prevent unauthorized firings. */
  token: string
  status: TriggerStatus
  triggerCount: number
  createdAt: number
  lastFiredAt?: number
  /** If true, each fire starts a fresh Claude session (no --resume). */
  freshSessionPerRun?: boolean
  /** Chain: when a run from this trigger completes, fire another agent with this prompt. */
  onCompleteAgentId?: string
  /** Prompt sent to the chained agent. Supports {{previous_run_summary}} + standard vars. */
  onCompletePrompt?: string
}

// --- Runs ---

export type RunStatus = 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled'
export type RunTrigger = 'schedule' | 'webhook' | 'chain' | 'manual' | 'chat'

export interface Run {
  id: string
  agentId: string
  scheduleId?: string        // present for schedule-triggered runs
  triggerId?: string         // present for webhook-triggered runs
  parentRunId?: string       // present for chained runs (follow-up to a prior run)
  triggeredBy: RunTrigger
  prompt: string             // the text sent to the agent
  status: RunStatus
  startedAt: number
  endedAt?: number
  costUsd: number
  summary?: string           // extracted from final assistant message
  error?: string             // populated on failed/skipped/cancelled
  chatItemIds: string[]      // chat items attributed to this run
}

// WebSocket frames: Server -> Client
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

// WebSocket frames: Client -> Server
export type ClientFrame =
  | { type: 'create_agent'; payload: { name: string; workdir: string; model: string; systemPrompt?: string; dailyCostLimitUsd?: number; runTimeoutMs?: number } }
  | { type: 'update_agent'; payload: { agentId: string; updates: Partial<Pick<AgentSession, 'name' | 'workdir' | 'model' | 'systemPrompt' | 'dailyCostLimitUsd' | 'runTimeoutMs'>> } }
  | { type: 'send_message'; payload: { agentId: string; text: string } }
  | { type: 'stop_agent'; payload: { agentId: string } }
  | { type: 'delete_agent'; payload: { agentId: string } }
  | { type: 'list_agents' }
  | { type: 'create_schedule'; payload: { agentId: string; prompt: string; interval?: string; cronExpression?: string; name?: string; freshSessionPerRun?: boolean; onCompleteAgentId?: string; onCompletePrompt?: string } }
  | { type: 'start_schedule'; payload: { scheduleId: string } }
  | { type: 'pause_schedule'; payload: { scheduleId: string } }
  | { type: 'delete_schedule'; payload: { scheduleId: string } }
  | { type: 'trigger_schedule'; payload: { scheduleId: string } }
  | { type: 'update_schedule'; payload: { scheduleId: string; prompt?: string; interval?: string; name?: string } }
  | { type: 'create_trigger'; payload: { agentId: string; name?: string; prompt: string; freshSessionPerRun?: boolean; onCompleteAgentId?: string; onCompletePrompt?: string } }
  | { type: 'start_trigger'; payload: { triggerId: string } }
  | { type: 'pause_trigger'; payload: { triggerId: string } }
  | { type: 'delete_trigger'; payload: { triggerId: string } }
