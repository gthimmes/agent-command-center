import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { v4 as uuid } from 'uuid'
import type { AgentSession, AgentStatus, ChatItem, ServerFrame } from './types.js'
import { loadSessions, saveSessions } from './session-store.js'

export class AgentManager extends EventEmitter {
  private sessions = new Map<string, AgentSession>()
  private processes = new Map<string, ChildProcess>()

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

  createSession(opts: { name: string; workdir: string; model: string; systemPrompt?: string }): AgentSession {
    const session: AgentSession = {
      id: uuid(),
      name: opts.name,
      workdir: opts.workdir,
      model: opts.model,
      systemPrompt: opts.systemPrompt,
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

  async sendMessage(agentId: string, text: string): Promise<void> {
    const session = this.sessions.get(agentId)
    if (!session) throw new Error(`Agent not found: ${agentId}`)
    if (session.status === 'running') throw new Error(`Agent is already running`)

    // Ensure working directory exists
    const { mkdirSync } = await import('fs')
    mkdirSync(session.workdir, { recursive: true })

    // Add user message to session
    const userItem: ChatItem = { id: uuid(), kind: 'user', text, timestamp: Date.now() }
    session.chatItems.push(userItem)
    session.lastActiveAt = Date.now()
    this.broadcast({ type: 'agent_chat_item', agentId, item: userItem })
    this.setStatus(agentId, 'running')

    // Build claude CLI command as a single string for shell execution
    const escapedText = text.replace(/"/g, '\\"')
    let cmd = `claude -p "${escapedText}" --output-format stream-json --verbose --model ${session.model}`

    if (session.claudeSessionId) {
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

    let lineBuffer = ''
    // Track pending assistant text between tool uses
    let pendingText = ''
    let pendingTextId = uuid()
    // Track the current active tool call item
    let activeToolItem: ChatItem | null = null

    const flushText = () => {
      if (!pendingText.trim()) return
      const item: ChatItem = { id: pendingTextId, kind: 'assistant', text: pendingText, timestamp: Date.now() }
      session.chatItems.push(item)
      this.broadcast({ type: 'agent_chat_item', agentId, item })
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
              this.broadcast({ type: 'agent_chat_item', agentId, item })
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
              session.claudeSessionId = sid
              this.broadcast({ type: 'agent_session_id', agentId, claudeSessionId: sid })
            },
            onCost: (cost) => {
              session.totalCostUsd += cost
              this.broadcast({ type: 'agent_cost', agentId, totalCostUsd: session.totalCostUsd })
            },
            onError: (msg) => {
              const errItem: ChatItem = { id: uuid(), kind: 'system_error', text: msg, timestamp: Date.now() }
              session.chatItems.push(errItem)
              this.broadcast({ type: 'agent_chat_item', agentId, item: errItem })
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
      flushText()
      const newStatus: AgentStatus = code === 0 || code === null ? 'idle' : 'error'
      this.setStatus(agentId, newStatus)
      this.persist()
    })

    proc.on('error', (err) => {
      this.processes.delete(agentId)
      const errItem: ChatItem = {
        id: uuid(), kind: 'system_error',
        text: `Failed to start claude: ${err.message}. Make sure 'claude' is installed and in PATH.`,
        timestamp: Date.now(),
      }
      session.chatItems.push(errItem)
      this.broadcast({ type: 'agent_chat_item', agentId, item: errItem })
      this.setStatus(agentId, 'error')
      this.persist()
    })
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
        const cost = typeof event.cost_usd === 'number' ? event.cost_usd : 0
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
