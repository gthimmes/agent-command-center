import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { v4 as uuid } from 'uuid'
import type { AgentSession, AgentStatus, ChatItem, RunTrigger, ServerFrame } from './types.js'
import { loadSessions, saveSessions } from './session-store.js'
import type { RunManager } from './run-manager.js'

export class AgentManager extends EventEmitter {
  private sessions = new Map<string, AgentSession>()
  private processes = new Map<string, ChildProcess>()
  private runs: RunManager

  constructor(runs: RunManager) {
    super()
    this.runs = runs
  }

  async init() {
    const saved = await loadSessions()
    for (const s of saved) this.sessions.set(s.id, s)
    console.log(`[manager] Loaded ${saved.length} session(s)`)
  }

  getSessions(): AgentSession[] {
    return Array.from(this.sessions.values())
  }

  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id)
  }

  createSession(opts: {
    name: string
    workdir: string
    model: string
    systemPrompt?: string
    dailyCostLimitUsd?: number
    runTimeoutMs?: number
  }): AgentSession {
    const session: AgentSession = {
      id: uuid(),
      name: opts.name,
      workdir: opts.workdir,
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      dailyCostLimitUsd: opts.dailyCostLimitUsd,
      runTimeoutMs: opts.runTimeoutMs,
      status: 'idle',
      chatItems: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      totalCostUsd: 0,
    }
    this.sessions.set(session.id, session)
    this.persist()
    return session
  }

  /** Update mutable fields on an agent session. Broadcasts the updated agent. */
  updateSession(
    agentId: string,
    updates: Partial<Pick<AgentSession, 'name' | 'workdir' | 'model' | 'systemPrompt' | 'dailyCostLimitUsd' | 'runTimeoutMs'>>,
  ): AgentSession {
    const session = this.sessions.get(agentId)
    if (!session) throw new Error(`Agent not found: ${agentId}`)

    if (updates.name !== undefined) session.name = updates.name
    if (updates.workdir !== undefined) session.workdir = updates.workdir
    if (updates.model !== undefined) session.model = updates.model
    if (updates.systemPrompt !== undefined) session.systemPrompt = updates.systemPrompt || undefined
    if (updates.dailyCostLimitUsd !== undefined) {
      session.dailyCostLimitUsd = updates.dailyCostLimitUsd > 0 ? updates.dailyCostLimitUsd : undefined
    }
    if (updates.runTimeoutMs !== undefined) {
      session.runTimeoutMs = updates.runTimeoutMs > 0 ? updates.runTimeoutMs : undefined
    }

    this.persist()
    this.broadcast({ type: 'agent_updated', agent: session })
    return session
  }

  /** Sum of costUsd across all runs for an agent that started today (UTC). */
  private getTodayCost(agentId: string): number {
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const cutoff = startOfDay.getTime()
    let total = 0
    for (const run of this.runs.getRuns()) {
      if (run.agentId === agentId && run.startedAt >= cutoff) {
        total += run.costUsd
      }
    }
    return total
  }

  async sendMessage(
    agentId: string,
    text: string,
    opts: {
      triggeredBy?: RunTrigger
      scheduleId?: string
      triggerId?: string
      parentRunId?: string
      freshSession?: boolean
    } = {},
  ): Promise<string> {
    const session = this.sessions.get(agentId)
    if (!session) throw new Error(`Agent not found: ${agentId}`)
    if (session.status === 'running') throw new Error(`Agent is already running`)

    // Enforce daily cost limit: if exceeded, create a skipped run instead of spawning
    if (session.dailyCostLimitUsd && session.dailyCostLimitUsd > 0) {
      const todayCost = this.getTodayCost(agentId)
      if (todayCost >= session.dailyCostLimitUsd) {
        const skippedRun = this.runs.startRun({
          agentId,
          prompt: text,
          triggeredBy: opts.triggeredBy ?? 'chat',
          scheduleId: opts.scheduleId,
          triggerId: opts.triggerId,
          parentRunId: opts.parentRunId,
        })
        const reason = `Daily cost limit reached: $${todayCost.toFixed(4)} / $${session.dailyCostLimitUsd.toFixed(4)}`
        this.runs.finishRun(skippedRun.id, 'skipped', reason)
        console.warn(`[manager] ${reason} — skipping run for agent ${agentId}`)
        return skippedRun.id
      }
    }

    // Ensure working directory exists
    const { mkdirSync } = await import('fs')
    mkdirSync(session.workdir, { recursive: true })

    // Start a run for this message
    const run = this.runs.startRun({
      agentId,
      prompt: text,
      triggeredBy: opts.triggeredBy ?? 'chat',
      scheduleId: opts.scheduleId,
      triggerId: opts.triggerId,
      parentRunId: opts.parentRunId,
    })
    const runId = run.id

    // Add user message to session
    const userItem: ChatItem = { id: uuid(), kind: 'user', text, timestamp: Date.now() }
    session.chatItems.push(userItem)
    session.lastActiveAt = Date.now()
    this.runs.addChatItem(runId, userItem.id)
    this.broadcast({ type: 'agent_chat_item', agentId, item: userItem, runId })
    this.setStatus(agentId, 'running')

    // Build claude CLI command as a single string for shell execution
    const escapedText = text.replace(/"/g, '\\"')
    let cmd = `claude -p "${escapedText}" --output-format stream-json --verbose --model ${session.model} --dangerously-skip-permissions`

    // Inject the agent's persistent context/instructions via --append-system-prompt.
    // This is cached by Claude across runs (cheaper than bloating the user prompt).
    if (session.systemPrompt && session.systemPrompt.trim()) {
      const escapedPrompt = session.systemPrompt.replace(/"/g, '\\"')
      cmd += ` --append-system-prompt "${escapedPrompt}"`
    }

    // Resume prior Claude session unless the caller asked for a fresh session
    if (session.claudeSessionId && !opts.freshSession) {
      cmd += ` --resume ${session.claudeSessionId}`
    }

    console.log(`[manager] Spawning for agent ${agentId}: ${cmd.slice(0, 80)}...`)

    // Remove all Claude Code env vars so CLI doesn't think it's nested
    const childEnv = { ...process.env }
    for (const key of Object.keys(childEnv)) {
      if (key.startsWith('CLAUDE')) delete childEnv[key]
    }

    const proc = spawn(cmd, [], {
      cwd: session.workdir,
      shell: true,
      env: childEnv,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.processes.set(agentId, proc)

    // Wall-clock timeout: kill the process if it exceeds the configured limit
    let timedOut = false
    const timeoutMs = session.runTimeoutMs && session.runTimeoutMs > 0 ? session.runTimeoutMs : 0
    const timeoutHandle = timeoutMs > 0
      ? setTimeout(() => {
          console.warn(`[manager] Run ${runId} exceeded timeout (${timeoutMs}ms) — killing`)
          timedOut = true
          try { proc.kill('SIGTERM') } catch {}
          // On Windows, SIGTERM is a graceful signal — force-kill after 1s
          setTimeout(() => {
            try { proc.kill('SIGKILL') } catch {}
          }, 1000)
        }, timeoutMs)
      : null

    let lineBuffer = ''
    // Track pending assistant text between tool uses
    let pendingText = ''
    let pendingTextId = uuid()
    // Track the current active tool call item
    let activeToolItem: ChatItem | null = null
    // Track the last flushed assistant text (used to derive run summary)
    let lastAssistantText = ''
    // Track if a hard error occurred during this run
    let runError: string | undefined

    const flushText = () => {
      if (!pendingText.trim()) return
      const item: ChatItem = { id: pendingTextId, kind: 'assistant', text: pendingText, timestamp: Date.now() }
      session.chatItems.push(item)
      this.runs.addChatItem(runId, item.id)
      lastAssistantText = pendingText
      this.broadcast({ type: 'agent_chat_item', agentId, item, runId })
      pendingText = ''
      pendingTextId = uuid()
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString('utf-8')
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const event = JSON.parse(trimmed)
          this.handleClaudeEvent(session, event, {
            onText: (t) => { pendingText += t },
            onFlushText: flushText,
            onToolStart: (item) => {
              flushText()
              activeToolItem = item
              session.chatItems.push(item)
              this.runs.addChatItem(runId, item.id)
              this.broadcast({ type: 'agent_chat_item', agentId, item, runId })
            },
            onToolDone: (toolId, result, isError) => {
              if (activeToolItem?.id === toolId) {
                activeToolItem.toolResult = result
                activeToolItem.toolIsError = isError
                activeToolItem.toolStatus = isError ? 'error' : 'done'
                activeToolItem = null
              }
              this.broadcast({ type: 'agent_tool_updated', agentId, toolId, result, isError })
            },
            onSessionId: (sid) => {
              // For fresh-session runs, don't persist the session ID — next run starts fresh too
              if (opts.freshSession) return
              session.claudeSessionId = sid
              this.broadcast({ type: 'agent_session_id', agentId, claudeSessionId: sid })
            },
            onCost: (cost) => {
              session.totalCostUsd += cost
              this.runs.addCost(runId, cost)
              this.broadcast({ type: 'agent_cost', agentId, totalCostUsd: session.totalCostUsd })
            },
            onError: (msg) => {
              const errItem: ChatItem = { id: uuid(), kind: 'system_error', text: msg, timestamp: Date.now() }
              session.chatItems.push(errItem)
              this.runs.addChatItem(runId, errItem.id)
              runError = msg
              this.broadcast({ type: 'agent_chat_item', agentId, item: errItem, runId })
            },
          })
        } catch {
          // non-JSON line (e.g. diagnostic output) — ignore
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf-8').trim()
      if (msg) console.error(`[claude:${agentId}] ${msg}`)
    })

    proc.on('close', (code) => {
      this.processes.delete(agentId)
      if (timeoutHandle) clearTimeout(timeoutHandle)
      flushText()
      const failed = !(code === 0 || code === null) || runError
      const newStatus: AgentStatus = failed || timedOut ? 'error' : 'idle'
      this.setStatus(agentId, newStatus)
      // Finalize the run with a summary extracted from the last assistant text
      if (lastAssistantText) {
        this.runs.setLastAssistantText(runId, lastAssistantText)
      }
      if (timedOut) {
        this.runs.finishRun(runId, 'cancelled', `Timed out after ${timeoutMs}ms`)
      } else {
        this.runs.finishRun(runId, failed ? 'failed' : 'completed', runError)
      }
      this.persist()
    })

    proc.on('error', (err) => {
      this.processes.delete(agentId)
      if (timeoutHandle) clearTimeout(timeoutHandle)
      const msg = `Failed to start claude: ${err.message}. Make sure 'claude' is installed and in PATH.`
      const errItem: ChatItem = { id: uuid(), kind: 'system_error', text: msg, timestamp: Date.now() }
      session.chatItems.push(errItem)
      this.runs.addChatItem(runId, errItem.id)
      this.broadcast({ type: 'agent_chat_item', agentId, item: errItem, runId })
      this.setStatus(agentId, 'error')
      this.runs.finishRun(runId, 'failed', msg)
      this.persist()
    })

    return runId
  }

  private handleClaudeEvent(
    session: AgentSession,
    event: Record<string, unknown>,
    handlers: {
      onText: (t: string) => void
      onFlushText: () => void
      onToolStart: (item: ChatItem) => void
      onToolDone: (toolId: string, result: string, isError: boolean) => void
      onSessionId: (sid: string) => void
      onCost: (cost: number) => void
      onError: (msg: string) => void
    },
  ) {
    switch (event.type) {
      case 'system': {
        if (event.subtype === 'init' && typeof event.session_id === 'string') {
          handlers.onSessionId(event.session_id)
        }
        break
      }

      case 'assistant': {
        const msg = event.message as { content?: unknown[] } | null
        if (!msg?.content) break
        for (const block of msg.content as Record<string, unknown>[]) {
          if (block.type === 'text' && typeof block.text === 'string') {
            handlers.onText(block.text)
          } else if (block.type === 'tool_use') {
            // Tool use embedded in assistant message
            handlers.onFlushText()
            const toolItem: ChatItem = {
              id: block.id as string,
              kind: 'tool_call',
              toolName: block.name as string,
              toolInput: JSON.stringify(block.input, null, 2),
              toolStatus: 'running',
              timestamp: Date.now(),
            }
            handlers.onToolStart(toolItem)
          }
        }
        break
      }

      case 'tool_use': {
        // Top-level tool_use event (some versions emit separately)
        const toolItem: ChatItem = {
          id: event.id as string,
          kind: 'tool_call',
          toolName: event.name as string,
          toolInput: JSON.stringify(event.input, null, 2),
          toolStatus: 'running',
          timestamp: Date.now(),
        }
        handlers.onToolStart(toolItem)
        break
      }

      case 'tool_result': {
        const toolId = event.tool_use_id as string
        const content = (event.content as Record<string, unknown>[] | null) ?? []
        const resultText = content
          .filter(c => c.type === 'text')
          .map(c => c.text as string)
          .join('\n')
        handlers.onToolDone(toolId, resultText, Boolean(event.is_error))
        break
      }

      case 'result': {
        // Newer CLI emits total_cost_usd; older emits cost_usd
        const cost =
          typeof event.total_cost_usd === 'number' ? event.total_cost_usd :
          typeof event.cost_usd === 'number' ? event.cost_usd :
          0
        if (cost > 0) handlers.onCost(cost)
        if (event.subtype === 'error' && typeof event.result === 'string') {
          handlers.onError(event.result)
        }
        break
      }

      case 'error': {
        const err = event.error as Record<string, unknown> | string | null
        const msg = typeof err === 'object' && err !== null
          ? (err.message as string ?? JSON.stringify(err))
          : String(err ?? 'Unknown error')
        handlers.onError(msg)
        break
      }
    }
  }

  stopAgent(agentId: string) {
    const proc = this.processes.get(agentId)
    if (proc) {
      proc.kill('SIGTERM')
      this.processes.delete(agentId)
    }
    this.setStatus(agentId, 'stopped')
    this.persist()
  }

  deleteAgent(agentId: string) {
    const proc = this.processes.get(agentId)
    if (proc) {
      proc.kill('SIGTERM')
      this.processes.delete(agentId)
    }
    this.sessions.delete(agentId)
    this.runs.deleteAgentRuns(agentId)
    this.broadcast({ type: 'agent_deleted', agentId })
    this.persist()
  }

  private setStatus(agentId: string, status: AgentStatus) {
    const session = this.sessions.get(agentId)
    if (!session) return
    session.status = status
    this.broadcast({ type: 'agent_status', agentId, status })
  }

  private broadcast(frame: ServerFrame) {
    this.emit('broadcast', frame)
  }

  private persist() {
    saveSessions(this.getSessions())
  }
}
