import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Inline Markdown Patterns', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL)
		await page.waitForLoadState('networkidle')

		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
	})

	test('should convert **bold** markdown to <strong> element', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**bold**')
		await page.waitForTimeout(100)

		// Check that <strong> element was created
		const strong = editor.locator('strong')
		await expect(strong).toContainText('bold')

		// Check that the markdown syntax was removed
		await expect(editor).not.toContainText('**')
	})

	test('should convert *italic* markdown to <em> element', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('*italic*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toContainText('italic')
		await expect(editor).not.toContainText('*italic*')
	})

	test('should convert `code` markdown to <code> element', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('`code`')
		await page.waitForTimeout(100)

		const code = editor.locator('code')
		await expect(code).toContainText('code')
	})

	test('should convert ~~strikethrough~~ markdown to <del> element', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('~~deleted~~')
		await page.waitForTimeout(100)

		const del = editor.locator('del')
		await expect(del).toContainText('deleted')
	})

	test('should prevent typing inside styled element after conversion', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**bold**')

		// Wait for conversion
		await expect(editor.locator('strong')).toContainText('bold')

		// Type a character - it should go OUTSIDE the <strong>
		await editor.pressSequentially('x')

		// Check that 'x' is not inside <strong>
		const strong = editor.locator('strong')
		await expect(strong).toContainText('bold') // should still be just 'bold'

		// Check that 'x' exists in the editor but outside <strong>
		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<strong>bold</strong>')
		expect(innerHTML).toMatch(/<strong>bold<\/strong>x/)
	})

	test('should handle space after styled element correctly', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**bold**')

		await expect(editor.locator('strong')).toContainText('bold')

		// Type space
		await editor.pressSequentially(' ')

		// Type another character
		await editor.pressSequentially('x')

		// Check structure: should be <strong>bold</strong> x
		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toContain('<strong>bold</strong>')
		// Space and x should be outside
		expect(innerHTML).toMatch(/<strong>bold<\/strong> x/)
	})

	test('should allow multiple characters after styled element', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**bold**')

		await expect(editor.locator('strong')).toContainText('bold')

		// Type multiple characters
		await editor.pressSequentially('abc')

		const strong = editor.locator('strong')
		await expect(strong).toContainText('bold')

		// Check that all characters are outside
		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<strong>bold<\/strong>abc/)
	})

	test('should handle mixed inline patterns', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**bold** ')
		await page.waitForTimeout(200)
		await editor.pressSequentially('*italic* ')
		await page.waitForTimeout(200)
		await editor.pressSequentially('`code`')
		await page.waitForTimeout(200)

		// Check all elements exist
		await expect(editor.locator('strong')).toContainText('bold')
		await expect(editor.locator('em')).toContainText('italic')
		await expect(editor.locator('code')).toContainText('code')
	})

	test('should prevent deletion of last <p> tag', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()

		// Type some text and delete it all
		await editor.pressSequentially('test')
		await page.keyboard.press('Backspace')
		await page.keyboard.press('Backspace')
		await page.keyboard.press('Backspace')
		await page.keyboard.press('Backspace')

		// Try to delete more (should not delete the <p> tag)
		await page.keyboard.press('Backspace')
		await page.keyboard.press('Backspace')

		// Check that a <p> still exists
		const p = editor.locator('p').first()
		await expect(p).toBeVisible()

		// Should be able to type still
		await editor.pressSequentially('still works')
		await expect(p).toContainText('still works')
	})

	test('should handle nested-looking patterns correctly', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**bold *italic* text**')

		// Should have nested structure
		const strong = editor.locator('strong')
		const em = strong.locator('em')

		await expect(em).toContainText('italic')
		await expect(strong).toContainText('bold')
		await expect(strong).toContainText('text')
	})

	test('should preserve whitespace with break-spaces CSS', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// Check that editor has white-space: break-spaces
		const whiteSpace = await editor.evaluate(el =>
			window.getComputedStyle(el).whiteSpace
		)
		expect(whiteSpace).toBe('break-spaces')
	})

	test('should handle rapid typing after pattern conversion', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**bold**', { delay: 10 })

		// Immediately type more text without waiting
		await editor.pressSequentially('quicktext', { delay: 10 })

		const strong = editor.locator('strong')
		await expect(strong).toContainText('bold')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<strong>bold<\/strong>quicktext/)
	})

	test('should allow continuing after space-only text node', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**bold**')
		await expect(editor.locator('strong')).toContainText('bold')

		// Type space
		await editor.pressSequentially(' ')
		// Type another space
		await editor.pressSequentially(' ')
		// Type character
		await editor.pressSequentially('x')

		const innerHTML = await editor.innerHTML()
		// Should have double space preserved (break-spaces)
		expect(innerHTML).toContain('<strong>bold</strong>  x')
	})

	test('should handle Delete key similar to Backspace for <p> protection', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('test')

		// Select all
		await page.keyboard.press('Control+A')

		// Delete
		await page.keyboard.press('Delete')

		// Try to delete more
		await page.keyboard.press('Delete')
		await page.keyboard.press('Delete')

		// <p> should still exist
		const p = editor.locator('p').first()
		await expect(p).toBeVisible()
	})

	test('should maintain cursor position after pattern conversion', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**bold**')

		await expect(editor.locator('strong')).toContainText('bold')

		// Type immediately - cursor should be right after </strong>
		await editor.pressSequentially('x')

		// Type more
		await editor.pressSequentially('y')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<strong>bold<\/strong>xy/)
	})

	test('should convert ***bold italic*** to nested <em><strong> elements', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('***bold italic***')
		await page.waitForTimeout(200)

		// Pattern priority: ** (longer) is processed first, then *
		// Result: <em><strong>bold italic</strong></em>
		const em = editor.locator('em')
		const strong = em.locator('strong')

		await expect(strong).toContainText('bold italic')
		await expect(em).toBeVisible()

		// Verify HTML structure
		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<em><strong>bold italic<\/strong><\/em>/)
	})

	test('should convert **_bold italic_** to <strong> wrapping <em>', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**_bold italic_**')
		await page.waitForTimeout(200)

		// Check that bold wraps italic
		const strong = editor.locator('strong')
		const em = strong.locator('em')

		await expect(em).toContainText('bold italic')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<strong><em>bold italic<\/em><\/strong>/)
	})

	test('should convert _**italic bold**_ to <em> wrapping <strong>', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('_**italic bold**_')
		await page.waitForTimeout(200)

		// Check that italic wraps bold
		const em = editor.locator('em')
		const strong = em.locator('strong')

		await expect(strong).toContainText('italic bold')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<em><strong>italic bold<\/strong><\/em>/)
	})

	test('should convert ~~**deleted bold**~~ to <del> wrapping <strong>', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('~~**deleted bold**~~')
		await page.waitForTimeout(200)

		// Check that strikethrough wraps bold
		const del = editor.locator('del')
		const strong = del.locator('strong')

		await expect(strong).toContainText('deleted bold')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<del><strong>deleted bold<\/strong><\/del>/)
	})

	test('should convert **~~bold deleted~~** to <strong> wrapping <del>', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('**~~bold deleted~~**')
		await page.waitForTimeout(200)

		// Check that bold wraps strikethrough
		const strong = editor.locator('strong')
		const del = strong.locator('del')

		await expect(del).toContainText('bold deleted')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<strong><del>bold deleted<\/del><\/strong>/)
	})

	test('should handle triple nesting: ***~~text~~***', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('***~~all styles~~***')
		await page.waitForTimeout(200)

		// Pattern priority: ~~ (longest), then **, then *
		// Result: <em><strong><del>all styles</del></strong></em>
		const em = editor.locator('em')
		const strong = em.locator('strong')
		const del = strong.locator('del')

		await expect(del).toContainText('all styles')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<em><strong><del>all styles<\/del><\/strong><\/em>/)
	})

	test('should prevent typing inside nested styled elements after conversion', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('***bold italic***')
		await page.waitForTimeout(200)

		// Pattern priority: ** then * → <em><strong>bold italic</strong></em>
		const strong = editor.locator('em strong')
		await expect(strong).toContainText('bold italic')

		// Type a character - it should go OUTSIDE the nested elements
		await editor.pressSequentially('x')
		await page.waitForTimeout(100)

		// Check that 'x' is not inside the styled elements
		await expect(strong).toContainText('bold italic')

		const innerHTML = await editor.innerHTML()
		expect(innerHTML).toMatch(/<em><strong>bold italic<\/strong><\/em>x/)
	})

	test('should handle complex nested pattern with text around it', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		await editor.click()
		await editor.pressSequentially('start **bold _italic_ bold** end')
		await page.waitForTimeout(300)

		// Check structure
		const strong = editor.locator('strong')
		const em = strong.locator('em')

		await expect(em).toContainText('italic')
		await expect(strong).toContainText('bold')
		await expect(editor).toContainText('start')
		await expect(editor).toContainText('end')
	})

	test.describe('Position-Dependent Nesting', () => {
		test('should handle nested pattern at start of line (single word)', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('***word***')
			await page.waitForTimeout(200)

			// Should create nested structure
			const em = editor.locator('em')
			const strong = em.locator('strong')

			await expect(strong).toContainText('word')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toMatch(/<em><strong>word<\/strong><\/em>/)
		})

		test('should handle nested pattern at end of line', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('text ***word***')
			await page.waitForTimeout(200)

			// Should create nested structure
			const em = editor.locator('em')
			const strong = em.locator('strong')

			await expect(strong).toContainText('word')
			await expect(editor).toContainText('text')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toContain('text')
			expect(innerHTML).toMatch(/<em><strong>word<\/strong><\/em>/)
		})

		test('should handle nested pattern in middle of line (single word)', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('before ***word***')
			await page.waitForTimeout(200)
			await editor.pressSequentially(' after')

			// Should create nested structure
			const em = editor.locator('em')
			const strong = em.locator('strong')

			await expect(strong).toContainText('word')
			await expect(editor).toContainText('before')
			await expect(editor).toContainText('after')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toContain('before')
			expect(innerHTML).toMatch(/<em><strong>word<\/strong><\/em>/)
			expect(innerHTML).toContain('after')
		})

		test('should handle nested pattern with phrase at start', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('***bold italic phrase***')
			await page.waitForTimeout(200)

			// Should create nested structure
			const em = editor.locator('em')
			const strong = em.locator('strong')

			await expect(strong).toContainText('bold italic phrase')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toMatch(/<em><strong>bold italic phrase<\/strong><\/em>/)
		})

		test('should handle nested pattern with phrase at end', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('start ***bold italic phrase***')
			await page.waitForTimeout(200)

			// Should create nested structure
			const em = editor.locator('em')
			const strong = em.locator('strong')

			await expect(strong).toContainText('bold italic phrase')
			await expect(editor).toContainText('start')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toContain('start')
			expect(innerHTML).toMatch(/<em><strong>bold italic phrase<\/strong><\/em>/)
		})

		test('should handle nested pattern with phrase in middle', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('before ***bold italic phrase***')
			await page.waitForTimeout(200)
			await editor.pressSequentially(' after')

			// Should create nested structure
			const em = editor.locator('em')
			const strong = em.locator('strong')

			await expect(strong).toContainText('bold italic phrase')
			await expect(editor).toContainText('before')
			await expect(editor).toContainText('after')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toContain('before')
			expect(innerHTML).toMatch(/<em><strong>bold italic phrase<\/strong><\/em>/)
			expect(innerHTML).toContain('after')
		})

		test('should handle different nesting combinations at start: **_text_**', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('**_bold italic_**')
			await page.waitForTimeout(200)

			// Should wrap bold around italic
			const strong = editor.locator('strong')
			const em = strong.locator('em')

			await expect(em).toContainText('bold italic')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toMatch(/<strong><em>bold italic<\/em><\/strong>/)
		})

		test('should handle different nesting combinations at end: _**text**_', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('start _**italic bold**_')
			await page.waitForTimeout(200)

			// Should wrap italic around bold
			const em = editor.locator('em')
			const strong = em.locator('strong')

			await expect(strong).toContainText('italic bold')
			await expect(editor).toContainText('start')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toContain('start')
			expect(innerHTML).toMatch(/<em><strong>italic bold<\/strong><\/em>/)
		})

		test('should handle single character nested pattern', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('***x***')
			await page.waitForTimeout(200)

			// Should create nested structure even for single char
			const em = editor.locator('em')
			const strong = em.locator('strong')

			await expect(strong).toContainText('x')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toMatch(/<em><strong>x<\/strong><\/em>/)
		})

		test('should handle nested pattern followed immediately by text', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.click()
			await editor.pressSequentially('***word***')
			await page.waitForTimeout(200)
			await editor.pressSequentially('text')

			// Should create nested structure and separate text
			const em = editor.locator('em')
			const strong = em.locator('strong')

			await expect(strong).toContainText('word')
			await expect(editor).toContainText('text')

			const innerHTML = await editor.innerHTML()
			expect(innerHTML).toMatch(/<em><strong>word<\/strong><\/em>text/)
		})
	})
})
