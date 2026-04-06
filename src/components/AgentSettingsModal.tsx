import { useEffect, useRef, useState } from 'react'
import type { AgentSession, SlackNotifyEvent } from '../types.ts'

const DEFAULT_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5',
]

const NOTIFY_EVENTS: { value: SlackNotifyEvent; label: string }[] = [
  { value: 'completed', label: 'Run completed' },
  { value: 'failed', label: 'Run failed' },
  { value: 'skipped', label: 'Run skipped (cost limit)' },
  { value: 'cancelled', label: 'Run cancelled (timeout)' },
]

type Updates = Partial<Pick<AgentSession, 'name' | 'workdir' | 'model' | 'systemPrompt' | 'dailyCostLimitUsd' | 'runTimeoutMs' | 'slackWebhookUrl' | 'slackNotifyOn'>>

export function AgentSettingsModal({
  agent,
  onClose,
  onSave,
}: {
  agent: AgentSession
  onClose: () => void
  onSave: (updates: Updates) => void
}) {
  const [name, setName] = useState(agent.name)
  const [workdir, setWorkdir] = useState(agent.workdir)
  const [model, setModel] = useState(
    DEFAULT_MODELS.includes(agent.model) ? agent.model : '__custom__',
  )
  const [customModel, setCustomModel] = useState(
    DEFAULT_MODELS.includes(agent.model) ? '' : agent.model,
  )
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? '')
  const [dailyCostLimit, setDailyCostLimit] = useState(
    agent.dailyCostLimitUsd != null ? String(agent.dailyCostLimitUsd) : '0',
  )
  const [runTimeout, setRunTimeout] = useState(
    agent.runTimeoutMs != null ? String(Math.round(agent.runTimeoutMs / 60_000)) : '0',
  )
  const [slackUrl, setSlackUrl] = useState(agent.slackWebhookUrl ?? '')
  const [slackEvents, setSlackEvents] = useState<Set<SlackNotifyEvent>>(
    new Set(agent.slackNotifyOn ?? ['completed', 'failed']),
  )

  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const finalModel = model === '__custom__' ? customModel.trim() : model
    if (!finalModel) return
    const costLimit = parseFloat(dailyCostLimit)
    const timeoutMin = parseFloat(runTimeout)
    onSave({
      name: name.trim() || agent.name,
      workdir: workdir.trim() || agent.workdir,
      model: finalModel,
      systemPrompt: systemPrompt.trim() ? systemPrompt : '',
      dailyCostLimitUsd: Number.isFinite(costLimit) && costLimit > 0 ? costLimit : 0,
      runTimeoutMs: Number.isFinite(timeoutMin) && timeoutMin > 0 ? Math.round(timeoutMin * 60_000) : 0,
      slackWebhookUrl: slackUrl.trim() || '',
      slackNotifyOn: Array.from(slackEvents) as SlackNotifyEvent[],
    })
  }

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-sm">Agent Settings</h2>
            <p className="text-slate-500 text-xs mt-0.5">Edit agent configuration and context</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Agent Name</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm outline-none focus:border-violet-500/60 transition-colors"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Working Directory</label>
            <input
              type="text"
              value={workdir}
              onChange={e => setWorkdir(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm outline-none focus:border-violet-500/60 transition-colors font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm outline-none focus:border-violet-500/60 transition-colors appearance-none"
            >
              {DEFAULT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              <option value="__custom__">Custom model ID...</option>
            </select>
            {model === '__custom__' && (
              <input
                type="text"
                value={customModel}
                onChange={e => setCustomModel(e.target.value)}
                placeholder="e.g. claude-opus-4-6"
                className="w-full mt-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm outline-none focus:border-violet-500/60 transition-colors"
                autoFocus
              />
            )}
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1.5">
              Context / System Instructions
              <span className="text-slate-600 ml-2">(injected on every run via --append-system-prompt)</span>
            </label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="Persistent context for this agent. Project overview, coding conventions, key files, priorities, etc."
              rows={8}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm outline-none focus:border-violet-500/60 transition-colors resize-y font-mono leading-relaxed"
            />
            <p className="text-slate-600 text-[10px] mt-1">
              Markdown is supported. Claude caches this across runs — cheaper than putting it in every prompt.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">
                Daily cost limit <span className="text-slate-600">(USD)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={dailyCostLimit}
                  onChange={e => setDailyCostLimit(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg pl-6 pr-3 py-2 text-slate-200 text-sm outline-none focus:border-violet-500/60 transition-colors"
                />
              </div>
              <p className="text-slate-600 text-[10px] mt-1">0 = no limit</p>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">
                Run timeout <span className="text-slate-600">(minutes)</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={runTimeout}
                onChange={e => setRunTimeout(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm outline-none focus:border-violet-500/60 transition-colors"
              />
              <p className="text-slate-600 text-[10px] mt-1">0 = no limit</p>
            </div>
          </div>

          {/* Slack notifications */}
          <div className="border-t border-slate-800 pt-4 mt-2">
            <h3 className="text-slate-300 text-xs font-semibold mb-3">Slack Notifications</h3>
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">
                Incoming Webhook URL
              </label>
              <input
                type="url"
                value={slackUrl}
                onChange={e => setSlackUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/T.../B.../..."
                className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm placeholder-slate-600 outline-none focus:border-violet-500/60 transition-colors font-mono text-xs"
              />
              <p className="text-slate-600 text-[10px] mt-1">
                Create one at <span className="text-slate-500">Slack &gt; Apps &gt; Incoming Webhooks</span>. Leave empty to disable.
              </p>
            </div>
            {slackUrl && (
              <div className="mt-3">
                <label className="block text-slate-400 text-xs mb-2">Notify on</label>
                <div className="flex flex-wrap gap-2">
                  {NOTIFY_EVENTS.map(ev => (
                    <label key={ev.value} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={slackEvents.has(ev.value)}
                        onChange={e => {
                          const next = new Set(slackEvents)
                          if (e.target.checked) next.add(ev.value)
                          else next.delete(ev.value)
                          setSlackEvents(next)
                        }}
                        className="w-3 h-3 accent-violet-500"
                      />
                      <span className="text-slate-400 text-xs">{ev.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
