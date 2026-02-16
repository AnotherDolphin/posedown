import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('#71 Focus Mark Editing - Caret Displacement Logic', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL)
		await page.waitForLoadState('networkidle')

		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(50)
	})

	// issue#71.2: backspacing from inside closing span (**text*|*) should transform to italic and keep caret INSIDE
	test('should keep caret INSIDE when backspacing from inside closing span (**text*|* -> *text*)', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create bold text
		await editor.pressSequentially('**text**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()
		await expect(strong).toContainText('text')

		// 2. Click to show focus marks
		await strong.click()
		await page.waitForTimeout(50)

		const focusMarks = editor.locator('.pd-focus-mark')
		await expect(focusMarks).toHaveCount(2)

		// 3. Position caret inside the closing span: **text*|*
		// Go to end, then left one to be between the two asterisks
		await page.keyboard.press('End')
		await page.keyboard.press('ArrowLeft')
		await page.waitForTimeout(50)

		// 4. Backspace to delete one * from inside
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(100)

		// 5. Verification:
		// - Mirroring should update opening delimiter to match
		// - Content should transform to *text* (italic)
		// - Caret should remain INSIDE the element, at the end of "text"
		// Expected: *tex|t* with caret inside <em>

		const em = editor.locator('em')
		await expect(em).toBeVisible()
		await expect(em).toContainText('text')

		// Check caret position
		const caretInfo = await page.evaluate(() => {
			const sel = window.getSelection()
			if (!sel || !sel.anchorNode) return null
			return {
				nodeType: sel.anchorNode.nodeType,
				textContent: sel.anchorNode.textContent,
				offset: sel.anchorOffset,
				parentNodeTagName: sel.anchorNode.parentNode?.nodeName
			}
		})

		console.log('Caret Info (issue#71.2 - backspace from inside):', caretInfo)

		// Caret should be INSIDE the EM element
		expect(caretInfo?.parentNodeTagName).toBe('EM')
		// Should be in the text content "text"
		expect(caretInfo?.textContent).toBe('text')
	})

	// should keep caret in the middle when typing a new delimiter before focus mark span (e.g., *bold|* -> **bold*|*)
	test('should maintain caret position when typing before closing focus mark span', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create italic text: *bold*
		await editor.pressSequentially('*bold*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()
		await expect(em).toContainText('bold')

		// 2. Click into italic to show focus marks
		await em.click()
		await page.waitForTimeout(50)

		const focusMarks = editor.locator('.pd-focus-mark')
		await expect(focusMarks).toHaveCount(2)

		// 3. Navigate to BEFORE the closing focus mark span
		// Structure: [*]bold[*] - cursor after "bold" before closing span
		await page.keyboard.press('End')
		await page.keyboard.press('ArrowLeft') // Before closing span, after "bold"
		await page.waitForTimeout(50)

		// 4. Type * then X
		await page.keyboard.type('*')
		await page.waitForTimeout(100)
		await page.keyboard.type('X')
		await page.waitForTimeout(50)

		// 5. Expected: "bold*X" - the * and X should be inserted after "bold" in sequence
		const finalText = await editor.locator('p').textContent()
		expect(finalText).toContain('bold*X*')
	})

	// should keep caret in the middle when typing a new delimiter before focus mark span (e.g., |*bold* -> *|*bold**)
	test('should maintain caret position when typing before opening focus mark span', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create italic text: *bold*
		await editor.pressSequentially('*bold*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()
		await expect(em).toContainText('bold')

		// 2. Click into italic to show focus marks
		await em.click()
		await page.waitForTimeout(50)

		const focusMarks = editor.locator('.pd-focus-mark')
		await expect(focusMarks).toHaveCount(2)

		// 3. Navigate to BEFORE the opening focus mark span (Home position)
		await page.keyboard.press('Home')
		await page.waitForTimeout(50)

		// 4. Type * then X
		await page.keyboard.type('*')
		await page.waitForTimeout(100)
		await page.keyboard.type('X')
		await page.waitForTimeout(50)

		// 5. Expected: "*X" followed by the italic "bold"
		// The * and X should be inserted as literal text before the formatted element
		const finalText = await editor.locator('p').textContent()
		expect(finalText).toMatch(/^\*X.*bold/)
	})

})
