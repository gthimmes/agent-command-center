// Maps app views to the help articles most relevant on that view —
// surfaced as "Suggested for this page" when the help panel opens.
//
// AgentPower has no URL router; App.tsx derives a pseudo-pathname from its
// view state ('/' for the dashboard, '/agents/new' while the creation modal
// is open, '/agents/<id>' for an agent panel) and feeds it to HelpWidget.

const ROUTE_HELP: Array<{ pattern: RegExp; articles: string[] }> = [
  { pattern: /^\/$/, articles: ['dashboard-overview', 'welcome-tour', 'creating-agents'] },
  { pattern: /^\/agents\/new$/, articles: ['creating-agents', 'models-choice', 'worktree-agents'] },
  { pattern: /^\/agents\/[^/]+$/, articles: ['chat-basics', 'schedules-basics', 'webhook-triggers', 'run-history'] },
]

export function helpArticlesFor(pathname: string): string[] {
  return ROUTE_HELP.find(r => r.pattern.test(pathname))?.articles ?? ['welcome-tour']
}

// Exported for tests: every article id referenced by the map.
export function allMappedArticleIds(): string[] {
  return [...new Set(ROUTE_HELP.flatMap(r => r.articles))]
}
