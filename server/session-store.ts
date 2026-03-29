import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import type { AgentSession } from './types.js'

const DATA_DIR = path.join(os.homedir(), '.agentpower')
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json')

export async function loadSessions(): Promise<AgentSession[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const raw = await fs.readFile(SESSIONS_FILE, 'utf-8')
    const sessions: AgentSession[] = JSON.parse(raw)
    // Reset any running state from previous server instance
    return sessions.map(s => ({
      ...s,
      status: s.status === 'running' ? 'idle' : s.status,
      // Mark any running tool_call items as interrupted
      chatItems: s.chatItems.map(item =>
        item.kind === 'tool_call' && item.toolStatus === 'running'
          ? { ...item, toolStatus: 'error' as const, toolResult: 'Interrupted (server restart)' }
          : item
      ),
    }))
  } catch {
    return []
  }
}

export async function saveSessions(sessions: AgentSession[]): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8')
  } catch (err) {
    console.error('[store] Failed to save sessions:', err)
  }
}
