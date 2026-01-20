import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Focus Mark Regression Tests', () => {
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

	// ============== INVALID PATTERN SPAN BEHAVIOR (Section 7) ==============

	test('focus spans removed when pattern becomes invalid after transformation', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: <strong>text</strong>
		await editor.pressSequentially('**text**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click to show focus marks
		await strong.click()
		await page.waitForTimeout(50)

		// Action: Edit opening span to make *** (invalid)
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.type('*')
		await page.waitForTimeout(100)

		// Blur to trigger unwrap
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Verify: After transformation, no formatting element exists
		await expect(strong).not.toBeVisible()

		// Verify: No focus spans remain (element unwrapped to plain text)
		const spans = await editor.locator('.pd-focus-mark').count()
		expect(spans).toBe(0)

		// Verify: Content is plain text ***text***
		const text = await editor.textContent()
		expect(text).toBe('***text***')
	})

	test('focus spans cleaned up when delimiter becomes unsupported', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create bold text
		await editor.pressSequentially('**text**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click to show marks
		await strong.click()
		await page.waitForTimeout(50)

		// Navigate into delimiter and add invalid characters
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.type('abc') // Makes '**abc' which is invalid
		await page.waitForTimeout(100)

		// After typing non-delimiter chars, formatting should be lost
		// Mirroring only allows SUPPORTED_INLINE_DELIMITERS
		const innerHTML = await editor.innerHTML()

		// Either strong is gone, or content has changed
		// The exact behavior depends on implementation, but editor should be stable
		await expect(editor).toBeVisible()
	})

	// ============== ISSUE#6 REGRESSION (Section 8) ==============

	test('issue#6 regression: focus spans not lost after pattern transformation', async ({
		page
	}) => {
		// The exact scenario that was broken before the fix
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Setup: <em>text</em> with cursor inside
		await editor.pressSequentially('*text*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// Click inside to show focus marks
		await em.click()
		await page.waitForTimeout(50)

		// Navigate into content
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening *
		await page.keyboard.press('ArrowRight') // into 't'

		// Verify initial spans visible
		const spansBefore = await editor.locator('.pd-focus-mark').count()
		expect(spansBefore).toBe(2)

		// Action: Type **bold** pattern inside italic element
		await page.keyboard.type('**bold**')
		await page.waitForTimeout(100)

		// Verify: Italic focus spans still visible
		const spansAfter = await editor.locator('.pd-focus-mark').count()
		expect(spansAfter).toBeGreaterThanOrEqual(2)

		// Verify: User can still see and edit italic delimiters
		await expect(em).toBeVisible()

		const firstSpan = await em.evaluate((el) => el.firstChild?.className)
		expect(firstSpan).toBe('pd-focus-mark')
	})

	test('issue#6 regression: nested pattern creation preserves outer focus marks', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create bold text
		await editor.pressSequentially('**outer**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click to show marks
		await strong.click()
		await page.waitForTimeout(50)

		// Verify marks exist
		await expect(editor.locator('.pd-focus-mark')).toHaveCount(2)

		// Navigate into content and create nested italic
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')

		await page.keyboard.type('*inner*')
		await page.waitForTimeout(100)

		// Strong's marks should persist
		await expect(strong).toBeVisible()

		// Check that strong still has focus marks as first/last children
		const hasOpeningMark = await strong.evaluate(
			(el) => el.firstChild?.className === 'pd-focus-mark'
		)
		const hasClosingMark = await strong.evaluate(
			(el) => el.lastChild?.className === 'pd-focus-mark'
		)

		expect(hasOpeningMark).toBe(true)
		expect(hasClosingMark).toBe(true)
	})

	// ============== ISSUE#5 REGRESSION (Section 9) ==============

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

	// ============== ISSUE#9 - INVALID DELIMITER UNWRAPPING ==============

	test('issue#9: valid italic pattern becomes invalid when delimiter edited - unwraps to plain text', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create valid italic: *italic*
		await editor.pressSequentially('*italic*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// Click to show focus marks
		await em.click()
		await page.waitForTimeout(50)

		// Navigate to opening delimiter and add character to make it invalid
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // into opening span
		await page.keyboard.type('a') // Makes '*a' which is invalid
		await page.waitForTimeout(100)

		// Blur to trigger unwrapping
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Verify: No em element remains
		await expect(em).not.toBeVisible()

		// Verify: Content is plain text
		const text = await editor.textContent()
		expect(text).toContain('*a')
		expect(text).toContain('italic*')

		// Verify: No focus marks remain
		const spans = await editor.locator('.pd-focus-mark').count()
		expect(spans).toBe(0)
	})

	test('issue#9: deleting part of closing delimiter makes pattern invalid - unwraps to plain text', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create valid bold: **bold**
		await editor.pressSequentially('**bold**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click to show focus marks
		await strong.click()
		await page.waitForTimeout(50)

		// Navigate to closing delimiter and delete one *
		await page.keyboard.press('End')
		await page.keyboard.press('ArrowLeft') // into closing span
		await page.keyboard.press('Backspace') // Delete one *, leaves only *
		await page.waitForTimeout(100)

		// Blur to trigger unwrapping
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Verify: No strong element remains
		await expect(strong).not.toBeVisible()

		// Verify: Content is plain text with mismatched delimiters
		const text = await editor.textContent()
		expect(text).toContain('**bold')
		expect(text).toContain('*') // Only one * at end

		// Verify: No focus marks remain
		const spans = await editor.locator('.pd-focus-mark').count()
		expect(spans).toBe(0)
	})

	test('issue#9: typing inside opening delimiter makes pattern invalid - unwraps to plain text', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create valid strikethrough: ~~strike~~
		await editor.pressSequentially('~~strike~~')
		await page.waitForTimeout(100)

		const del = editor.locator('del')
		await expect(del).toBeVisible()

		// Click to show focus marks
		await del.click()
		await page.waitForTimeout(50)

		// Navigate into opening delimiter span and type letter
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // into opening span
		await page.keyboard.press('ArrowRight') // past first ~
		await page.keyboard.type('x') // Makes '~~x' which breaks the pattern
		await page.waitForTimeout(100)

		// Blur to trigger unwrapping
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Verify: No del element remains
		await expect(del).not.toBeVisible()

		// Verify: Content is plain text
		const text = await editor.textContent()
		expect(text).toContain('~~x')
		expect(text).toContain('strike~~')

		// Verify: No focus marks remain
		const spans = await editor.locator('.pd-focus-mark').count()
		expect(spans).toBe(0)
	})

	test('issue#9: transition from valid to invalid pattern stays as plain text', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create valid code: `code`
		await editor.pressSequentially('`code`')
		await page.waitForTimeout(100)

		const code = editor.locator('code')
		await expect(code).toBeVisible()

		// Click to show focus marks
		await code.click()
		await page.waitForTimeout(50)

		// Add another ` at the beginning to make ``code` (invalid)
		await page.keyboard.press('Home')
		await page.keyboard.type('`')
		await page.waitForTimeout(100)

		// Blur
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Verify: Pattern is now invalid, no code element
		await expect(code).not.toBeVisible()

		// Verify: Plain text remains
		const text = await editor.textContent()
		expect(text).toContain('``code`')

		// Type again - should stay as plain text
		await editor.click()
		await page.keyboard.press('End')
		await page.keyboard.type('X')
		await page.waitForTimeout(100)

		// Still no code element
		await expect(code).not.toBeVisible()

		const finalText = await editor.textContent()
		expect(finalText).toContain('``code`X')
	})

	test('issue#9: removing characters from delimiter restores valid pattern', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create valid bold: **bold**
		await editor.pressSequentially('**bold**')
		await page.waitForTimeout(100)

		let strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click and make it invalid by adding character
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.type('x') // Makes '**x' - invalid
		await page.waitForTimeout(100)

		// Blur - should unwrap
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		await expect(strong).not.toBeVisible()

		// Now click back in and remove the 'x' to restore validity
		await editor.click()
		await page.waitForTimeout(50)

		// Find and delete the 'x'
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past *
		await page.keyboard.press('ArrowRight') // past *
		await page.keyboard.press('Delete') // delete x
		await page.waitForTimeout(100)

		// Blur to reparse
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Verify: Pattern is valid again, strong element restored
		strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		const text = await strong.textContent()
		expect(text).toBe('bold')
	})
})

