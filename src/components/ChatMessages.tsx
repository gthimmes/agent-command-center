import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AgentSession } from '../types.ts'
import { ToolCallBlock } from './ToolCallBlock.tsx'

/**
 * Override ReactMarkdown's URL sanitizer to allow file:// protocol.
 * Default only allows http, https, irc, mailto, xmpp.
 */
function urlTransform(url: string): string {
  const safeProtocol = /^(https?|ircs?|mailto|xmpp|file)$/i
  const colon = url.indexOf(':')
  const questionMark = url.indexOf('?')
  const numberSign = url.indexOf('#')
  const slash = url.indexOf('/')
  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign) ||
    safeProtocol.test(url.slice(0, colon))
  ) {
    return url
  }
  return ''
}

/** Detect if a string is a URL or Windows file path, return it normalized, or null */
function detectLink(text: string): string | null {
  const trimmed = text.trim()
  // http/https URL
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed
  // Windows path (C:\foo\bar.ext or C:/foo/bar.ext)
  if (/^[A-Z]:[\\/][^\s*?"<>|]+$/i.test(trimmed)) return trimmed
  return null
}

/** Open a URL or local file path via the server's /api/open endpoint. */
async function openTarget(target: string) {
  // http/https URLs: open in browser tab (no server round-trip needed)
  if (/^https?:\/\//i.test(target)) {
    window.open(target, '_blank', 'noopener,noreferrer')
    return
  }
  // Local paths: ask the server to open with the OS default handler
  try {
    const res = await fetch('/api/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      console.error('Failed to open:', err.error)
      alert(`Could not open: ${err.error}`)
    }
  } catch (err) {
    console.error('Failed to call /api/open:', err)
  }
}

/** Custom markdown components — intercept link clicks to open via server */
const markdownComponents = {
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      data-testid="chat-link"
      href={href ?? '#'}
      onClick={(e) => {
        e.preventDefault()
        if (href) openTarget(href)
      }}
      {...props}
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
    // Block code (with language class) — render normally
    if (className) return <code className={className} {...props}>{children}</code>
    // Inline code — check if it's a link
    const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : ''
    const target = detectLink(text)
    if (target) {
      return (
        <a
          data-testid="chat-link"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            openTarget(target)
          }}
          className="font-mono"
        >
          <code {...props}>{children}</code>
        </a>
      )
    }
    return <code {...props}>{children}</code>
  },
}

/**
 * Pre-process text to wrap bare URLs in markdown link syntax.
 * Skips content inside backticks (code spans) — those are handled by the
 * custom `code` component which detects paths/URLs and wraps them in <a>.
 * File paths outside backticks are NOT linkified (too risky — would match
 * prose like "in C:\foo"), so encourage agents to backtick file paths.
 */
function linkifyText(text: string): string {
  // Split on backtick-delimited segments to avoid touching code spans
  const segments = text.split(/(`[^`]*`)/g)
  return segments
    .map((seg) => {
      if (seg.startsWith('`') && seg.endsWith('`')) return seg // leave code spans alone
      // Linkify http/https URLs in prose
      return seg.replace(
        /(https?:\/\/[^\s)>\]"]+)/g,
        (match, _url, offset, whole) => {
          const before = whole.slice(Math.max(0, offset - 2), offset)
          if (before.endsWith('](') || before.endsWith('(')) return match
          return `[${match}](${match})`
        }
      )
    })
    .join('')
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 py-2 text-slate-500 text-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-violet-500/60 flex-shrink-0" />
      <span className="flex items-center gap-1">
        <span className="pulse-dot text-slate-500">●</span>
        <span className="pulse-dot text-slate-500">●</span>
        <span className="pulse-dot text-slate-500">●</span>
      </span>
    </div>
  )
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatMessages({ agent }: { agent: AgentSession }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  // Track scroll position
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll when new content arrives if we're near the bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [agent.chatItems])

  if (agent.chatItems.length === 0 && agent.status !== 'running') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-600 select-none">
        <div className="text-4xl mb-3 opacity-30">⬡</div>
        <div className="text-sm">Send a message to start</div>
        <div className="text-xs mt-1 text-slate-700">{agent.workdir}</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
      {agent.chatItems.map(item => {
        if (item.kind === 'user') {
          return (
            <div key={item.id} className="flex justify-end mb-3">
              <div className="max-w-[80%]">
                <div className="bg-violet-600/20 border border-violet-500/30 rounded-xl rounded-tr-sm px-3.5 py-2.5 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {item.text}
                </div>
                <div className="text-slate-700 text-xs mt-1 text-right">{formatTime(item.timestamp)}</div>
              </div>
            </div>
          )
        }

        if (item.kind === 'assistant') {
          return (
            <div key={item.id} className="flex gap-2 mb-3">
              <div className="flex-shrink-0 w-5 h-5 rounded bg-violet-500/20 flex items-center justify-center mt-0.5">
                <span className="text-violet-400 text-xs">A</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-slate-200 text-sm leading-relaxed prose-agent">
                  <ReactMarkdown components={markdownComponents} urlTransform={urlTransform}>{linkifyText(item.text ?? '')}</ReactMarkdown>
                </div>
                <div className="text-slate-700 text-xs mt-1">{formatTime(item.timestamp)}</div>
              </div>
            </div>
          )
        }

        if (item.kind === 'tool_call') {
          return (
            <div key={item.id} className="pl-7 mb-1">
              <ToolCallBlock item={item} />
            </div>
          )
        }

        if (item.kind === 'system_error') {
          return (
            <div key={item.id} className="flex gap-2 mb-3">
              <div className="flex-shrink-0 w-5 h-5 rounded bg-red-500/20 flex items-center justify-center mt-0.5">
                <span className="text-red-400 text-xs">!</span>
              </div>
              <div className="flex-1">
                <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                  {item.text}
                </div>
              </div>
            </div>
          )
        }

        return null
      })}

      {agent.status === 'running' && <div className="pl-7"><ThinkingIndicator /></div>}
      <div ref={bottomRef} />
    </div>
  )
}
