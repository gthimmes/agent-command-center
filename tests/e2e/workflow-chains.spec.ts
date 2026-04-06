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

async function waitFor<T>(frames: any[], predicate: (f: any) => T | undefined, timeoutMs = 90000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = frames.map(predicate).find(Boolean)
    if (result) return result
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('Timeout waiting for frame')
}

test.describe('Workflow Chains', () => {
  test('schedule with onComplete chains to another agent', async () => {
    const { ws, frames } = await openWs()
    await waitFor(frames, (f) => f.type === 'init' ? f : undefined, 5000)

    // Create Agent A (source)
    ws.send(JSON.stringify({
      type: 'create_agent',
      payload: { name: 'Chain Source', workdir: 'C:\\dev\\chain-src', model: 'claude-sonnet-4-6' },
    }))
    const agentA = await waitFor(frames, (f) => f.type === 'agent_created' ? f.agent : undefined, 5000)

    // Create Agent B (target)
    frames.length = 0
    ws.send(JSON.stringify({
      type: 'create_agent',
      payload: { name: 'Chain Target', workdir: 'C:\\dev\\chain-tgt', model: 'claude-sonnet-4-6' },
    }))
    const agentB = await waitFor(frames, (f) => f.type === 'agent_created' ? f.agent : undefined, 5000)

    // Create a schedule on Agent A that chains to Agent B
    frames.length = 0
    ws.send(JSON.stringify({
      type: 'create_schedule',
      payload: {
        agentId: agentA.id,
        prompt: 'Say exactly "step one done"',
        interval: '1d',
        name: 'Chain Test Schedule',
        freshSessionPerRun: true,
        onCompleteAgentId: agentB.id,
        onCompletePrompt: 'Previous said: {{previous_run_summary}}. Say "chain ok".',
      },
    }))
    const schedule = await waitFor(frames, (f) => f.type === 'schedule_created' ? f.schedule : undefined, 5000)
    expect(schedule.onCompleteAgentId).toBe(agentB.id)

    // Trigger the schedule
    frames.length = 0
    ws.send(JSON.stringify({ type: 'trigger_schedule', payload: { scheduleId: schedule.id } }))

    // Wait for Agent A's run to complete
    const runA = await waitFor(frames, (f) =>
      f.type === 'run_updated' && f.run?.scheduleId === schedule.id && f.run?.status === 'completed' ? f.run : undefined, 60000)
    expect(runA.summary).toBeTruthy()

    // Wait for the chained run on Agent B
    const runB = await waitFor(frames, (f) =>
      f.type === 'run_updated' && f.run?.parentRunId === runA.id && f.run?.status === 'completed' ? f.run : undefined, 60000)
    expect(runB.triggeredBy).toBe('chain')
    expect(runB.agentId).toBe(agentB.id)
    // The chain prompt should have the previous summary substituted
    expect(runB.prompt).toContain(runA.summary)

    // Clean up
    ws.send(JSON.stringify({ type: 'delete_agent', payload: { agentId: agentA.id } }))
    ws.send(JSON.stringify({ type: 'delete_agent', payload: { agentId: agentB.id } }))
    await new Promise((r) => setTimeout(r, 500))
    ws.close()
  })
})
