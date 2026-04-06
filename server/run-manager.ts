import { EventEmitter } from 'events'
import { v4 as uuid } from 'uuid'
import type { Run, RunStatus, RunTrigger, ServerFrame } from './types.js'
import { loadRuns, saveRuns } from './run-store.js'

/**
 * RunManager tracks execution "runs" — one per sendMessage invocation.
 * A Run records what prompt was sent, which chat items it produced,
 * how much it cost, whether it succeeded, and a summary.
 *
 * Runs are the primary observability primitive for scheduled agents:
 * "what did my agent do overnight" → scroll through runs, not chat.
 */
export class RunManager extends EventEmitter {
  private runs = new Map<string, Run>()

  async init() {
    const saved = await loadRuns()
    for (const r of saved) this.runs.set(r.id, r)
    console.log(`[runs] Loaded ${saved.length} run(s)`)
  }

  getRuns(): Run[] {
    return Array.from(this.runs.values())
  }

  getRun(id: string): Run | undefined {
    return this.runs.get(id)
  }

  /** Create a new run and broadcast it. */
  startRun(opts: {
    agentId: string
    prompt: string
    triggeredBy: RunTrigger
    scheduleId?: string
    triggerId?: string
    parentRunId?: string
  }): Run {
    const run: Run = {
      id: uuid(),
      agentId: opts.agentId,
      scheduleId: opts.scheduleId,
      triggerId: opts.triggerId,
      parentRunId: opts.parentRunId,
      triggeredBy: opts.triggeredBy,
      prompt: opts.prompt,
      status: 'running',
      startedAt: Date.now(),
      costUsd: 0,
      chatItemIds: [],
    }
    this.runs.set(run.id, run)
    this.broadcast({ type: 'run_started', run })
    this.persist()
    return run
  }

  /** Attribute a chat item to a run. */
  addChatItem(runId: string, chatItemId: string): void {
    const run = this.runs.get(runId)
    if (!run) return
    run.chatItemIds.push(chatItemId)
  }

  /** Add cost to a run and broadcast. */
  addCost(runId: string, cost: number): void {
    const run = this.runs.get(runId)
    if (!run) return
    run.costUsd += cost
    this.broadcast({ type: 'run_updated', run })
  }

  /** Record the last assistant text so we can derive a summary on close. */
  setLastAssistantText(runId: string, text: string): void {
    const run = this.runs.get(runId)
    if (!run) return
    // Look for an explicit <summary>...</summary> tag first
    const tagMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i)
    if (tagMatch) {
      run.summary = tagMatch[1].trim().slice(0, 500)
    } else {
      // Fall back to first 240 chars of the last assistant message
      const clean = text.trim().replace(/\s+/g, ' ')
      run.summary = clean.length > 240 ? clean.slice(0, 240) + '…' : clean
    }
  }

  /** Finalize a run with a status. Emits 'run_finished' for chain handlers. */
  finishRun(runId: string, status: RunStatus, error?: string): void {
    const run = this.runs.get(runId)
    if (!run) return
    run.status = status
    run.endedAt = Date.now()
    if (error) run.error = error
    this.broadcast({ type: 'run_updated', run })
    this.persist()
    // Notify chain handlers — they can react to completed runs to fire follow-ups
    this.emit('run_finished', run)
  }

  /** Remove all runs for an agent (used when the agent is deleted). */
  deleteAgentRuns(agentId: string): void {
    for (const [id, run] of this.runs) {
      if (run.agentId === agentId) this.runs.delete(id)
    }
    this.persist()
  }

  private broadcast(frame: ServerFrame) {
    this.emit('broadcast', frame)
  }

  private persist(): void {
    saveRuns(this.getRuns())
  }
}
