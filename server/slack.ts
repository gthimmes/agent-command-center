import type { AgentSession, Run, RunStatus } from './types.js'

/**
 * Format a run duration for display.
 */
function formatDuration(start: number, end?: number): string {
  if (!end) return 'running'
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

/**
 * Map run status to a Slack-friendly emoji + color.
 */
const STATUS_CONFIG: Record<RunStatus, { emoji: string; color: string; label: string }> = {
  running:   { emoji: ':hourglass_flowing_sand:', color: '#f59e0b', label: 'Running' },
  completed: { emoji: ':white_check_mark:',      color: '#10b981', label: 'Completed' },
  failed:    { emoji: ':x:',                      color: '#ef4444', label: 'Failed' },
  skipped:   { emoji: ':fast_forward:',           color: '#6b7280', label: 'Skipped' },
  cancelled: { emoji: ':stop_sign:',              color: '#6b7280', label: 'Cancelled' },
}

/**
 * Build a Slack Block Kit message payload for a run notification.
 * Uses the "attachments" format for colored sidebar + structured content.
 */
function buildSlackPayload(agent: AgentSession, run: Run): Record<string, unknown> {
  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.completed
  const duration = formatDuration(run.startedAt, run.endedAt)
  const cost = run.costUsd > 0 ? `$${run.costUsd.toFixed(4)}` : '$0.00'

  const fields: { title: string; value: string; short: boolean }[] = [
    { title: 'Status', value: `${cfg.emoji} ${cfg.label}`, short: true },
    { title: 'Duration', value: duration, short: true },
    { title: 'Cost', value: cost, short: true },
    { title: 'Trigger', value: run.triggeredBy, short: true },
  ]

  if (run.error) {
    fields.push({ title: 'Error', value: run.error.slice(0, 300), short: false })
  }

  const summary = run.summary || (run.error ? run.error.slice(0, 200) : 'No summary')

  return {
    text: `${cfg.emoji} *${agent.name}* — ${cfg.label}`,
    attachments: [
      {
        color: cfg.color,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${agent.name}* ${cfg.emoji} ${cfg.label}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: summary.length > 500 ? summary.slice(0, 500) + '...' : summary,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `*Duration:* ${duration}  |  *Cost:* ${cost}  |  *Trigger:* ${run.triggeredBy}${run.parentRunId ? '  |  :link: Chained' : ''}`,
              },
            ],
          },
        ],
      },
    ],
  }
}

/**
 * Send a Slack notification for a completed run.
 * Returns true if sent successfully, false on error.
 */
export async function sendSlackNotification(
  agent: AgentSession,
  run: Run,
): Promise<boolean> {
  if (!agent.slackWebhookUrl) return false

  // Check if this event type should trigger a notification
  const notifyOn = agent.slackNotifyOn ?? ['completed', 'failed']
  if (!notifyOn.includes(run.status as typeof notifyOn[number])) return false

  const payload = buildSlackPayload(agent, run)

  try {
    const resp = await fetch(agent.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      console.error(`[slack] Failed to send notification for agent "${agent.name}": HTTP ${resp.status} — ${text}`)
      return false
    }

    console.log(`[slack] Notification sent for agent "${agent.name}" (${run.status})`)
    return true
  } catch (err) {
    console.error(`[slack] Error sending notification:`, err instanceof Error ? err.message : err)
    return false
  }
}
