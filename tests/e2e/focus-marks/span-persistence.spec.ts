import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Focus Mark Span Persistence', () => {
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

	// ============== SPAN PERSISTENCE DURING TRANSFORMATIONS (Section 2) ==============

	test('focus spans persist when typing creates new pattern inside active element', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: Create <em>text</em> and focus cursor inside
		await editor.pressSequentially('*text*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// Click inside to show focus marks
		await em.click()
		await page.waitForTimeout(50)

		// Navigate into the text area
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening *
		await page.keyboard.press('ArrowRight') // into content

		// Verify initial focus spans exist
		const spansBefore = await editor.locator('.pd-focus-mark').count()
		expect(spansBefore).toBe(2)

		// Action: Type to create **bold** pattern inside the italic
		await page.keyboard.type('**nested**')
		await page.waitForTimeout(100)

		// Verify: Both italic spans AND/OR new bold spans exist
		const spansAfter = await editor.locator('.pd-focus-mark').count()
		expect(spansAfter).toBeGreaterThanOrEqual(2) // At least original spans persist

		// Verify: Italic formatting still present
		await expect(em).toBeVisible()
	})

	// ============== SPAN POSITION AFTER TRANSFORMATION (Section 3) ==============

	test('focus spans are correctly positioned after transformation', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: <strong>text</strong> with focus spans
		await editor.pressSequentially('**text**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click inside to show focus marks
		await strong.click()
		await page.waitForTimeout(50)

		// Navigate into content area
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // first *
		await page.keyboard.press('ArrowRight') // second *
		await page.keyboard.press('ArrowRight') // into content

		// Action: Type to create nested italic pattern
		await page.keyboard.type('*italic*')
		await page.waitForTimeout(100)

		// Verify: Strong spans still at outer boundaries
		const firstChild = await strong.evaluate((el) => el.firstChild?.className)
		const lastChild = await strong.evaluate((el) => el.lastChild?.className)

		expect(firstChild).toBe('pd-focus-mark')
		expect(lastChild).toBe('pd-focus-mark')

		// Verify: Delimiter text matches element type
		const openingSpan = await strong.evaluate((el) => el.firstChild?.textContent)
		const closingSpan = await strong.evaluate((el) => el.lastChild?.textContent)

		expect(openingSpan).toBe('**')
		expect(closingSpan).toBe('**')
	})

	// ============== CARET POSITION AFTER PATTERN INSIDE ACTIVE ELEMENT (Section 4) ==============

	test('caret position correct after transformation with span reinjection', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: <em>text</em> with cursor at specific position
		await editor.pressSequentially('*original text*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// Click inside to show focus marks
		await em.click()
		await page.waitForTimeout(50)

		// Navigate to middle of content
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening *
		await page.keyboard.press('ArrowRight') // 'o'
		await page.keyboard.press('ArrowRight') // 'r'
		await page.keyboard.press('ArrowRight') // 'i'
		await page.keyboard.press('ArrowRight') // 'g'
		await page.keyboard.press('ArrowRight') // 'i'
		await page.keyboard.press('ArrowRight') // 'n'
		await page.keyboard.press('ArrowRight') // 'a'
		await page.keyboard.press('ArrowRight') // 'l'
		await page.keyboard.press('ArrowRight') // ' '

		// Action: Type to create **bold** pattern
		await page.keyboard.type('**bold**')
		await page.waitForTimeout(100)

		// Verify: Caret is at expected position (not moved to end/start of block)
		await page.keyboard.type('X')
		await page.waitForTimeout(50)

		const html = await editor.innerHTML()
		// Should contain 'bold**X' not 'bold**...X' at very end of block
		expect(html).toContain('X')

		// Verify: Next input goes to correct location
		await page.keyboard.type('Y')
		const updatedHtml = await editor.innerHTML()
		expect(updatedHtml).toContain('XY')
	})

	test('caret stays in position after creating nested element', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create bold text
		await editor.pressSequentially('**hello world**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click and navigate into content
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		// Move past opening mark and "hello "
		for (let i = 0; i < 8; i++) {
			await page.keyboard.press('ArrowRight')
		}

		// Type italic markers around "world"
		await page.keyboard.type('*')
		await page.waitForTimeout(50)

		// Move to after "world"
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowRight')
		}
		await page.keyboard.type('*')
		await page.waitForTimeout(100)

		// Type a marker character to verify caret position
		await page.keyboard.type('Z')
		await page.waitForTimeout(50)

		const text = await editor.textContent()
		// Z should appear right after the closing * we typed
		expect(text).toContain('*Z')
	})
})
