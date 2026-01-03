import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test/text-block-editor'

test.describe.serial('Rich Editor - Caret Position After Transformations', () => {
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
})
