import { useEffect, useState, useCallback, useMemo } from 'react'
import type { Run } from '../types.ts'

const STORAGE_KEY = 'agentpower:lastViewed'

type LastViewed = Record<string, number>

function loadLastViewed(): LastViewed {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLastViewed(data: LastViewed) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore quota errors
  }
}

/**
 * Tracks which agents have unread (new) runs since the user last viewed them.
 * Last-viewed timestamps persist in localStorage so badges survive reload.
 */
export function useUnreadRuns(runs: Map<string, Run>, selectedAgentId: string | null) {
  const [lastViewed, setLastViewed] = useState<LastViewed>(() => loadLastViewed())

  // Mark currently selected agent as viewed on every render where it's selected
  useEffect(() => {
    if (!selectedAgentId) return
    const now = Date.now()
    setLastViewed((prev) => {
      // Only update if it's stale (avoid infinite loop)
      if (prev[selectedAgentId] && now - prev[selectedAgentId] < 1000) return prev
      const next = { ...prev, [selectedAgentId]: now }
      saveLastViewed(next)
      return next
    })
  }, [selectedAgentId, runs]) // also re-run when runs change so viewing "catches up"

  // Compute unread count per agent
  const unreadByAgent = useMemo(() => {
    const counts = new Map<string, number>()
    for (const run of runs.values()) {
      if (run.status === 'running') continue
      const lastViewedTs = lastViewed[run.agentId] ?? 0
      const finishedAt = run.endedAt ?? run.startedAt
      if (finishedAt > lastViewedTs) {
        counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1)
      }
    }
    return counts
  }, [runs, lastViewed])

  const markViewed = useCallback((agentId: string) => {
    setLastViewed((prev) => {
      const next = { ...prev, [agentId]: Date.now() }
      saveLastViewed(next)
      return next
    })
  }, [])

  return { unreadByAgent, markViewed }
}
