import type { AgentSession, Run, Schedule } from './types.js'

/**
 * Resolve template variables in a schedule prompt at execution time.
 *
 * Supported variables:
 *   {{date}}            ISO date (YYYY-MM-DD)
 *   {{time}}            HH:MM local time
 *   {{datetime}}        Full ISO datetime
 *   {{day}}             Day of week (Monday, Tuesday, ...)
 *   {{agent_name}}      The agent's name
 *   {{workdir}}         The agent's working directory
 *   {{run_count}}       Number of times this schedule has fired
 *   {{last_run_summary}}  Summary of the previous run for this schedule, or "N/A"
 *   {{last_run_status}}   Status of the previous run, or "N/A"
 *
 * Unknown variables are left in place (e.g. {{foo}} stays {{foo}}) so
 * typos don't silently get stripped.
 */
export function resolveTemplate(
  prompt: string,
  ctx: {
    agent: AgentSession
    schedule: Schedule
    priorRuns: Run[] // runs for this schedule, most-recent first
  },
): string {
  const now = new Date()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const lastRun = ctx.priorRuns.find((r) => r.status !== 'running')

  const vars: Record<string, string> = {
    date: now.toISOString().slice(0, 10),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    datetime: now.toISOString(),
    day: days[now.getDay()],
    agent_name: ctx.agent.name,
    workdir: ctx.agent.workdir,
    run_count: String(ctx.schedule.runCount),
    last_run_summary: lastRun?.summary || 'N/A',
    last_run_status: lastRun?.status || 'N/A',
  }

  return prompt.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in vars ? vars[key] : match
  })
}
