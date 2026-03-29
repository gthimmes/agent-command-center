import { useEffect, useRef, useState, useCallback } from 'react'
import type { ServerFrame } from '../types.ts'

export type WsStatus = 'connecting' | 'connected' | 'disconnected'

const WS_URL = import.meta.env.DEV ? 'ws://localhost:3001/ws' : `ws://${window.location.host}/ws`
const RECONNECT_DELAY = 2500

export function useWebSocket(onFrame: (frame: ServerFrame) => void) {
  const [status, setStatus] = useState<WsStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const onFrameRef = useRef(onFrame)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  onFrameRef.current = onFrame

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    setStatus('connecting')

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      setStatus('connected')
    }

    ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(e.data) as ServerFrame
        onFrameRef.current(frame)
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('disconnected')
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((data: unknown) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }, [])

  return { status, send }
}
