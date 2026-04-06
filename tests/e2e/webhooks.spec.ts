import { test, expect } from '@playwright/test'
import WebSocket from 'ws'

const WS_URL = 'ws://localhost:3001/ws'
const HTTP_URL = 'http://localhost:3001'

function openWs(): Promise<{ ws: InstanceType<typeof WebSocket>; frames: any[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    const frames: any[] = []
    ws.on('message', (data) => {
      try { frames.push(JSON.parse(data.toString())) } catch {}
    })
    ws.on('open', () => resolve({ ws, frames }))
    ws.on('error', reject)
  })
}

async function waitFor<T>(frames: any[], predicate: (f: any) => T | undefined, timeoutMs = 60000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = frames.map(predicate).find(Boolean)
    if (result) return result
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('Timeout waiting for frame')
}

test.describe('Webhook Triggers', () => {
  let ws: InstanceType<typeof WebSocket>
  let frames: any[]
  let agentId: string
  let triggerId: string
  let triggerToken: string

  test.beforeAll(async () => {
    const conn = await openWs()
    ws = conn.ws
    frames = conn.frames
    await waitFor(frames, (f) => f.type === 'init' ? f : undefined, 5000)

    // Create an agent
    ws.send(JSON.stringify({
      type: 'create_agent',
      payload: { name: 'Webhook Agent', workdir: 'C:\\dev\\webhook-e2e', model: 'claude-sonnet-4-6' },
    }))
    const agent = await waitFor(frames, (f) => f.type === 'agent_created' ? f.agent : undefined, 5000)
    agentId = agent.id

    // Create a trigger
    frames.length = 0
    ws.send(JSON.stringify({
      type: 'create_trigger',
      payload: {
        agentId,
        name: 'E2E Webhook',
        prompt: 'Payload: {{payload}}\nSay "got it".',
        freshSessionPerRun: true,
      },
    }))
    const trigger = await waitFor(frames, (f) => f.type === 'trigger_created' ? f.trigger : undefined, 5000)
    triggerId = trigger.id
    triggerToken = trigger.token
  })

  test.afterAll(async () => {
    ws.send(JSON.stringify({ type: 'delete_agent', payload: { agentId } }))
    await new Promise((r) => setTimeout(r, 500))
    ws.close()
  })

  test('fire webhook via HTTP POST with payload', async () => {
    frames.length = 0
    const resp = await fetch(`${HTTP_URL}/api/trigger/${triggerId}?token=${triggerToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test', value: 42 }),
    })
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body.ok).toBe(true)
    expect(body.runId).toBeTruthy()

    // Wait for run to complete
    const run = await waitFor(frames, (f) =>
      f.type === 'run_updated' && f.run?.id === body.runId && f.run?.status === 'completed' ? f.run : undefined, 60000)
    expect(run.triggeredBy).toBe('webhook')
    expect(run.triggerId).toBe(triggerId)
    // Payload should be substituted in the prompt
    expect(run.prompt).toContain('"action": "test"')
    expect(run.prompt).toContain('"value": 42')
  })

  test('bad token returns 404', async () => {
    const resp = await fetch(`${HTTP_URL}/api/trigger/${triggerId}?token=WRONG`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(resp.status).toBe(404)
  })

  test('non-existent trigger returns 404', async () => {
    const resp = await fetch(`${HTTP_URL}/api/trigger/00000000-0000-0000-0000-000000000000?token=x`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(resp.status).toBe(404)
  })

  test('paused trigger returns 409', async () => {
    frames.length = 0
    ws.send(JSON.stringify({ type: 'pause_trigger', payload: { triggerId } }))
    await waitFor(frames, (f) => f.type === 'trigger_updated' && f.trigger?.status === 'paused' ? f : undefined, 5000)

    const resp = await fetch(`${HTTP_URL}/api/trigger/${triggerId}?token=${triggerToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(resp.status).toBe(409)

    // Re-activate
    ws.send(JSON.stringify({ type: 'start_trigger', payload: { triggerId } }))
    await new Promise((r) => setTimeout(r, 300))
  })
})
