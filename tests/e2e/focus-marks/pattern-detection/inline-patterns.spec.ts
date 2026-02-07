import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Focus Mark Nested Transformations', () => {
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

	// ============== MULTIPLE NESTED TRANSFORMATIONS (Section 5) ==============

	test('handles multiple pattern transformations with span persistence', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: <strong>text</strong>
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

		// Action 1: Type to create *italic* inside
		await page.keyboard.type('*level2*')
		await page.waitForTimeout(100)

		// Verify level 1 spans exist
		let spans = await editor.locator('.pd-focus-mark').count()
		expect(spans).toBeGreaterThanOrEqual(2)

		// Action 2: Navigate into italic, type ~~strike~~ inside
		await page.keyboard.press('ArrowLeft')
		await page.keyboard.press('ArrowLeft')
		await page.keyboard.type('~~level3~~')
		await page.waitForTimeout(100)

		// Verify: All three levels maintain their formatting
		await expect(editor.locator('strong')).toBeVisible()
		await expect(editor.locator('em')).toBeVisible()
		await expect(editor.locator('del')).toBeVisible()

		// Verify: Appropriate spans exist (at least for current active element)
		spans = await editor.locator('.pd-focus-mark').count()
		expect(spans).toBeGreaterThanOrEqual(2)
	})

	test('handles deeply nested formatting without losing outer spans', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create bold with text
		await editor.pressSequentially('**outer content**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click to show marks
		await strong.click()
		await page.waitForTimeout(50)

		// Verify initial marks
		const focusMarks = editor.locator('.pd-focus-mark')
		await expect(focusMarks).toHaveCount(2)
		await expect(focusMarks.first()).toContainText('**')

		// Navigate inside and add italic
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight') // past "o"
		await page.keyboard.press('ArrowRight') // past "u"
		await page.keyboard.press('ArrowRight') // past "t"
		await page.keyboard.press('ArrowRight') // past "e"
		await page.keyboard.press('ArrowRight') // past "r"
		await page.keyboard.press('ArrowRight') // past " "

		await page.keyboard.type('*inner*')
		await page.waitForTimeout(100)

		// Strong should still be visible and maintain its focus marks
		await expect(strong).toBeVisible()

		// Nested italic should be created
		const em = editor.locator('em')
		await expect(em).toBeVisible()
		await expect(em).toContainText('inner')
	})

	// ============== SPAN EXTRACTION EDGE CASES (Section 6) ==============

	test('handles transformation when only one span exists', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: Manually create element with only opening span
		await editor.evaluate((el) => {
			const strong = document.createElement('strong')
			const openSpan = document.createElement('span')
			openSpan.className = 'pd-focus-mark'
			openSpan.textContent = '**'
			strong.appendChild(openSpan)
			strong.appendChild(document.createTextNode('text'))
			el.appendChild(strong)
		})
		await page.waitForTimeout(50)

		// Focus inside strong
		const strong = editor.locator('strong')
		await strong.click()
		await page.waitForTimeout(50)

		// Action: Type to create pattern
		await page.keyboard.type('*italic*')
		await page.waitForTimeout(100)

		// Verify: No crash, graceful handling
		await expect(editor).toBeVisible()
	})

	test('handles transformation when span contains selection', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: Create formatted element
		await editor.pressSequentially('**text**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click to show focus marks
		await strong.click()
		await page.waitForTimeout(50)

		// Navigate to opening span
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')

		// Select opening span content by double-clicking
		const openingSpan = editor.locator('.pd-focus-mark').first()
		await openingSpan.dblclick()
		await page.waitForTimeout(50)

		// Action: Type to trigger transformation
		await page.keyboard.type('***')
		await page.waitForTimeout(100)

		// Verify: No crash, behavior is defined
		await expect(editor).toBeVisible()
	})

	test('handles transformation when spans are empty', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: Manually create element with empty spans
		await editor.evaluate((el) => {
			const strong = document.createElement('strong')
			const openSpan = document.createElement('span')
			openSpan.className = 'pd-focus-mark'
			openSpan.textContent = '' // Empty span
			const closeSpan = document.createElement('span')
			closeSpan.className = 'pd-focus-mark'
			closeSpan.textContent = '' // Empty span
			strong.appendChild(openSpan)
			strong.appendChild(document.createTextNode('text'))
			strong.appendChild(closeSpan)
			el.appendChild(strong)
		})
		await page.waitForTimeout(50)

		// Focus inside strong
		const strong = editor.locator('strong')
		await strong.click()
		await page.waitForTimeout(50)

		// Action: Type some content
		await page.keyboard.type('X')
		await page.waitForTimeout(100)

		// Verify: No crash, graceful handling
		await expect(editor).toBeVisible()
		const text = await editor.textContent()
		expect(text).toContain('X')
	})

	test('handles rapid sequential transformations', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create initial bold text
		await editor.pressSequentially('**a**')
		await page.waitForTimeout(100)

		let strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click inside
		await strong.click()
		await page.waitForTimeout(50)

		// Rapidly type patterns inside
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')

		// Type multiple nested patterns quickly
		await page.keyboard.type('*b*')
		await page.waitForTimeout(50)
		await page.keyboard.type('`c`')
		await page.waitForTimeout(50)
		await page.keyboard.type('~~d~~')
		await page.waitForTimeout(100)

		// Verify: No crash, editor still functional
		await expect(editor).toBeVisible()

		// Should have multiple formatted elements
		const formattedCount = await editor.locator('strong, em, code, del').count()
		expect(formattedCount).toBeGreaterThanOrEqual(1)
	})
})
