import { EventEmitter } from 'events'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'
import type { AgentManager } from './agent-manager.js'
import type { Schedule, ScheduleStatus, ServerFrame } from './types.js'

const DATA_DIR = path.join(os.homedir(), '.agentpower')
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json')

/**
 * Parse a human-friendly interval string into milliseconds.
 * Supports: "30s", "5m", "2h", "1d", or raw number (treated as minutes).
 */
export function parseInterval(input: string): number {
  const trimmed = input.trim().toLowerCase()
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)?$/)
  if (!match) throw new Error(`Invalid interval: "${input}". Use e.g. "30s", "5m", "2h", "1d"`)

  const value = parseFloat(match[1])
  const unit = match[2] ?? 'm' // default to minutes

  switch (unit[0]) {
    case 's': return Math.round(value * 1000)
    case 'm': return Math.round(value * 60 * 1000)
    case 'h': return Math.round(value * 60 * 60 * 1000)
    case 'd': return Math.round(value * 24 * 60 * 60 * 1000)
    default:  return Math.round(value * 60 * 1000)
  }
}

export function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1).replace(/\.0$/, '')}h`
  return `${(ms / 86_400_000).toFixed(1).replace(/\.0$/, '')}d`
}

export class Scheduler extends EventEmitter {
  private schedules = new Map<string, Schedule>()
  private timers = new Map<string, ReturnType<typeof setInterval>>()
  private manager: AgentManager

  constructor(manager: AgentManager) {
    super()
    this.manager = manager
  }

  async init() {
    const saved = await this.loadSchedules()
    for (const s of saved) {
      this.schedules.set(s.id, s)
      // Re-arm any schedules that were active before shutdown
      if (s.status === 'active') {
        this.armTimer(s)
      }
    }
    console.log(`[scheduler] Loaded ${saved.length} schedule(s), ${this.timers.size} active`)
  }

  getSchedules(): Schedule[] {
    return Array.from(this.schedules.values())
  }

  getSchedulesForAgent(agentId: string): Schedule[] {
    return this.getSchedules().filter(s => s.agentId === agentId)
  }

  createSchedule(opts: {
    agentId: string
    prompt: string
    intervalMs: number
    name?: string
  }): Schedule {
    // Verify the agent exists
    const agent = this.manager.getSession(opts.agentId)
    if (!agent) throw new Error(`Agent not found: ${opts.agentId}`)

    const schedule: Schedule = {
      id: uuid(),
      agentId: opts.agentId,
      name: opts.name || `Schedule for ${agent.name}`,
      prompt: opts.prompt,
      intervalMs: opts.intervalMs,
      status: 'paused',
      runCount: 0,
      createdAt: Date.now(),
    }

    this.schedules.set(schedule.id, schedule)
    this.persist()
    this.broadcast({ type: 'schedule_created', schedule })
    return schedule
  }

  startSchedule(scheduleId: string): void {
    const schedule = this.schedules.get(scheduleId)
    if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`)
    if (schedule.status === 'active') return

    schedule.status = 'active'
    this.armTimer(schedule)
    this.persist()
    this.broadcast({ type: 'schedule_updated', schedule })
    console.log(`[scheduler] Started schedule "${schedule.name}" (every ${formatInterval(schedule.intervalMs)})`)
  }

  pauseSchedule(scheduleId: string): void {
    const schedule = this.schedules.get(scheduleId)
    if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`)

    schedule.status = 'paused'
    this.clearTimer(scheduleId)
    this.persist()
    this.broadcast({ type: 'schedule_updated', schedule })
    console.log(`[scheduler] Paused schedule "${schedule.name}"`)
  }

  deleteSchedule(scheduleId: string): void {
    this.clearTimer(scheduleId)
    this.schedules.delete(scheduleId)
    this.persist()
    this.broadcast({ type: 'schedule_deleted', scheduleId })
  }

  updateSchedule(scheduleId: string, updates: {
    prompt?: string
    intervalMs?: number
    name?: string
  }): void {
    const schedule = this.schedules.get(scheduleId)
    if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`)

    if (updates.prompt !== undefined) schedule.prompt = updates.prompt
    if (updates.name !== undefined) schedule.name = updates.name
    if (updates.intervalMs !== undefined) {
      schedule.intervalMs = updates.intervalMs
      // Re-arm if currently active
      if (schedule.status === 'active') {
        this.clearTimer(scheduleId)
        this.armTimer(schedule)
      }
    }

    this.persist()
    this.broadcast({ type: 'schedule_updated', schedule })
  }

  /** Run a schedule's prompt immediately (outside the timer cycle). */
  async triggerNow(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId)
    if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`)
    await this.executeSchedule(schedule)
  }

  private armTimer(schedule: Schedule): void {
    this.clearTimer(schedule.id)

    // Run immediately on first arm, then on interval
    this.executeSchedule(schedule)

    const timer = setInterval(() => {
      this.executeSchedule(schedule)
    }, schedule.intervalMs)

    this.timers.set(schedule.id, timer)
  }

  private clearTimer(scheduleId: string): void {
    const timer = this.timers.get(scheduleId)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(scheduleId)
    }
  }

  private async executeSchedule(schedule: Schedule): Promise<void> {
    const agent = this.manager.getSession(schedule.agentId)
    if (!agent) {
      console.warn(`[scheduler] Agent ${schedule.agentId} not found, pausing schedule "${schedule.name}"`)
      schedule.status = 'paused'
      this.clearTimer(schedule.id)
      this.persist()
      this.broadcast({ type: 'schedule_updated', schedule })
      return
    }

    // Skip if agent is currently running
    if (agent.status === 'running') {
      console.log(`[scheduler] Agent "${agent.name}" is busy, skipping scheduled run`)
      schedule.lastSkippedAt = Date.now()
      this.broadcast({ type: 'schedule_updated', schedule })
      return
    }

    console.log(`[scheduler] Executing schedule "${schedule.name}" -> agent "${agent.name}"`)
    schedule.lastRunAt = Date.now()
    schedule.runCount++
    schedule.nextRunAt = Date.now() + schedule.intervalMs
    this.persist()
    this.broadcast({ type: 'schedule_updated', schedule })

    try {
      await this.manager.sendMessage(schedule.agentId, schedule.prompt)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[scheduler] Failed to execute schedule "${schedule.name}": ${msg}`)
    }
  }

  private broadcast(frame: ServerFrame) {
    this.emit('broadcast', frame)
  }

  private async loadSchedules(): Promise<Schedule[]> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true })
      const raw = await fs.readFile(SCHEDULES_FILE, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true })
      const data = Array.from(this.schedules.values())
      await fs.writeFile(SCHEDULES_FILE, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[scheduler] Failed to save schedules:', err)
    }
  }

  /** Clean up all timers on shutdown. */
  shutdown(): void {
    for (const [id] of this.timers) {
      this.clearTimer(id)
    }
  }
}
