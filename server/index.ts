import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import { AgentManager } from './agent-manager.js'
import { Scheduler, parseInterval } from './scheduler.js'
import type { ClientFrame, ServerFrame } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

const app = express()
const httpServer = createServer(app)
const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
const manager = new AgentManager()
const scheduler = new Scheduler(manager)

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

wss.on('connection', (ws) => {
  console.log('[ws] Client connected')

  // Send full state to newly connected client
  send(ws, { type: 'init', agents: manager.getSessions(), schedules: scheduler.getSchedules() })

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
          manager.deleteAgent(frame.payload.agentId)
          break
        }

        case 'list_agents': {
          send(ws, { type: 'init', agents: manager.getSessions(), schedules: scheduler.getSchedules() })
          break
        }

        case 'create_schedule': {
          const { agentId, prompt, interval, name } = frame.payload
          const intervalMs = parseInterval(interval)
          scheduler.createSchedule({ agentId, prompt, intervalMs, name })
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
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      send(ws, { type: 'error', message: msg })
    }
  })

  ws.on('close', () => console.log('[ws] Client disconnected'))
  ws.on('error', (err) => console.error('[ws] Error:', err.message))
})

// Serve built client in production
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

manager.init().then(async () => {
  await scheduler.init()
  httpServer.listen(PORT, () => {
    console.log(`AgentPower server running on http://localhost:${PORT}`)
  })
})
