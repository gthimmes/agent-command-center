import { useState } from 'react'
import type { Trigger } from '../types.ts'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function TriggerItem({
  trigger,
  onStart,
  onPause,
  onDelete,
}: {
  trigger: Trigger
  onStart: () => void
  onPause: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const isActive = trigger.status === 'active'

  // Build the webhook URL (dev server proxies /api to the backend)
  const webhookUrl = `${window.location.origin}/api/trigger/${trigger.id}?token=${trigger.token}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // noop
    }
  }

  return (
    <div className={`rounded-lg border ${isActive ? 'border-blue-500/30 bg-blue-500/5' : 'border-slate-700 bg-slate-800/30'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setExpanded(v => !v)} className="text-slate-500 text-xs">
          {expanded ? '▼' : '▶'}
        </button>

        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />

        <span className="text-slate-200 text-xs font-medium truncate flex-1">{trigger.name}</span>

        <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
          webhook
        </span>

        {trigger.freshSessionPerRun && (
          <span
            title="Each fire starts a fresh Claude session"
            className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full flex-shrink-0"
          >
            fresh
          </span>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive ? (
            <button
              onClick={onPause}
              title="Pause trigger"
              className="px-1.5 py-0.5 rounded text-amber-500 hover:bg-amber-500/10 text-xs transition-colors"
            >
              ⏸
            </button>
          ) : (
            <button
              onClick={onStart}
              title="Activate trigger"
              className="px-1.5 py-0.5 rounded text-emerald-500 hover:bg-emerald-500/10 text-xs transition-colors"
            >
              ⏵
            </button>
          )}
          <button
            onClick={onDelete}
            title="Delete trigger"
            className="px-1.5 py-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 text-xs transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2 space-y-2 border-t border-slate-700/50 pt-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-500 text-xs">Webhook URL</span>
              <button
                onClick={handleCopy}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <code className="block text-[10px] text-slate-400 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 font-mono break-all">
              {webhookUrl}
            </code>
            <p className="text-slate-600 text-[10px] mt-1">
              POST or GET with JSON body — exposed as <code>{'{{payload}}'}</code> in the prompt.
            </p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">Prompt: </span>
            <span className="text-slate-300 text-xs whitespace-pre-wrap">{trigger.prompt}</span>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-slate-500">
              Fired: <span className="text-slate-400">{trigger.triggerCount}</span>
            </span>
            {trigger.lastFiredAt && (
              <span className="text-slate-500">
                Last: <span className="text-slate-400">{timeAgo(trigger.lastFiredAt)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NewTriggerForm({
  agentId,
  onSubmit,
  onCancel,
}: {
  agentId: string
  onSubmit: (data: { agentId: string; name?: string; prompt: string; freshSessionPerRun?: boolean }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('Process this webhook payload:\n\n{{payload}}')
  const [freshSession, setFreshSession] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    onSubmit({
      agentId,
      name: name.trim() || undefined,
      prompt: prompt.trim(),
      freshSessionPerRun: freshSession,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
      <div>
        <label className="block text-slate-400 text-xs mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. GitHub PR Webhook"
          className="w-full bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs placeholder-slate-600 outline-none focus:border-blue-500/60 transition-colors"
        />
      </div>
      <div>
        <label className="block text-slate-400 text-xs mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          className="w-full bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs placeholder-slate-600 outline-none focus:border-blue-500/60 transition-colors resize-y font-mono"
        />
        <p className="text-slate-600 text-[10px] mt-1">
          Use <code className="text-slate-500">{'{{payload}}'}</code> for the webhook body. Also supports{' '}
          <code className="text-slate-500">{'{{date}}'}</code>, <code className="text-slate-500">{'{{agent_name}}'}</code>, etc.
        </p>
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={freshSession}
            onChange={e => setFreshSession(e.target.checked)}
            className="w-3 h-3 accent-blue-500"
          />
          <span className="text-slate-400 text-xs">Fresh session each fire</span>
          <span className="text-slate-600 text-xs">(recommended)</span>
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs text-slate-400 border border-slate-700 hover:border-slate-600 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Create Webhook
        </button>
      </div>
    </form>
  )
}

export function TriggerPanel({
  agentId,
  triggers,
  onCreateTrigger,
  onStartTrigger,
  onPauseTrigger,
  onDeleteTrigger,
}: {
  agentId: string
  triggers: Trigger[]
  onCreateTrigger: (data: { agentId: string; name?: string; prompt: string; freshSessionPerRun?: boolean }) => void
  onStartTrigger: (triggerId: string) => void
  onPauseTrigger: (triggerId: string) => void
  onDeleteTrigger: (triggerId: string) => void
}) {
  const [showNewForm, setShowNewForm] = useState(false)
  const agentTriggers = triggers.filter(t => t.agentId === agentId)
  const activeCount = agentTriggers.filter(t => t.status === 'active').length

  return (
    <div className="border-t border-slate-800">
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="text-slate-400 text-xs font-medium">Webhooks</span>
        {activeCount > 0 && (
          <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
            {activeCount} active
          </span>
        )}
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          {showNewForm ? '- Cancel' : '+ Add'}
        </button>
      </div>

      <div className="px-4 pb-3 space-y-1.5">
        {showNewForm && (
          <NewTriggerForm
            agentId={agentId}
            onSubmit={(data) => {
              onCreateTrigger(data)
              setShowNewForm(false)
            }}
            onCancel={() => setShowNewForm(false)}
          />
        )}

        {agentTriggers.length === 0 && !showNewForm && (
          <div className="text-slate-600 text-xs py-2 text-center">
            No webhooks. External systems can trigger this agent by POSTing to a URL.
          </div>
        )}

        {agentTriggers.map(trigger => (
          <TriggerItem
            key={trigger.id}
            trigger={trigger}
            onStart={() => onStartTrigger(trigger.id)}
            onPause={() => onPauseTrigger(trigger.id)}
            onDelete={() => onDeleteTrigger(trigger.id)}
          />
        ))}
      </div>
    </div>
  )
}
