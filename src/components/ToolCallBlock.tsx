import { useState } from 'react'
import type { ChatItem } from '../types.ts'

const TOOL_ICONS: Record<string, string> = {
  Bash: '❯',
  Read: '📄',
  Write: '✏️',
  Edit: '✏️',
  Glob: '🔍',
  Grep: '🔍',
  WebFetch: '🌐',
  WebSearch: '🌐',
  LS: '📁',
  TodoRead: '✓',
  TodoWrite: '✓',
}

const TOOL_COLORS: Record<string, string> = {
  Bash: 'border-l-amber-500/60',
  Read: 'border-l-sky-500/60',
  Write: 'border-l-emerald-500/60',
  Edit: 'border-l-emerald-500/60',
  Glob: 'border-l-violet-500/60',
  Grep: 'border-l-violet-500/60',
  WebFetch: 'border-l-blue-500/60',
  WebSearch: 'border-l-blue-500/60',
}

function formatToolInput(name: string, inputJson: string): string {
  try {
    const obj = JSON.parse(inputJson)
    if (name === 'Bash' && obj.command) return obj.command
    if ((name === 'Read' || name === 'Write' || name === 'Edit') && obj.file_path) return obj.file_path
    if ((name === 'Glob' || name === 'Grep') && obj.pattern) return obj.pattern
    if (name === 'WebFetch' && obj.url) return obj.url
    if (name === 'WebSearch' && obj.query) return obj.query
    // Generic: show first string value
    const firstStr = Object.values(obj).find(v => typeof v === 'string') as string | undefined
    return firstStr ?? inputJson
  } catch {
    return inputJson
  }
}

export function ToolCallBlock({ item }: { item: ChatItem }) {
  const [expanded, setExpanded] = useState(false)
  const name = item.toolName ?? 'Tool'
  const icon = TOOL_ICONS[name] ?? '⚙'
  const borderColor = TOOL_COLORS[name] ?? 'border-l-slate-500/60'
  const inputSummary = item.toolInput ? formatToolInput(name, item.toolInput) : ''

  const statusColor = item.toolStatus === 'running'
    ? 'text-amber-400'
    : item.toolStatus === 'error'
      ? 'text-red-400'
      : 'text-emerald-400'

  const statusIcon = item.toolStatus === 'running'
    ? <span className="inline-flex gap-0.5"><span className="pulse-dot">·</span><span className="pulse-dot">·</span><span className="pulse-dot">·</span></span>
    : item.toolStatus === 'error'
      ? '✗'
      : '✓'

  return (
    <div
      className={`my-1.5 bg-slate-900/80 border border-slate-800 border-l-2 ${borderColor} rounded-r-lg overflow-hidden`}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/40 transition-colors text-left"
      >
        <span className="text-slate-500 text-xs w-4 flex-shrink-0">{icon}</span>
        <span className="text-slate-300 text-xs font-medium">{name}</span>
        <span className="text-slate-500 text-xs truncate flex-1 min-w-0">{inputSummary}</span>
        <span className={`text-xs flex-shrink-0 ${statusColor}`}>{statusIcon}</span>
        <span className="text-slate-600 text-xs flex-shrink-0 ml-1">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-800 text-xs">
          {item.toolInput && (
            <div className="px-3 py-2">
              <div className="text-slate-600 text-xs mb-1 uppercase tracking-wider">Input</div>
              <pre className="text-slate-400 whitespace-pre-wrap break-words overflow-x-auto max-h-40 overflow-y-auto text-xs leading-relaxed">
                {item.toolInput}
              </pre>
            </div>
          )}
          {item.toolResult !== undefined && (
            <div className="px-3 py-2 border-t border-slate-800/60">
              <div className={`text-xs mb-1 uppercase tracking-wider ${item.toolIsError ? 'text-red-600' : 'text-slate-600'}`}>
                {item.toolIsError ? 'Error' : 'Output'}
              </div>
              <pre className={`whitespace-pre-wrap break-words overflow-x-auto max-h-48 overflow-y-auto text-xs leading-relaxed ${item.toolIsError ? 'text-red-400' : 'text-slate-400'}`}>
                {item.toolResult || '(empty)'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
