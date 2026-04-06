import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import { randomBytes } from 'crypto'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import type { AgentManager } from './agent-manager.js'
import type { RunManager } from './run-manager.js'
import type { Trigger, ServerFrame } from './types.js'
import { resolveTemplate } from './template.js'

const DATA_DIR = path.join(os.homedir(), '.agentpower')
const TRIGGERS_FILE = path.join(DATA_DIR, 'triggers.json')

/**
 * TriggerManager handles event-based triggers (currently webhooks).
 * Unlike Schedules which fire on time, triggers fire when an external
 * system POSTs to a secret URL. The payload is exposed to the prompt
 * template via the {{payload}} variable.
 */
export class TriggerManager extends EventEmitter {
  private triggers = new Map<string, Trigger>()
  private manager: AgentManager
  private runs: RunManager

  constructor(manager: AgentManager, runs: RunManager) {
    super()
    this.manager = manager
    this.runs = runs
  }

  async init() {
    const saved = await this.load()
    for (const t of saved) this.triggers.set(t.id, t)
    console.log(`[triggers] Loaded ${saved.length} trigger(s)`)
  }

  getTriggers(): Trigger[] {
    return Array.from(this.triggers.values())
  }

  getTrigger(id: string): Trigger | undefined {
    return this.triggers.get(id)
  }

  createTrigger(opts: {
    agentId: string
    name?: string
    prompt: string
    freshSessionPerRun?: boolean
    onCompleteAgentId?: string
    onCompletePrompt?: string
  }): Trigger {
    const agent = this.manager.getSession(opts.agentId)
    if (!agent) throw new Error(`Agent not found: ${opts.agentId}`)
    if (!opts.prompt.trim()) throw new Error('Trigger prompt cannot be empty')

    const trigger: Trigger = {
      id: uuid(),
      agentId: opts.agentId,
      name: opts.name || `Webhook for ${agent.name}`,
      prompt: opts.prompt,
      kind: 'webhook',
      token: randomBytes(24).toString('base64url'),
      status: 'active',
      triggerCount: 0,
      createdAt: Date.now(),
      freshSessionPerRun: opts.freshSessionPerRun,
      onCompleteAgentId: opts.onCompleteAgentId,
      onCompletePrompt: opts.onCompletePrompt,
    }

    this.triggers.set(trigger.id, trigger)
    this.persist()
    this.broadcast({ type: 'trigger_created', trigger })
    return trigger
  }

  startTrigger(triggerId: string): void {
    const trigger = this.triggers.get(triggerId)
    if (!trigger) throw new Error(`Trigger not found: ${triggerId}`)
    if (trigger.status === 'active') return
    trigger.status = 'active'
    this.persist()
    this.broadcast({ type: 'trigger_updated', trigger })
  }

  pauseTrigger(triggerId: string): void {
    const trigger = this.triggers.get(triggerId)
    if (!trigger) throw new Error(`Trigger not found: ${triggerId}`)
    trigger.status = 'paused'
    this.persist()
    this.broadcast({ type: 'trigger_updated', trigger })
  }

  deleteTrigger(triggerId: string): void {
    this.triggers.delete(triggerId)
    this.persist()
    this.broadcast({ type: 'trigger_deleted', triggerId })
  }

  /** Remove all triggers for an agent. */
  deleteAgentTriggers(agentId: string): void {
    for (const [id, t] of this.triggers) {
      if (t.agentId === agentId) this.triggers.delete(id)
    }
    this.persist()
  }

  /**
   * Fire a trigger: resolve the prompt template with the payload,
   * then invoke sendMessage on the bound agent.
   * Returns the runId of the created run.
   */
  async fire(triggerId: string, payload: unknown): Promise<string> {
    const trigger = this.triggers.get(triggerId)
    if (!trigger) throw new Error(`Trigger not found: ${triggerId}`)
    if (trigger.status !== 'active') throw new Error('Trigger is paused')

    const agent = this.manager.getSession(trigger.agentId)
    if (!agent) throw new Error(`Agent not found: ${trigger.agentId}`)

    // Resolve template with agent + payload context.
    // We use resolveTemplate for shared vars and then substitute {{payload}} ourselves.
    const basePrompt = resolveTemplate(trigger.prompt, {
      agent,
      // Reuse the Schedule-shaped context; we adapt trigger fields for runCount/last summary.
      schedule: {
        id: trigger.id,
        agentId: trigger.agentId,
        name: trigger.name,
        prompt: trigger.prompt,
        intervalMs: 0,
        status: 'active',
        runCount: trigger.triggerCount,
        createdAt: trigger.createdAt,
      },
      priorRuns: this.runs.getRuns()
        .filter((r) => r.triggerId === trigger.id)
        .sort((a, b) => b.startedAt - a.startedAt),
    })

    // Substitute the raw JSON payload for {{payload}}
    const payloadStr = payload === undefined ? '' : JSON.stringify(payload, null, 2)
    const resolvedPrompt = basePrompt.replace(/\{\{payload\}\}/g, payloadStr)

    trigger.triggerCount++
    trigger.lastFiredAt = Date.now()
    this.persist()
    this.broadcast({ type: 'trigger_updated', trigger })

    console.log(`[triggers] Firing "${trigger.name}" for agent "${agent.name}"`)
    const runId = await this.manager.sendMessage(trigger.agentId, resolvedPrompt, {
      triggeredBy: 'webhook',
      triggerId: trigger.id,
      freshSession: trigger.freshSessionPerRun,
    })
    return runId
  }

  private broadcast(frame: ServerFrame) {
    this.emit('broadcast', frame)
  }

  private async load(): Promise<Trigger[]> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true })
      const raw = await fs.readFile(TRIGGERS_FILE, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true })
      await fs.writeFile(TRIGGERS_FILE, JSON.stringify(this.getTriggers(), null, 2), 'utf-8')
    } catch (err) {
      console.error('[triggers] Failed to save triggers:', err)
    }
  }
}
