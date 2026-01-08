import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Caret Position After Transformations', () => {
	test.beforeEach(async ({ page }) => {
		// Only navigate once at the start of the suite
		if (page.url() === 'about:blank') {
			await page.goto(EDITOR_URL)
			await page.waitForLoadState('networkidle')
		}

		// Clear the editor before each test
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
	})

	test('caret should be after <strong> when typing **bold**', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('**bold**')
		await page.waitForTimeout(100)

		await expect(editor.locator('strong')).toContainText('bold')

		// Verify caret position by typing immediately after
		await page.keyboard.type('x')

		const innerHTML = await editor.innerHTML()
		// Should be inside a <p> tag
		expect(innerHTML).toContain('<strong>bold</strong>x')
	})

	test('caret should be preserved when pattern has text before it', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Type text with pattern
		await page.keyboard.type('hello **world**')
		await page.waitForTimeout(100)

		await expect(editor.locator('strong')).toContainText('world')

		// Type - should go after <strong>
		await page.keyboard.type('y')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('hello <strong>world</strong>y')
	})

	test('caret should handle pattern followed by space and text', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('**bold** text')
		await page.waitForTimeout(100)

		await expect(editor.locator('strong')).toContainText('bold')

		// Verify both the pattern and text exist
		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<strong>bold')
		expect(innerHTML).toContain('text')
	})

	test('caret should be preserved when typing pattern in middle of text', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Type with pattern in middle - need to pause to let pattern process
		await page.keyboard.type('start **mid**')
		await page.waitForTimeout(100)
		await page.keyboard.type(' end')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('start <strong>mid</strong> end')
	})

	test('caret should be after nested patterns', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('***nested***')
		await page.waitForTimeout(100)

		// Should be <em><strong>nested</strong></em>
		await expect(editor.locator('em strong')).toContainText('nested')

		// Type - should go OUTSIDE both elements
		await page.keyboard.type('z')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<em><strong>nested</strong></em>z')
	})

	test('caret should handle multiple patterns in sequence', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('**a**')
		await page.waitForTimeout(100)
		await page.keyboard.type(' ')
		await page.keyboard.type('*b*')
		await page.waitForTimeout(100)
		await page.keyboard.type(' ')
		await page.keyboard.type('`c`')
		await page.waitForTimeout(100)

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<strong>a</strong> <em>b</em> <code>c</code>')

		// Verify caret is after all patterns
		await page.keyboard.type('!')
		const updated = await editor.innerHTML()
		expect(updated).toContain('<code>c</code>!')
	})

	test('caret should handle backspace after pattern transformation', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('**test**xyz')
		await page.waitForTimeout(100)

		// Backspace 3 times to delete "xyz"
		await page.keyboard.press('Backspace')
		await page.keyboard.press('Backspace')
		await page.keyboard.press('Backspace')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<strong>test</strong>')
		expect(innerHTML).not.toContain('xyz')
	})

	test('caret should stay outside pattern when typing space after it', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('**bold**')
		await page.waitForTimeout(100)

		// Type space - should be outside <strong>
		await page.keyboard.type(' ')

		// Type character - should also be outside
		await page.keyboard.type('x')

		const innerHTML = await editor.innerHTML()

		// Verify structure: <strong>bold</strong> x
		expect(innerHTML).toContain('<strong>bold</strong> x')

		// Verify 'x' is not inside <strong>
		const strong = await editor.locator('strong').textContent()
		expect(strong).toBe('bold')
	})

	test('caret should handle rapid typing after pattern conversion', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('**rapid**', { delay: 10 })

		// Immediately type more text without waiting
		await page.keyboard.type('quick', { delay: 10 })

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<strong>rapid</strong>quick')
	})

	test('caret should be preserved with mixed patterns and text', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('prefix **bold**')
		await page.waitForTimeout(100)
		await page.keyboard.type(' middle *italic*')
		await page.waitForTimeout(100)
		await page.keyboard.type(' suffix')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('prefix <strong>bold</strong>')
		expect(innerHTML).toContain('middle <em>italic</em>')
		expect(innerHTML).toContain('suffix')

		// Verify caret is at the end by typing
		await page.keyboard.type('!')
		const updated = await editor.innerHTML()
		expect(updated).toContain('suffix!')
	})

	test('caret should handle pattern at start of line', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('**start**')
		await page.waitForTimeout(100)
		await page.keyboard.type(' text')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<strong>start</strong> text')
	})

	test('caret should handle pattern at end of line', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('text **end**')
		await page.waitForTimeout(100)

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('text <strong>end</strong>')

		// Verify caret is after the pattern
		await page.keyboard.type('x')
		const updated = await editor.innerHTML()
		expect(updated).toContain('<strong>end</strong>x')
	})

	test('caret should handle strikethrough pattern', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('~~deleted~~')
		await page.waitForTimeout(100)

		await expect(editor.locator('del')).toContainText('deleted')

		// Type after - should be outside <del>
		await page.keyboard.type('y')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<del>deleted</del>y')
	})

	test('caret should handle code pattern', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('`code`')
		await page.waitForTimeout(100)

		await expect(editor.locator('code')).toContainText('code')

		// Type after - should be outside <code>
		await page.keyboard.type('x')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<code>code</code>x')
	})

	test('caret should be correct when adding markdown in the middle of a block', async ({
		page,
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await page.keyboard.type('test sentence')
		await page.waitForTimeout(100)

		// Move caret before "sentence"
		for (let i = 0; i < 8; i++) {
			await page.keyboard.press('ArrowLeft')
		}

		await page.keyboard.type('**mid** ')
		await page.waitForTimeout(100)

		// Check that the transformation happened
		await expect(editor.locator('strong')).toContainText('mid')
		let innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('test <strong>mid</strong> sentence')

		// Verify caret position
		await page.keyboard.type('x')
		innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('test <strong>mid</strong> xsentence')
	})

	test('caret should handle cursor BEFORE pattern start', async ({ page }) => {
		const editor = page.locator('[role=\"article\"][contenteditable=\"true\"]')

		await page.keyboard.type('hello')
		await page.waitForTimeout(100)

		// Move cursor to start
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowLeft')
		}

		// Cursor is at: |hello
		// Now type pattern at the end by moving right first
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowRight')
		}
		await page.keyboard.type(' **bold**')
		await page.waitForTimeout(100)

		// Move cursor back before "hello"
		for (let i = 0; i < 11; i++) {
			await page.keyboard.press('ArrowLeft')
		}

		// Type at beginning (before pattern)
		await page.keyboard.type('x')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('xhello <strong>bold</strong>')
	})

	test('caret should handle multiple patterns - cursor at end', async ({ page }) => {
		const editor = page.locator('[role=\"article\"][contenteditable=\"true\"]')

		await editor.pressSequentially('**first** **second**')
		await page.waitForTimeout(100)

		// Cursor is at the end after typing
		await page.keyboard.type('x')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<strong>first</strong> <strong>second</strong>x')
	})

	test('caret should handle pattern with punctuation before it', async ({ page }) => {
		const editor = page.locator('[role=\"article\"][contenteditable=\"true\"]')

		await page.keyboard.type('hello, **world**!')
		await page.waitForTimeout(100)

		// Cursor should be after the !
		await page.keyboard.type('x')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('hello, <strong>world</strong>!x')
	})

	test('caret should handle pattern at very start of block', async ({ page }) => {
		const editor = page.locator('[role=\"article\"][contenteditable=\"true\"]')

		await page.keyboard.type('**start**')
		await page.waitForTimeout(100)

		const innerHTML = await editor.innerHTML()
		await expect(editor.locator('strong')).toContainText('start')

		// Type right after
		await page.keyboard.type('x')
		const updated = await editor.innerHTML()
		expect(updated).toContain('<strong>start</strong>x')
	})

	test('caret should handle long text with pattern in middle', async ({ page }) => {
		const editor = page.locator('[role=\"article\"][contenteditable=\"true\"]')

		await page.keyboard.type('The quick brown fox jumps over the lazy dog')
		await page.waitForTimeout(100)

		// Move to before "lazy"
		for (let i = 0; i < 8; i++) {
			await page.keyboard.press('ArrowLeft')
		}

		await page.keyboard.type('**very** ')
		await page.waitForTimeout(100)

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('The quick brown fox jumps over the <strong>very</strong> lazy dog')
	})

	test('caret should handle typing after pattern with no trailing space', async ({ page }) => {
		const editor = page.locator('[role=\"article\"][contenteditable=\"true\"]')

		await page.keyboard.type('prefix **bold**suffix')
		await page.waitForTimeout(100)

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('prefix <strong>bold</strong>suffix')
	})

	test('caret should handle typing in middle then navigating away and back', async ({ page }) => {
		const editor = page.locator('[role=\"article\"][contenteditable=\"true\"]')

		await page.keyboard.type('start end')
		await page.waitForTimeout(100)

		// Move to middle
		for (let i = 0; i < 4; i++) {
			await page.keyboard.press('ArrowLeft')
		}

		await page.keyboard.type('**mid** ')
		await page.waitForTimeout(100)

		// Navigate away then back
		// Left twice goes inside the strong tag, right twice goes back out (but after the space)
		await page.keyboard.press('ArrowLeft')
		await page.keyboard.press('ArrowLeft')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')

		await page.keyboard.type('x')

		const innerHTML = await editor.innerHTML()
		// After navigation, cursor ends up inside strong tag with space before x
		expect(innerHTML).toContain('start<strong>mid</strong> x end')
	})

	test('caret should handle underscore bold pattern', async ({ page }) => {
		const editor = page.locator('[role=\"article\"][contenteditable=\"true\"]')

		await page.keyboard.type('__bold__')
		await page.waitForTimeout(100)

		await expect(editor.locator('strong')).toContainText('bold')

		await page.keyboard.type('x')
		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<strong>bold</strong>x')
	})

	test('caret should handle single underscore italic pattern', async ({ page }) => {
		const editor = page.locator('[role=\"article\"][contenteditable=\"true\"]')

		await page.keyboard.type('_italic_')
		await page.waitForTimeout(100)

		await expect(editor.locator('em')).toContainText('italic')

		await page.keyboard.type('x')
		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<em>italic</em>x')
	})
})
