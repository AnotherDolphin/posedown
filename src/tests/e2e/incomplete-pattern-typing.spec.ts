import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test/text-block-editor'

test.describe('Rich Editor - CommonMark Spec Compliance', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL)
		await page.waitForLoadState('networkidle')

		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
	})

	test('should NOT transform **b_i_** to nested emphasis (CommonMark spec)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Type the pattern **b_i_**
		// Per CommonMark spec, underscores don't work for emphasis inside **
		await editor.click()
		await page.keyboard.type('**b_i_**')

		// Wait for transformation
		await page.waitForTimeout(200)

		// Get the HTML structure
		const innerHTML = await editor.evaluate((el) => el.innerHTML)

		// Should produce <strong>b_i_</strong> (no nested <em>)
		// This is CORRECT per CommonMark spec
		expect(innerHTML).toContain('<strong>b_i_</strong>')
		expect(innerHTML).not.toContain('<em>')
	})

	test('should transform **b*i*** to nested emphasis (correct syntax)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Type the correct pattern for nested formatting
		await editor.click()
		await page.keyboard.type('**b*i***')

		// Wait for transformation
		await page.waitForTimeout(200)

		// Get the HTML structure
		const innerHTML = await editor.evaluate((el) => el.innerHTML)

		// Should produce <strong>b<em>i</em></strong>
		expect(innerHTML).toContain('<strong>')
		expect(innerHTML).toContain('<em>i</em>')
		expect(innerHTML).toContain('</strong>')
	})
})
