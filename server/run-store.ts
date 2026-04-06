import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import type { Run } from './types.js'

const DATA_DIR = path.join(os.homedir(), '.agentpower')
const RUNS_FILE = path.join(DATA_DIR, 'runs.json')

/** Keep at most this many runs per agent on disk; older ones get trimmed. */
const MAX_RUNS_PER_AGENT = 200

export async function loadRuns(): Promise<Run[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const raw = await fs.readFile(RUNS_FILE, 'utf-8')
    const runs: Run[] = JSON.parse(raw)
    // Mark any still-running runs from a previous session as failed (server was killed)
    return runs.map((r) =>
      r.status === 'running'
        ? { ...r, status: 'failed' as const, endedAt: r.endedAt ?? Date.now(), error: 'Interrupted by server restart' }
        : r,
    )
  } catch {
    return []
  }
}

export async function saveRuns(runs: Run[]): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    // Trim per-agent to keep file size reasonable
    const byAgent = new Map<string, Run[]>()
    for (const r of runs) {
      const arr = byAgent.get(r.agentId) ?? []
      arr.push(r)
      byAgent.set(r.agentId, arr)
    }
    const trimmed: Run[] = []
    for (const arr of byAgent.values()) {
      arr.sort((a, b) => b.startedAt - a.startedAt)
      trimmed.push(...arr.slice(0, MAX_RUNS_PER_AGENT))
    }
    await fs.writeFile(RUNS_FILE, JSON.stringify(trimmed, null, 2), 'utf-8')
  } catch (err) {
    console.error('[runstore] Failed to save runs:', err)
  }
}
