import { test, expect } from '@playwright/test'

// The in-app help center (help-navigator widget mounted in App.tsx).
// Playwright locators pierce the widget's shadow root automatically.
// Read-only: opens the panel, searches, and browses — never mutates agents.

test.describe('help center', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    // Wait for the WS connection, then let init/reconnect frames settle:
    // each (re)connect delivers an init frame that auto-selects an agent,
    // and under React StrictMode a delayed reconnect fires ~2.5s in.
    await expect(page.getByText('● connected')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(4500)
    const dashboardView = page
      .getByRole('heading', { name: 'Dashboard' })
      .or(page.getByText('No agents yet'))
    await expect(async () => {
      await page.locator('button').filter({ hasText: /Dashboard/ }).first().click()
      await expect(dashboardView.first()).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
  })

  test('launcher opens contextual help; context follows the view', async ({ page }) => {
    const panel = page.getByRole('dialog', { name: 'AgentPower Help' })
    const dashboardView = page
      .getByRole('heading', { name: 'Dashboard' })
      .or(page.getByText('No agents yet'))
    // Retry as a unit: a late WS init frame can flip the view to an agent
    // between navigating to the dashboard and opening the panel.
    await expect(async () => {
      await page.locator('button').filter({ hasText: /Dashboard/ }).first().click()
      await expect(dashboardView.first()).toBeVisible({ timeout: 1000 })
      if (!(await panel.isVisible())) {
        await page.getByRole('button', { name: 'Open help' }).click()
      }
      await expect(panel.getByText('The dashboard', { exact: true })).toBeVisible({
        timeout: 1500,
      })
    }).toPass({ timeout: 20_000 })
    await expect(panel.getByText('Suggested for this page')).toBeVisible()
    await expect(panel.getByText('Browse by topic')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(panel.getByText('Browse by topic')).not.toBeVisible()

    // Navigate to an agent panel (if any agents exist) — suggestions change
    const agentButtons = page.locator('button').filter({ hasText: /idle|running|stopped|error/ })
    if ((await agentButtons.count()) > 0) {
      await agentButtons.first().click()
      await page.waitForTimeout(500)
      await page.keyboard.press('F1')
      await expect(panel.getByText('Chatting with an agent')).toBeVisible()
      await expect(panel.getByText('Scheduling recurring work')).toBeVisible()
    }
  })

  test('search, article rendering, feedback, and back navigation', async ({ page }) => {
    await page.keyboard.press('F1')
    const panel = page.getByRole('dialog', { name: 'AgentPower Help' })

    await panel.getByPlaceholder('Search help articles…').fill('webhook')
    await expect(panel.locator('mark').first()).toBeVisible()
    await panel.locator('button.hn-item[data-hn-id="webhook-triggers"]').click()
    await expect(panel.getByRole('heading', { name: 'Webhook triggers' })).toBeVisible()
    await expect(panel.getByText('Security & lifecycle')).toBeVisible()

    await panel.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(panel.getByText('Thanks for the feedback!')).toBeVisible()

    await panel.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(panel.locator('mark').first()).toBeVisible() // back on search results
  })

  test('category browsing drills into cost & safety help', async ({ page }) => {
    await page.keyboard.press('F1')
    const panel = page.getByRole('dialog', { name: 'AgentPower Help' })

    await panel.locator('button.hn-item', { hasText: 'Cost & safety' }).click()
    await expect(
      panel.getByText('Daily cost limits, run timeouts, and keeping spend under control.'),
    ).toBeVisible()
    await panel.locator('button.hn-item[data-hn-id="cost-limits"]').click()
    await expect(panel.getByText('The budget bar')).toBeVisible()
    await expect(panel.locator('.hn-article').getByText(/turns red at 80%/)).toBeVisible()

    await panel.getByRole('button', { name: 'Back', exact: true }).click()
    await panel.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(panel.getByText('Browse by topic')).toBeVisible()
  })
})
