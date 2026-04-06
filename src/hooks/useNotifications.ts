import { useEffect, useRef, useCallback } from 'react'
import type { Run, AgentSession } from '../types.ts'

/**
 * Fires browser desktop notifications when runs complete or fail.
 * Also tracks which runs we've already notified on to avoid duplicates
 * across reducer updates.
 */
export function useNotifications(runs: Map<string, Run>, agents: Map<string, AgentSession>, selectedAgentId: string | null) {
  const permissionRef = useRef<NotificationPermission>('default')
  const notifiedRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)

  // Request permission on mount
  useEffect(() => {
    if (typeof Notification === 'undefined') return
    permissionRef.current = Notification.permission
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        permissionRef.current = p
      })
    }
  }, [])

  // Seed notifiedRef with all historical runs on first WS load so we don't
  // fire notifications for runs that finished before the page opened.
  // We wait for one tick after the init frame (detected by first non-empty
  // render OR a 300ms grace period) to capture initial state.
  useEffect(() => {
    if (initializedRef.current) return
    const t = setTimeout(() => {
      if (initializedRef.current) return
      for (const run of runs.values()) {
        if (run.status !== 'running') notifiedRef.current.add(run.id)
      }
      initializedRef.current = true
    }, 300)
    return () => clearTimeout(t)
  }, [runs])

  // Watch for newly finished runs and fire notifications
  useEffect(() => {
    if (!initializedRef.current) return
    if (permissionRef.current !== 'granted') return

    for (const run of runs.values()) {
      if (run.status === 'running') continue
      if (notifiedRef.current.has(run.id)) continue

      // Don't notify if the user is currently viewing this agent (they see it already)
      if (run.agentId === selectedAgentId && !document.hidden) {
        notifiedRef.current.add(run.id)
        continue
      }

      const agent = agents.get(run.agentId)
      if (!agent) continue

      const title = run.status === 'failed'
        ? `${agent.name} — failed`
        : run.status === 'completed'
        ? `${agent.name} — done`
        : `${agent.name} — ${run.status}`

      const body = run.status === 'failed'
        ? (run.error || 'Run failed')
        : (run.summary || 'Run completed')

      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: run.agentId, // replaces previous notification from same agent
          silent: false,
        })
        notif.onclick = () => {
          window.focus()
          notif.close()
        }
      } catch (err) {
        console.error('Notification failed:', err)
      }

      notifiedRef.current.add(run.id)
    }
  }, [runs, agents, selectedAgentId])

  // Expose a way to check whether permission is granted
  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied'
    const p = await Notification.requestPermission()
    permissionRef.current = p
    return p
  }, [])

  return { permission: permissionRef.current, requestPermission }
}
