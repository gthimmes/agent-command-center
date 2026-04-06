import { useState, useRef, useEffect } from 'react'
import type { AgentSession, Run } from '../types.ts'

interface SearchResult {
  type: 'agent' | 'run' | 'chat'
  agentId: string
  agentName: string
  text: string
  timestamp?: number
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function SearchBar({
  agents,
  runs,
  onSelectAgent,
}: {
  agents: AgentSession[]
  runs: Run[]
  onSelectAgent: (agentId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Keyboard shortcut: Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const results: SearchResult[] = []
  if (query.length >= 2) {
    const q = query.toLowerCase()
    const maxResults = 20

    // Search agent names
    for (const agent of agents) {
      if (results.length >= maxResults) break
      if (agent.name.toLowerCase().includes(q)) {
        results.push({ type: 'agent', agentId: agent.id, agentName: agent.name, text: agent.name })
      }
    }

    // Search run summaries and prompts
    for (const run of runs) {
      if (results.length >= maxResults) break
      const agentName = agents.find(a => a.id === run.agentId)?.name ?? 'Unknown'
      if (run.summary?.toLowerCase().includes(q)) {
        results.push({ type: 'run', agentId: run.agentId, agentName, text: run.summary, timestamp: run.startedAt })
      } else if (run.prompt.toLowerCase().includes(q)) {
        results.push({ type: 'run', agentId: run.agentId, agentName, text: run.prompt.slice(0, 150), timestamp: run.startedAt })
      }
    }

    // Search chat items
    for (const agent of agents) {
      if (results.length >= maxResults) break
      for (const item of agent.chatItems) {
        if (results.length >= maxResults) break
        if (item.text?.toLowerCase().includes(q)) {
          results.push({
            type: 'chat',
            agentId: agent.id,
            agentName: agent.name,
            text: item.text.slice(0, 150),
            timestamp: item.timestamp,
          })
        }
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-lg px-2.5 py-1">
        <span className="text-slate-600 text-xs">&#x1F50D;</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search agents, runs, chat..."
          className="bg-transparent text-slate-300 text-xs outline-none placeholder-slate-600 w-32 md:w-48"
        />
        <kbd className="hidden md:block text-[9px] text-slate-600 bg-slate-800 border border-slate-700 rounded px-1">
          Ctrl+K
        </kbd>
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full right-0 mt-1 w-80 max-h-64 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                onSelectAgent(r.agentId)
                setOpen(false)
                setQuery('')
              }}
              className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{r.type}</span>
                <span className="text-slate-400 text-xs truncate">{r.agentName}</span>
                {r.timestamp && (
                  <span className="text-slate-700 text-[10px] ml-auto flex-shrink-0">{timeAgo(r.timestamp)}</span>
                )}
              </div>
              <div className="text-slate-300 text-xs mt-1 line-clamp-2">{r.text}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
