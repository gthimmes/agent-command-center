import { test, expect } from '@playwright/test'
import WebSocket from 'ws'

const WS_URL = 'ws://localhost:3001/ws'

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

test.describe('Agent Lifecycle', () => {
  let ws: InstanceType<typeof WebSocket>
  let frames: any[]

  test.beforeAll(async () => {
    const conn = await openWs()
    ws = conn.ws
    frames = conn.frames
    // Wait for init
    await waitFor(frames, (f) => f.type === 'init' ? f : undefined, 5000)
  })

  test.afterAll(() => ws.close())

  test('create agent via WS', async () => {
    frames.length = 0
    ws.send(JSON.stringify({
      type: 'create_agent',
      payload: { name: 'E2E Test Agent', workdir: 'C:\\dev\\e2e-test', model: 'claude-sonnet-4-6' },
    }))
    const agent = await waitFor(frames, (f) => f.type === 'agent_created' && f.agent?.name === 'E2E Test Agent' ? f.agent : undefined, 5000)
    expect(agent.name).toBe('E2E Test Agent')
    expect(agent.workdir).toBe('C:\\dev\\e2e-test')
    expect(agent.status).toBe('idle')
    expect(agent.id).toBeTruthy()

    // Clean up
    ws.send(JSON.stringify({ type: 'delete_agent', payload: { agentId: agent.id } }))
    await waitFor(frames, (f) => f.type === 'agent_deleted' ? f : undefined, 5000)
  })

  test('update agent via WS', async () => {
    frames.length = 0
    ws.send(JSON.stringify({
      type: 'create_agent',
      payload: { name: 'Update Test', workdir: 'C:\\dev\\update-test', model: 'claude-sonnet-4-6' },
    }))
    const agent = await waitFor(frames, (f) => f.type === 'agent_created' ? f.agent : undefined, 5000)

    frames.length = 0
    ws.send(JSON.stringify({
      type: 'update_agent',
      payload: {
        agentId: agent.id,
        updates: { name: 'Updated Name', systemPrompt: 'Be helpful.', dailyCostLimitUsd: 2.5 },
      },
    }))
    const updated = await waitFor(frames, (f) => f.type === 'agent_updated' ? f.agent : undefined, 5000)
    expect(updated.name).toBe('Updated Name')
    expect(updated.systemPrompt).toBe('Be helpful.')
    expect(updated.dailyCostLimitUsd).toBe(2.5)

    ws.send(JSON.stringify({ type: 'delete_agent', payload: { agentId: agent.id } }))
    await new Promise((r) => setTimeout(r, 500))
  })

  test('send message creates a run', async () => {
    frames.length = 0
    ws.send(JSON.stringify({
      type: 'create_agent',
      payload: { name: 'Run Test', workdir: 'C:\\dev\\run-test', model: 'claude-sonnet-4-6' },
    }))
    const agent = await waitFor(frames, (f) => f.type === 'agent_created' && f.agent?.name === 'Run Test' ? f.agent : undefined, 5000)

    frames.length = 0
    ws.send(JSON.stringify({
      type: 'send_message',
      payload: { agentId: agent.id, text: 'Say "ok"' },
    }))

    // Should get run_started for this agent
    const startedRun = await waitFor(frames, (f) => f.type === 'run_started' && f.run?.agentId === agent.id ? f.run : undefined, 10000)
    expect(startedRun.agentId).toBe(agent.id)
    expect(startedRun.status).toBe('running')
    expect(startedRun.triggeredBy).toBe('chat')

    // Should get run_updated with completed for this agent
    const completedRun = await waitFor(frames, (f) =>
      f.type === 'run_updated' && f.run?.agentId === agent.id && f.run?.status === 'completed' ? f.run : undefined, 60000)
    expect(completedRun.agentId).toBe(agent.id)
    expect(completedRun.summary).toBeTruthy()
    expect(completedRun.costUsd).toBeGreaterThanOrEqual(0)

    ws.send(JSON.stringify({ type: 'delete_agent', payload: { agentId: agent.id } }))
    await new Promise((r) => setTimeout(r, 500))
  })

  test('cost limit skips runs', async () => {
    frames.length = 0
    ws.send(JSON.stringify({
      type: 'create_agent',
      payload: { name: 'Cost Limit Test', workdir: 'C:\\dev\\cost-test', model: 'claude-sonnet-4-6', dailyCostLimitUsd: 0.0001 },
    }))
    const agent = await waitFor(frames, (f) => f.type === 'agent_created' ? f.agent : undefined, 5000)

    // First message — should run
    ws.send(JSON.stringify({ type: 'send_message', payload: { agentId: agent.id, text: 'Say "ok"' } }))
    await waitFor(frames, (f) => f.type === 'run_updated' && f.run?.status === 'completed' ? f : undefined, 60000)
    await new Promise((r) => setTimeout(r, 1500)) // Wait for idle

    // Second message — should be skipped
    frames.length = 0
    ws.send(JSON.stringify({ type: 'send_message', payload: { agentId: agent.id, text: 'Say "ok" again' } }))
    const skippedRun = await waitFor(frames, (f) => f.type === 'run_updated' && f.run?.status === 'skipped' ? f.run : undefined, 10000)
    expect(skippedRun.error).toContain('cost limit')

    ws.send(JSON.stringify({ type: 'delete_agent', payload: { agentId: agent.id } }))
    await new Promise((r) => setTimeout(r, 500))
  })
})
