import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTemplate } from '../../server/template.js'
import type { AgentSession, Run, Schedule } from '../../server/types.js'

const mockAgent: AgentSession = {
  id: 'agent-1',
  name: 'Test Agent',
  workdir: 'C:\\dev\\project',
  model: 'claude-sonnet-4-6',
  status: 'idle',
  chatItems: [],
  createdAt: Date.now(),
  lastActiveAt: Date.now(),
  totalCostUsd: 0,
}

const mockSchedule: Schedule = {
  id: 'sched-1',
  agentId: 'agent-1',
  name: 'Test Schedule',
  prompt: '',
  intervalMs: 60000,
  status: 'active',
  runCount: 5,
  createdAt: Date.now(),
}

describe('resolveTemplate', () => {
  it('resolves {{date}} to YYYY-MM-DD', () => {
    const result = resolveTemplate('Today is {{date}}', { agent: mockAgent, schedule: mockSchedule, priorRuns: [] })
    assert.match(result, /Today is \d{4}-\d{2}-\d{2}/)
  })

  it('resolves {{agent_name}}', () => {
    const result = resolveTemplate('Agent: {{agent_name}}', { agent: mockAgent, schedule: mockSchedule, priorRuns: [] })
    assert.equal(result, 'Agent: Test Agent')
  })

  it('resolves {{workdir}}', () => {
    const result = resolveTemplate('Dir: {{workdir}}', { agent: mockAgent, schedule: mockSchedule, priorRuns: [] })
    assert.equal(result, 'Dir: C:\\dev\\project')
  })

  it('resolves {{run_count}}', () => {
    const result = resolveTemplate('Runs: {{run_count}}', { agent: mockAgent, schedule: mockSchedule, priorRuns: [] })
    assert.equal(result, 'Runs: 5')
  })

  it('resolves {{day}} to a day name', () => {
    const result = resolveTemplate('{{day}}', { agent: mockAgent, schedule: mockSchedule, priorRuns: [] })
    assert.match(result, /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/)
  })

  it('resolves {{last_run_summary}} from prior runs', () => {
    const priorRun: Run = {
      id: 'run-1',
      agentId: 'agent-1',
      triggeredBy: 'schedule',
      prompt: 'test',
      status: 'completed',
      startedAt: Date.now() - 60000,
      endedAt: Date.now() - 30000,
      costUsd: 0.01,
      summary: 'Found 3 issues',
      chatItemIds: [],
    }
    const result = resolveTemplate('Last: {{last_run_summary}}', {
      agent: mockAgent,
      schedule: mockSchedule,
      priorRuns: [priorRun],
    })
    assert.equal(result, 'Last: Found 3 issues')
  })

  it('returns N/A for {{last_run_summary}} when no prior runs', () => {
    const result = resolveTemplate('{{last_run_summary}}', { agent: mockAgent, schedule: mockSchedule, priorRuns: [] })
    assert.equal(result, 'N/A')
  })

  it('leaves unknown variables unchanged', () => {
    const result = resolveTemplate('{{unknown_var}}', { agent: mockAgent, schedule: mockSchedule, priorRuns: [] })
    assert.equal(result, '{{unknown_var}}')
  })

  it('resolves multiple variables in one string', () => {
    const result = resolveTemplate(
      '{{agent_name}} on {{date}} (run #{{run_count}})',
      { agent: mockAgent, schedule: mockSchedule, priorRuns: [] },
    )
    assert.match(result, /^Test Agent on \d{4}-\d{2}-\d{2} \(run #5\)$/)
  })
})
