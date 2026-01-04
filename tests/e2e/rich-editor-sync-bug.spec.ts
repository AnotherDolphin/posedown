import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Sync Back to Markdown Bug', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL)
		await page.waitForLoadState('networkidle')

		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
	})

	test('should convert pasted HTML with nested emphasis correctly without HTML entity encoding', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')
		const textarea = page.locator('textarea')

		// Simulate pasting HTML with nested emphasis
		// This tests the actual bug scenario from README
		await editor.click()
		await editor.evaluate((el) => {
			el.innerHTML = '<p><strong>b<em>i</em></strong></p>'
		})

		// Wait for any processing
		await page.waitForTimeout(200)

		// Verify the HTML structure
		const innerHTML = await editor.evaluate((el) => el.innerHTML)
		expect(innerHTML).toContain('<strong>b<em>i</em></strong>')

		// Blur the editor to trigger syncToTrees
		await page.locator('body').click()
		await page.waitForTimeout(100)

		// Get the textarea value (which is synced from innerHTML)
		const textareaValue = await textarea.inputValue()

		// Should convert to correct markdown without HTML entity encoding
		// The bug was: **&#x62;_&#x69;_**
		// Fixed: Using * for emphasis (** is matched first for bold, then * for italic)
		expect(textareaValue.trim()).toBe('**b*i***')
		expect(textareaValue).not.toContain('&#x')
	})
})
