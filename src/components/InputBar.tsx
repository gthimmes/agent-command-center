import { useState, useRef, useCallback, useEffect } from 'react'

export function InputBar({
  onSend,
  onStop,
  isRunning,
  disabled,
}: {
  onSend: (text: string) => void
  onStop: () => void
  isRunning: boolean
  disabled: boolean
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [value])

  const handleSend = useCallback(() => {
    const text = value.trim()
    if (!text || isRunning || disabled) return
    setValue('')
    onSend(text)
  }, [value, isRunning, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="flex items-end gap-2 bg-slate-900 border border-slate-700/60 rounded-xl px-3 py-2 focus-within:border-violet-500/50 transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'No agent selected...' : 'Send a message... (Enter to send, Shift+Enter for newline)'}
          disabled={disabled || isRunning}
          rows={1}
          className="flex-1 bg-transparent text-slate-200 placeholder-slate-600 resize-none outline-none text-sm leading-relaxed min-h-[24px] max-h-[200px] overflow-y-auto disabled:opacity-50"
        />

        {isRunning ? (
          <button
            onClick={onStop}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs font-medium transition-colors"
          >
            <span className="w-2 h-2 bg-red-400 rounded-sm" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-slate-700 text-xs">Enter to send · Shift+Enter for newline</span>
        {value.length > 0 && <span className="text-slate-700 text-xs">{value.length} chars</span>}
      </div>
    </div>
  )
}
