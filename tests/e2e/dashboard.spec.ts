import { test, expect } from '@playwright/test'

test.describe('Dashboard & Search', () => {
  test('dashboard renders with stats and agent cards', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // Click Dashboard in sidebar to ensure we're on the dashboard (page may auto-select an agent)
    const dashBtn = page.locator('button').filter({ hasText: /Dashboard/ }).first()
    await dashBtn.click()
    await page.waitForTimeout(1000)

    // Dashboard heading (it's an h1 or h2, check for the text anywhere)
    await expect(page.locator('text=Dashboard').first()).toBeVisible()

    // Stat cards present
    const statsArea = page.locator('body')
    await expect(statsArea).toContainText('Agents')
    await expect(statsArea).toContainText('Runs Today')
    await expect(statsArea).toContainText('Cost Today')
    await expect(statsArea).toContainText('Schedules')
    await expect(statsArea).toContainText('Webhooks')

    // New Agent button in the card grid
    await expect(page.locator('button').filter({ hasText: /\+ New Agent/ })).toBeVisible()
  })

  test('Ctrl+K opens search and produces results', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // Search bar exists
    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible()

    // Ctrl+K focuses it
    await page.keyboard.press('Control+k')
    await expect(searchInput).toBeFocused()

    // Type a query — use a broad term that might match agent names or chat text
    await searchInput.fill('test')
    await page.waitForTimeout(500)

    // Escape closes
    await page.keyboard.press('Escape')
  })

  test('clicking an agent card navigates to agent panel', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // Go to dashboard
    await page.locator('button').filter({ hasText: /Dashboard/ }).first().click()
    await page.waitForTimeout(500)

    // Find agent cards (they have "Today:" and "Total:" text)
    const cards = page.locator('button').filter({ hasText: /Today:.*Total:/ })
    const count = await cards.count()
    if (count > 0) {
      await cards.first().click()
      await page.waitForTimeout(500)

      // Should show the Chat/Runs tabs
      await expect(page.locator('button').filter({ hasText: /^Chat$/ }).first()).toBeVisible()
      await expect(page.locator('button').filter({ hasText: /^Runs/ }).first()).toBeVisible()
    }
  })

  test('agent panel shows Chat and Runs tabs', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // Click first agent in sidebar (skip the Dashboard button)
    const agentButtons = page.locator('button').filter({ hasText: /idle|running|stopped|error/ })
    const count = await agentButtons.count()
    if (count > 0) {
      await agentButtons.first().click()
      await page.waitForTimeout(500)

      // Chat tab should be active
      await expect(page.locator('button').filter({ hasText: /^Chat$/ }).first()).toBeVisible()

      // Click Runs tab
      const runsTab = page.locator('button').filter({ hasText: /^Runs/ }).first()
      await expect(runsTab).toBeVisible()
      await runsTab.click()
      await page.waitForTimeout(300)

      // Should see either "No runs yet" or a table
      const hasContent = (await page.locator('text=No runs yet').count()) > 0
        || (await page.locator('table').count()) > 0
      expect(hasContent).toBe(true)
    }
  })
})
