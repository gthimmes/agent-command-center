import { test, expect } from '@playwright/test'
import WebSocket from 'ws'
import http from 'http'

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

test.describe('Slack Notifications', () => {
  test('sends formatted Slack message on run completion', async () => {
    // Start a mock Slack webhook server
    const slackMessages: any[] = []
    const mockSlack = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try { slackMessages.push(JSON.parse(body)) } catch {}
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('ok')
      })
    })
    await new Promise<void>((resolve) => mockSlack.listen(9876, resolve))

    try {
      const { ws, frames } = await openWs()
      await waitFor(frames, (f) => f.type === 'init' ? f : undefined, 5000)

      // Create an agent with the mock Slack webhook URL
      ws.send(JSON.stringify({
        type: 'create_agent',
        payload: {
          name: 'Slack Test Agent',
          workdir: 'C:\\dev\\slack-test',
          model: 'claude-sonnet-4-6',
        },
      }))
      const agent = await waitFor(frames, (f) =>
        f.type === 'agent_created' && f.agent?.name === 'Slack Test Agent' ? f.agent : undefined, 5000)

      // Update the agent with the mock Slack webhook URL
      frames.length = 0
      ws.send(JSON.stringify({
        type: 'update_agent',
        payload: {
          agentId: agent.id,
          updates: {
            slackWebhookUrl: 'http://localhost:9876/webhook',
            slackNotifyOn: ['completed', 'failed'],
          },
        },
      }))
      const updated = await waitFor(frames, (f) => f.type === 'agent_updated' ? f.agent : undefined, 5000)
      expect(updated.slackWebhookUrl).toBe('http://localhost:9876/webhook')

      // Send a message — this will create a run that completes
      frames.length = 0
      ws.send(JSON.stringify({
        type: 'send_message',
        payload: { agentId: agent.id, text: 'Say "hello slack"' },
      }))

      // Wait for run to complete
      await waitFor(frames, (f) =>
        f.type === 'run_updated' && f.run?.agentId === agent.id && f.run?.status === 'completed' ? f : undefined, 60000)

      // Wait a moment for the Slack POST to arrive
      await new Promise((r) => setTimeout(r, 1000))

      // Verify the mock Slack server received a message
      expect(slackMessages.length).toBeGreaterThanOrEqual(1)
      const msg = slackMessages[slackMessages.length - 1]
      expect(msg.text).toContain('Slack Test Agent')
      expect(msg.attachments).toBeTruthy()
      expect(msg.attachments.length).toBeGreaterThan(0)

      // The attachment should have blocks with the agent name, summary, and context
      const blocks = msg.attachments[0].blocks
      expect(blocks).toBeTruthy()
      expect(blocks.length).toBeGreaterThanOrEqual(2)

      // First block: agent name + status
      expect(blocks[0].text.text).toContain('Slack Test Agent')
      // Context block: duration + cost + trigger
      const contextBlock = blocks.find((b: any) => b.type === 'context')
      expect(contextBlock).toBeTruthy()

      console.log('Slack payload received:', JSON.stringify(msg, null, 2).slice(0, 500))

      // Clean up
      ws.send(JSON.stringify({ type: 'delete_agent', payload: { agentId: agent.id } }))
      await new Promise((r) => setTimeout(r, 500))
      ws.close()
    } finally {
      mockSlack.close()
    }
  })

  test('does not send Slack notification for events not in slackNotifyOn', async () => {
    const slackMessages: any[] = []
    const mockSlack = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try { slackMessages.push(JSON.parse(body)) } catch {}
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('ok')
      })
    })
    await new Promise<void>((resolve) => mockSlack.listen(9877, resolve))

    try {
      const { ws, frames } = await openWs()
      await waitFor(frames, (f) => f.type === 'init' ? f : undefined, 5000)

      // Create agent that only notifies on 'failed' (not 'completed')
      ws.send(JSON.stringify({
        type: 'create_agent',
        payload: { name: 'Slack Filter Test', workdir: 'C:\\dev\\slack-filter', model: 'claude-sonnet-4-6' },
      }))
      const agent = await waitFor(frames, (f) =>
        f.type === 'agent_created' && f.agent?.name === 'Slack Filter Test' ? f.agent : undefined, 5000)

      frames.length = 0
      ws.send(JSON.stringify({
        type: 'update_agent',
        payload: {
          agentId: agent.id,
          updates: {
            slackWebhookUrl: 'http://localhost:9877/webhook',
            slackNotifyOn: ['failed'], // only on failure
          },
        },
      }))
      await waitFor(frames, (f) => f.type === 'agent_updated' ? f : undefined, 5000)

      // Send a message that will succeed
      frames.length = 0
      ws.send(JSON.stringify({
        type: 'send_message',
        payload: { agentId: agent.id, text: 'Say "ok"' },
      }))
      await waitFor(frames, (f) =>
        f.type === 'run_updated' && f.run?.agentId === agent.id && f.run?.status === 'completed' ? f : undefined, 60000)

      await new Promise((r) => setTimeout(r, 1000))

      // Should NOT have received a Slack message (completed is not in the filter)
      expect(slackMessages.length).toBe(0)

      // Clean up
      ws.send(JSON.stringify({ type: 'delete_agent', payload: { agentId: agent.id } }))
      await new Promise((r) => setTimeout(r, 500))
      ws.close()
    } finally {
      mockSlack.close()
    }
  })
})
