import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { AgentManager } from './agent-manager.js'
import { Scheduler, parseInterval } from './scheduler.js'
import { RunManager } from './run-manager.js'
import { TriggerManager } from './trigger-manager.js'
import { initAuth, authMiddleware, authWsUpgrade } from './auth.js'
import type { ClientFrame, ServerFrame } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

const app = express()
const httpServer = createServer(app)
const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
const runs = new RunManager()
const manager = new AgentManager(runs)
const scheduler = new Scheduler(manager, runs)
const triggers = new TriggerManager(manager, runs)

function send(ws: WebSocket, frame: ServerFrame) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(frame))
  }
}

function broadcast(frame: ServerFrame) {
  const msg = JSON.stringify(frame)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  }
}

// Manager events -> broadcast to all connected clients
manager.on('broadcast', (frame: ServerFrame) => broadcast(frame))
scheduler.on('broadcast', (frame: ServerFrame) => broadcast(frame))
runs.on('broadcast', (frame: ServerFrame) => broadcast(frame))
triggers.on('broadcast', (frame: ServerFrame) => broadcast(frame))

// Chain handler: when a run from a schedule/trigger with onComplete* fields
// finishes successfully, fire the follow-up agent.
runs.on('run_finished', async (run) => {
  // Only chain on successful completion
  if (run.status !== 'completed') return
  // Don't chain from chained runs (prevents infinite loops — max one level)
  if (run.parentRunId) return

  let chainAgentId: string | undefined
  let chainPrompt: string | undefined
  if (run.scheduleId) {
    const schedule = scheduler.getSchedules().find((s) => s.id === run.scheduleId)
    chainAgentId = schedule?.onCompleteAgentId
    chainPrompt = schedule?.onCompletePrompt
  } else if (run.triggerId) {
    const trigger = triggers.getTrigger(run.triggerId)
    chainAgentId = trigger?.onCompleteAgentId
    chainPrompt = trigger?.onCompletePrompt
  }

  if (!chainAgentId || !chainPrompt) return

  // Substitute {{previous_run_summary}} in the chain prompt
  const resolvedPrompt = chainPrompt.replace(/\{\{previous_run_summary\}\}/g, run.summary || '')

  console.log(`[chain] Run ${run.id.slice(0, 8)} finished → firing chain to agent ${chainAgentId.slice(0, 8)}`)
  try {
    await manager.sendMessage(chainAgentId, resolvedPrompt, {
      triggeredBy: 'chain',
      parentRunId: run.id,
      freshSession: true,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[chain] Failed to fire chain: ${msg}`)
  }
})

wss.on('connection', (ws, req) => {
  // Check auth on WebSocket connections
  if (!authWsUpgrade(req)) {
    ws.close(4401, 'Unauthorized')
    return
  }
  console.log('[ws] Client connected')

  // Send full state to newly connected client
  send(ws, { type: 'init', agents: manager.getSessions(), schedules: scheduler.getSchedules(), runs: runs.getRuns(), triggers: triggers.getTriggers() })

  ws.on('message', async (raw) => {
    let frame: ClientFrame
    try {
      frame = JSON.parse(raw.toString()) as ClientFrame
    } catch {
      return
    }

    try {
      switch (frame.type) {
        case 'create_agent': {
          const agent = manager.createSession(frame.payload)
          send(ws, { type: 'agent_created', agent })
          // Broadcast to other tabs too
          for (const client of wss.clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'agent_created', agent }))
            }
          }
          break
        }

        case 'send_message': {
          const { agentId, text } = frame.payload
          manager.sendMessage(agentId, text).catch((err: Error) => {
            send(ws, { type: 'error', message: err.message })
          })
          break
        }

        case 'stop_agent': {
          manager.stopAgent(frame.payload.agentId)
          break
        }

        case 'delete_agent': {
          const agentId = frame.payload.agentId
          manager.deleteAgent(agentId)
          // Clean up triggers bound to this agent
          for (const t of triggers.getTriggers()) {
            if (t.agentId === agentId) triggers.deleteTrigger(t.id)
          }
          break
        }

        case 'update_agent': {
          manager.updateSession(frame.payload.agentId, frame.payload.updates)
          break
        }

        case 'list_agents': {
          send(ws, { type: 'init', agents: manager.getSessions(), schedules: scheduler.getSchedules(), runs: runs.getRuns(), triggers: triggers.getTriggers() })
          break
        }

        case 'create_schedule': {
          const { agentId, prompt, interval, cronExpression, name, freshSessionPerRun, onCompleteAgentId, onCompletePrompt } = frame.payload
          const intervalMs = interval ? parseInterval(interval) : undefined
          scheduler.createSchedule({ agentId, prompt, intervalMs, cronExpression, name, freshSessionPerRun, onCompleteAgentId, onCompletePrompt })
          break
        }

        case 'start_schedule': {
          scheduler.startSchedule(frame.payload.scheduleId)
          break
        }

        case 'pause_schedule': {
          scheduler.pauseSchedule(frame.payload.scheduleId)
          break
        }

        case 'delete_schedule': {
          scheduler.deleteSchedule(frame.payload.scheduleId)
          break
        }

        case 'trigger_schedule': {
          scheduler.triggerNow(frame.payload.scheduleId).catch((err: Error) => {
            send(ws, { type: 'error', message: err.message })
          })
          break
        }

        case 'update_schedule': {
          const { scheduleId, prompt, interval, name } = frame.payload
          const updates: { prompt?: string; intervalMs?: number; name?: string } = {}
          if (prompt !== undefined) updates.prompt = prompt
          if (name !== undefined) updates.name = name
          if (interval !== undefined) updates.intervalMs = parseInterval(interval)
          scheduler.updateSchedule(scheduleId, updates)
          break
        }

        case 'create_trigger': {
          triggers.createTrigger(frame.payload)
          break
        }

        case 'start_trigger': {
          triggers.startTrigger(frame.payload.triggerId)
          break
        }

        case 'pause_trigger': {
          triggers.pauseTrigger(frame.payload.triggerId)
          break
        }

        case 'delete_trigger': {
          triggers.deleteTrigger(frame.payload.triggerId)
          break
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      send(ws, { type: 'error', message: msg })
    }
  })

  ws.on('close', () => console.log('[ws] Client disconnected'))
  ws.on('error', (err) => console.error('[ws] Error:', err.message))
})

// Open a local file or URL with the OS default handler
app.use(express.json())
app.use(authMiddleware)
app.post('/api/open', (req, res) => {
  const target = typeof req.body?.target === 'string' ? req.body.target.trim() : ''
  if (!target) {
    return res.status(400).json({ error: 'Missing target' })
  }

  // Strip file:// prefix if present
  let toOpen = target.startsWith('file:///') ? decodeURIComponent(target.slice(8)) : target
  // Convert forward slashes to backslashes for Windows paths
  if (/^[A-Z]:\//i.test(toOpen)) toOpen = toOpen.replace(/\//g, '\\')

  // For local paths, verify existence
  const isLocalPath = /^[A-Z]:[\\/]/i.test(toOpen)
  if (isLocalPath && !existsSync(toOpen)) {
    return res.status(404).json({ error: `Path does not exist: ${toOpen}` })
  }

  console.log(`[open] ${toOpen}`)

  // Cross-platform: use the OS default handler to open a file/URL
  const platform = process.platform
  let cmd: string
  let args: string[]
  if (platform === 'win32') {
    cmd = 'cmd'
    args = ['/c', 'start', '""', toOpen]
  } else if (platform === 'darwin') {
    cmd = 'open'
    args = [toOpen]
  } else {
    cmd = 'xdg-open'
    args = [toOpen]
  }

  const proc = spawn(cmd, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  proc.on('error', (err) => {
    console.error('[open] Failed:', err.message)
  })
  proc.unref()

  res.json({ ok: true, opened: toOpen })
})

// --- Webhook endpoint ---
// POST /api/trigger/:triggerId?token=XYZ (or X-Trigger-Token header)
// Body: any JSON — exposed to the prompt template as {{payload}}
// Can be called from GitHub webhooks, Slack, curl, etc.
async function handleWebhookTrigger(req: express.Request, res: express.Response) {
  const triggerId = req.params.triggerId
  const providedToken =
    (typeof req.query.token === 'string' && req.query.token) ||
    (typeof req.headers['x-trigger-token'] === 'string' && req.headers['x-trigger-token']) ||
    ''

  const trigger = triggers.getTrigger(triggerId)
  // Constant-time-ish: always respond 404 on bad id OR bad token to avoid leaking which triggers exist
  if (!trigger || trigger.token !== providedToken) {
    return res.status(404).json({ error: 'Not found' })
  }
  if (trigger.status !== 'active') {
    return res.status(409).json({ error: 'Trigger is paused' })
  }

  try {
    const runId = await triggers.fire(triggerId, req.body)
    res.json({ ok: true, runId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[trigger] Fire failed:`, msg)
    res.status(500).json({ error: msg })
  }
}

app.post('/api/trigger/:triggerId', handleWebhookTrigger)
// GET alias so you can test from a browser address bar (with empty payload)
app.get('/api/trigger/:triggerId', handleWebhookTrigger)

// Serve built client in production
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

initAuth()
  .then(() => runs.init())
  .then(() => manager.init())
  .then(() => scheduler.init())
  .then(() => triggers.init())
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`AgentPower server running on http://localhost:${PORT}`)
    })
  })
