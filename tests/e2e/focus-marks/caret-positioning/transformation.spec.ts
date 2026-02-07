import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Caret Position After Transformation', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL)
		await page.waitForLoadState('networkidle')

		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(50) // a small buffer
	})

	// REGRESSION: Issue #5 - Caret position stability

	test('issue#5 regression: caret position stable with setCaretAtEnd', async ({ page }) => {
		// Verify the setCaretAfter → setCaretAtEnd fix
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: Active formatted element
		await editor.pressSequentially('**text**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click inside and navigate
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')

		// Action: Type new pattern
		await page.keyboard.type('*italic*')
		await page.waitForTimeout(100)

		// Verify: Caret at end of new text node (not moved elsewhere)
		await page.keyboard.type('X')
		await page.waitForTimeout(50)

		const html = await editor.innerHTML()
		expect(html).toContain('italic*X')

		// Verify: Next input goes to correct location (not jumped to end of block)
		await page.keyboard.type('Y')
		const updatedHtml = await editor.innerHTML()
		expect(updatedHtml).toContain('italic*XY')
		expect(updatedHtml).not.toMatch(/\*\*XY$/) // Not at end of block
	})

	test('issue#5 regression: caret stays at insertion point after transformation', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create text with content before and after
		await editor.pressSequentially('**before middle after**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click and navigate to "middle"
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		// Navigate past "**before "
		for (let i = 0; i < 9; i++) {
			await page.keyboard.press('ArrowRight')
		}

		// Type italic pattern around a word
		await page.keyboard.type('*new*')
		await page.waitForTimeout(100)

		// Type marker to verify caret position
		await page.keyboard.type('Z')
		await page.waitForTimeout(50)

		const text = await editor.textContent()
		// Z should be right after the word we just typed
		expect(text).toContain('*Z')
	})

	test('issue#5 regression: multiple consecutive insertions maintain caret', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create simple bold text
		await editor.pressSequentially('**abc**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click inside
		await strong.click()
		await page.waitForTimeout(50)

		// Navigate into content
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')

		// Type first pattern
		await page.keyboard.type('*x*')
		await page.waitForTimeout(50)

		// Type marker
		await page.keyboard.type('1')

		// Type second pattern
		await page.keyboard.type('`y`')
		await page.waitForTimeout(50)

		// Type marker
		await page.keyboard.type('2')

		// Type third pattern
		await page.keyboard.type('~~z~~')
		await page.waitForTimeout(50)

		// Type final marker
		await page.keyboard.type('3')
		await page.waitForTimeout(100)

		// All markers should be in order in the text
		const text = await editor.textContent()
		const indexOf1 = text?.indexOf('1') ?? -1
		const indexOf2 = text?.indexOf('2') ?? -1
		const indexOf3 = text?.indexOf('3') ?? -1

		expect(indexOf1).toBeLessThan(indexOf2)
		expect(indexOf2).toBeLessThan(indexOf3)
	})
})
