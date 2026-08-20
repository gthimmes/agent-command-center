import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ContentStore, createSearchIndex, renderMarkdown } from 'help-navigator'
import { helpContent } from '../../src/help/content.ts'
import { allMappedArticleIds, helpArticlesFor } from '../../src/help/context.ts'

describe('help content integrity', () => {
  const articleIds = new Set(helpContent.articles.map(a => a.id))
  const categoryIds = new Set((helpContent.categories ?? []).map(c => c.id))

  it('has unique article and category ids', () => {
    assert.equal(articleIds.size, helpContent.articles.length)
    assert.equal(categoryIds.size, helpContent.categories?.length)
  })

  it('every article belongs to a declared category', () => {
    for (const a of helpContent.articles) {
      assert.ok(
        categoryIds.has(a.category ?? ''),
        `"${a.id}" has bad category "${a.category}"`,
      )
    }
  })

  it('every declared category has at least one article', () => {
    for (const c of helpContent.categories ?? []) {
      assert.ok(
        helpContent.articles.some(a => a.category === c.id),
        `category "${c.id}" is empty`,
      )
    }
  })

  it('every related id resolves and never self-references', () => {
    for (const a of helpContent.articles) {
      for (const rel of a.related ?? []) {
        assert.ok(articleIds.has(rel), `"${a.id}" relates to unknown "${rel}"`)
        assert.notEqual(rel, a.id, `"${a.id}" relates to itself`)
      }
    }
  })

  it('bodies are substantive and render to HTML', () => {
    for (const a of helpContent.articles) {
      assert.ok(a.body.trim().length > 100, `"${a.id}" body too short`)
      assert.ok(renderMarkdown(a.body).length > 0, `"${a.id}" body did not render`)
    }
  })

  it('has featured articles for the help home view', () => {
    assert.ok(helpContent.articles.filter(a => a.featured).length >= 4)
  })

  it('loads into a ContentStore without errors', () => {
    const store = new ContentStore(helpContent)
    assert.equal(store.articles.length, helpContent.articles.length)
  })
})

describe('view context map', () => {
  const articleIds = new Set(helpContent.articles.map(a => a.id))

  it('every mapped article id exists in the content', () => {
    for (const id of allMappedArticleIds()) {
      assert.ok(articleIds.has(id), `route map references unknown article "${id}"`)
    }
  })

  it('covers every app view with curated context', () => {
    // Pseudo-pathnames App.tsx can produce (the app is state-routed).
    const routes = ['/', '/agents/new', '/agents/abc-123']
    for (const route of routes) {
      const articles = helpArticlesFor(route)
      assert.ok(articles.length > 0, `route ${route} has no help context`)
      assert.notDeepEqual(
        articles,
        ['welcome-tour'],
        `route ${route} fell through to the fallback`,
      )
    }
  })

  it('agent panels get chat, scheduling, webhook, and run help', () => {
    const detail = helpArticlesFor('/agents/9f3c2a10')
    assert.ok(detail.includes('chat-basics'))
    assert.ok(detail.includes('schedules-basics'))
    assert.ok(detail.includes('webhook-triggers'))
    assert.ok(detail.includes('run-history'))
  })

  it('unknown views fall back to the tour', () => {
    assert.deepEqual(helpArticlesFor('/nope'), ['welcome-tour'])
  })
})

describe('help search over the real corpus', () => {
  const index = createSearchIndex(
    helpContent.articles.map(a => ({ id: a.id, title: a.title, body: a.body, tags: a.tags })),
  )

  const expectations: Array<[string, string]> = [
    ['cron', 'schedules-basics'],
    ['template variables', 'template-variables'],
    ['webhook token', 'webhook-triggers'],
    ['chain', 'workflow-chains'],
    ['cost limit', 'cost-limits'],
    ['timeout cancelled', 'run-timeouts'],
    ['worktree', 'worktree-agents'],
    ['slack', 'notifications-help'],
    ['system prompt', 'agent-settings'],
    ['summary tags', 'run-summaries'],
    ['fresh session', 'fresh-sessions'],
    ['ctrl+k', 'global-search'],
  ]

  for (const [query, expectedId] of expectations) {
    it(`"${query}" surfaces ${expectedId} near the top`, () => {
      const top = index.search(query, 3).map(r => r.id)
      assert.ok(
        top.includes(expectedId),
        `query "${query}" returned ${JSON.stringify(top)}`,
      )
    })
  }
})
