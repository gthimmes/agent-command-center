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

/** Custom markdown components — open all links in new tab */
const markdownComponents = {
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
}

/**
 * Pre-process text to wrap bare URLs and file paths in markdown link syntax.
 * Runs before ReactMarkdown so they become <a> tags.
 */
function linkifyText(text: string): string {
  // Linkify http/https URLs not already in markdown link syntax
  let result = text.replace(
    /(https?:\/\/[^\s)>\]"]+)/g,
    (match, _url, offset) => {
      const before = result.slice(Math.max(0, offset - 2), offset)
      if (before.endsWith('](') || before.endsWith('(')) return match
      return `[${match}](${match})`
    }
  )
  // Linkify Windows file paths like C:\foo\bar.html → file:///C:/foo/bar.html
  result = result.replace(
    /([A-Z]:\\[^\s*?"<>|`]+\.\w{1,10})/gi,
    (match, _path, offset) => {
      const before = result.slice(Math.max(0, offset - 2), offset)
      if (before.endsWith('](') || before.endsWith('(')) return match
      // Don't linkify if already inside a markdown link we just created
      if (before.endsWith('[')) return match
      const fileUrl = 'file:///' + match.replace(/\\/g, '/')
      return `[${match}](${fileUrl})`
    }
  )
  return result
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
