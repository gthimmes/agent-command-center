import { useState, useEffect, useRef } from 'react'

const DEFAULT_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5',
]

export function NewAgentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (opts: { name: string; workdir: string; model: string; systemPrompt?: string; dailyCostLimitUsd?: number; runTimeoutMs?: number; useWorktree?: boolean }) => void
}) {
  const [name, setName] = useState('')
  const [workdir, setWorkdir] = useState('C:\\dev')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [customModel, setCustomModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [dailyCostLimit, setDailyCostLimit] = useState('5')
  const [runTimeout, setRunTimeout] = useState('10')
  const [useWorktree, setUseWorktree] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
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
    onCreate({
      name: name.trim() || 'Agent',
      workdir: workdir.trim() || 'C:\\dev',
      model: finalModel,
      systemPrompt: systemPrompt.trim() || undefined,
      dailyCostLimitUsd: Number.isFinite(costLimit) && costLimit > 0 ? costLimit : undefined,
      runTimeoutMs: Number.isFinite(timeoutMin) && timeoutMin > 0 ? Math.round(timeoutMin * 60_000) : undefined,
      useWorktree: useWorktree || undefined,
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
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-slate-100 font-semibold text-sm">New Agent</h2>
            <p className="text-slate-500 text-xs mt-0.5">Start a new Claude agent session</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Agent name */}
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Agent Name</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Backend Refactor"
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm placeholder-slate-600 outline-none focus:border-violet-500/60 transition-colors"
            />
          </div>

          {/* Working directory */}
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Working Directory</label>
            <input
              type="text"
              value={workdir}
              onChange={e => setWorkdir(e.target.value)}
              placeholder="C:\dev\my-project"
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm placeholder-slate-600 outline-none focus:border-violet-500/60 transition-colors font-mono"
            />
          </div>

          {/* Git worktree */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useWorktree}
                onChange={e => setUseWorktree(e.target.checked)}
                className="w-3.5 h-3.5 accent-violet-500"
              />
              <span className="text-slate-300 text-sm">Use git worktree</span>
              <span className="text-slate-600 text-xs">(isolate this agent's changes)</span>
            </label>
            {useWorktree && (
              <p className="text-slate-600 text-[10px] mt-1 pl-5">
                Creates a separate git worktree from the repo above. The agent works on its own branch without affecting the main checkout.
              </p>
            )}
          </div>

          {/* Model */}
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm outline-none focus:border-violet-500/60 transition-colors appearance-none"
            >
              {DEFAULT_MODELS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value="__custom__">Custom model ID...</option>
            </select>
            {model === '__custom__' && (
              <input
                type="text"
                value={customModel}
                onChange={e => setCustomModel(e.target.value)}
                placeholder="e.g. claude-opus-4-6"
                className="w-full mt-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm placeholder-slate-600 outline-none focus:border-violet-500/60 transition-colors"
                autoFocus
              />
            )}
          </div>

          {/* Advanced */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="text-slate-500 hover:text-slate-300 text-xs transition-colors flex items-center gap-1"
            >
              <span>{showAdvanced ? '▼' : '▶'}</span>
              Advanced options
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1.5">
                    System Prompt <span className="text-slate-600">(appended to default)</span>
                  </label>
                  <textarea
                    value={systemPrompt}
                    onChange={e => setSystemPrompt(e.target.value)}
                    placeholder="Additional instructions for this agent..."
                    rows={3}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm placeholder-slate-600 outline-none focus:border-violet-500/60 transition-colors resize-y"
                  />
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
              </div>
            )}
          </div>

          {/* Actions */}
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
              Create Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
