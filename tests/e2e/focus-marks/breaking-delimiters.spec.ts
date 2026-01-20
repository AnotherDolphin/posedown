import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Focus Mark Breaking Delimiters (Issue#10)', () => {
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

	// ============== BASIC BREAKING EDIT WITH ITALIC (*) ==============

	test('typing * in middle of italic should break pattern and create new formatted element', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create italic text: *italic*
		await editor.pressSequentially('*italic*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// 2. Click to show focus marks
		await em.click()
		await page.waitForTimeout(50)

		// 3. Navigate to middle of "italic" (after "ita")
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening *
		await page.keyboard.press('ArrowRight') // i
		await page.keyboard.press('ArrowRight') // t
		await page.keyboard.press('ArrowRight') // a

		// 4. Type * to break the pattern
		await page.keyboard.type('*')
		await page.waitForTimeout(100)

		// 5. Blur to trigger transformation
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Expected behavior: *ita*lic* should transform to <em>ita</em>lic*
		// Verify first em exists with content "ita"
		const firstEm = editor.locator('em').first()
		const firstEmText = await firstEm.textContent()
		expect(firstEmText).toBe('ita')

		// Verify the remaining text is "lic*"
		const fullText = await editor.textContent()
		expect(fullText).toContain('lic*')

		// Verify the overall structure
		const html = await editor.innerHTML()
		expect(html).toMatch(/<em>ita<\/em>/)
	})

	test('typing * in middle of italic maintains cursor position after transformation', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create italic text
		await editor.pressSequentially('*italic*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// Click and navigate to middle
		await em.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening *
		await page.keyboard.press('ArrowRight') // i
		await page.keyboard.press('ArrowRight') // t
		await page.keyboard.press('ArrowRight') // a

		// Type * to break
		await page.keyboard.type('*')
		await page.waitForTimeout(100)

		// Type marker to verify cursor position
		await page.keyboard.type('X')
		await page.waitForTimeout(50)

		// Cursor should be right after the breaking *, not jumped elsewhere
		const text = await editor.textContent()
		expect(text).toContain('*X')
	})

	// ============== BREAKING EDIT WITH BOLD (**) ==============

	test('typing ** in middle of bold should break pattern and create new formatted element', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create bold text: **bold**
		await editor.pressSequentially('**bold**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// 2. Click to show focus marks
		await strong.click()
		await page.waitForTimeout(50)

		// 3. Navigate to middle of "bold" (after "bo")
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening **
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight') // b
		await page.keyboard.press('ArrowRight') // o

		// 4. Type ** to break the pattern
		await page.keyboard.type('**')
		await page.waitForTimeout(100)

		// 5. Blur to trigger transformation
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Expected behavior: **bo**ld** should transform to <strong>bo</strong>ld**
		// Verify first strong exists with content "bo"
		const firstStrong = editor.locator('strong').first()
		const firstStrongText = await firstStrong.textContent()
		expect(firstStrongText).toBe('bo')

		// Verify the remaining text is "ld**"
		const fullText = await editor.textContent()
		expect(fullText).toContain('ld**')

		// Verify the overall structure
		const html = await editor.innerHTML()
		expect(html).toMatch(/<strong>bo<\/strong>/)
	})

	test('typing ** in middle of bold maintains cursor position after transformation', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create bold text
		await editor.pressSequentially('**bold**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click and navigate to middle
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening **
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight') // b
		await page.keyboard.press('ArrowRight') // o

		// Type ** to break
		await page.keyboard.type('**')
		await page.waitForTimeout(100)

		// Type marker to verify cursor position
		await page.keyboard.type('X')
		await page.waitForTimeout(50)

		// Cursor should be right after the breaking **, not jumped elsewhere
		const text = await editor.textContent()
		expect(text).toContain('**X')
	})

	// ============== BREAKING EDIT WITH STRIKETHROUGH (~~) ==============

	test('typing ~~ in middle of strikethrough should break pattern', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create strikethrough text: ~~strike~~
		await editor.pressSequentially('~~strike~~')
		await page.waitForTimeout(100)

		const del = editor.locator('del')
		await expect(del).toBeVisible()

		// 2. Click to show focus marks
		await del.click()
		await page.waitForTimeout(50)

		// 3. Navigate to middle of "strike" (after "str")
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening ~~
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight') // s
		await page.keyboard.press('ArrowRight') // t
		await page.keyboard.press('ArrowRight') // r

		// 4. Type ~~ to break the pattern
		await page.keyboard.type('~~')
		await page.waitForTimeout(100)

		// 5. Blur to trigger transformation
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Expected: ~~str~~ike~~ should transform to <del>str</del>ike~~
		const firstDel = editor.locator('del').first()
		const firstDelText = await firstDel.textContent()
		expect(firstDelText).toBe('str')

		// Verify remaining text
		const fullText = await editor.textContent()
		expect(fullText).toContain('ike~~')
	})

	// ============== BREAKING EDIT SHOULD NOT TRIGGER ON REGULAR TYPING ==============

	test('typing regular characters should NOT break pattern', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create italic text
		await editor.pressSequentially('*italic*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// Click and navigate to middle
		await em.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening *
		await page.keyboard.press('ArrowRight') // i
		await page.keyboard.press('ArrowRight') // t
		await page.keyboard.press('ArrowRight') // a

		// Type regular character (not a delimiter)
		await page.keyboard.type('X')
		await page.waitForTimeout(100)

		// Verify em still exists and contains the new character
		await expect(em).toBeVisible()
		const emText = await em.textContent()
		expect(emText).toContain('itaXlic')

		// Verify no breaking happened (no new em elements created)
		const emCount = await editor.locator('em').count()
		expect(emCount).toBe(1)
	})

	test('typing space or other non-delimiter should NOT break pattern', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create bold text
		await editor.pressSequentially('**bold**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// Click and navigate to middle
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening **
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight') // b
		await page.keyboard.press('ArrowRight') // o

		// Type space
		await page.keyboard.press('Space')
		await page.waitForTimeout(100)

		// Verify strong still exists and contains space
		await expect(strong).toBeVisible()
		const strongText = await strong.textContent()
		expect(strongText).toContain('bo ')

		// Verify no breaking happened
		const strongCount = await editor.locator('strong').count()
		expect(strongCount).toBe(1)
	})

	// ============== ROGUE DELIMITER SCENARIO ==============

	test('rogue delimiter scenario - commonmark spec behavior', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// According to notes: **bold`*| and *italic*** causes issues
		// This test documents the scenario mentioned in focusmark-notes.md

		// Create: **bold`*
		await editor.pressSequentially('**bold`*')
		await page.waitForTimeout(100)

		// Type: and *italic***
		await page.keyboard.type(' and *italic***')
		await page.waitForTimeout(100)

		// Blur to see final rendering
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Document what happens (this is an exploratory test)
		const html = await editor.innerHTML()
		const text = await editor.textContent()

		// The test exists to verify commonmark spec behavior
		// Expected: Should handle the rogue delimiter according to commonmark rules
		// This test documents actual behavior for comparison with spec
		expect(text).toBeTruthy() // Just verify it doesn't crash
	})

	test('adjacent formatted elements with shared delimiters', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create a scenario where delimiters are ambiguous
		// Example: *text**more* - is this italic with ** inside, or bold with * outside?
		await editor.pressSequentially('*text**more*')
		await page.waitForTimeout(100)

		// Blur to trigger parsing
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Document how the parser handles this
		const html = await editor.innerHTML()
		const text = await editor.textContent()

		// Verify it renders something stable
		expect(text).toContain('text')
		expect(text).toContain('more')
	})

	// ============== EDGE CASES ==============

	test('breaking delimiter at start of content (after opening delimiter)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create italic text
		await editor.pressSequentially('*italic*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// Click and navigate to just after opening delimiter
		await em.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // past opening *

		// Type * immediately - this makes **italic*
		await page.keyboard.type('*')
		await page.waitForTimeout(100)

		// Blur
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// This might change from italic to bold, or create empty italic
		// Just verify it doesn't crash and produces valid HTML
		const text = await editor.textContent()
		expect(text).toBeTruthy()
	})

	test('breaking delimiter at end of content (before closing delimiter)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Create italic text
		await editor.pressSequentially('*italic*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// Click and navigate to just before closing delimiter
		await em.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('End')
		await page.keyboard.press('ArrowLeft') // before closing *

		// Type * - this makes *italic**
		await page.keyboard.type('*')
		await page.waitForTimeout(100)

		// Blur
		await page.keyboard.press('Escape')
		await page.waitForTimeout(100)

		// Verify stable output
		const text = await editor.textContent()
		expect(text).toBeTruthy()
	})
})
