import { test, expect, type Page } from '@playwright/test'

const EDITOR_URL = '/test/text-block-editor'

// Helper to clear editor content
async function clearEditor(page: Page) {
	const editor = page.locator('[role="article"][contenteditable="true"]')
	await editor.click()
	await page.keyboard.press('Control+a')
	await page.keyboard.press('Backspace')
}

test.describe('Rich Editor - Block Patterns', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL)
		await page.waitForLoadState('networkidle')
	})

	test.describe('Block Pattern Transformations', () => {
		test('heading transformation: "# " creates H1', async ({ page }) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.pressSequentially('# ')
			await page.waitForTimeout(200)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()

			// Verify text input works
			await editor.pressSequentially('Heading text')
			await expect(h1).toContainText('Heading text')
		})

		test('code block transformation: "```" creates PRE', async ({ page }) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			await editor.pressSequentially('```')
			await page.waitForTimeout(200)

			const pre = editor.locator('pre')
			await expect(pre).toBeVisible()

			// Verify text input works
			await editor.pressSequentially('const x = 1')
			await expect(pre).toContainText('const x = 1')
		})

		test('unordered list transformation: "- " creates UL', async ({ page }) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// Lists transform immediately (unlike blockquotes)
			await editor.pressSequentially('- ')
			await page.waitForTimeout(200)

			const ul = editor.locator('ul')
			await expect(ul).toBeVisible()

			// Verify text input works
			await editor.pressSequentially('List item')
			await page.waitForTimeout(200)
			await expect(ul).toContainText('List item')
		})

		test('blockquote transformation: "> " creates BLOCKQUOTE', async ({ page }) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// Blockquotes transform after typing text following the pattern
			await editor.pressSequentially('> Quote text')
			await page.waitForTimeout(200)

			const blockquote = editor.locator('blockquote')
			await expect(blockquote).toBeVisible()
			await expect(blockquote).toContainText('Quote text')
		})
	})

	test.describe('Empty Block Height (BR tag presence)', () => {
		test('empty heading has <br> to prevent collapse', async ({ page }) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// Create heading
			await editor.pressSequentially('# ')
			await page.waitForTimeout(200)

			const h1 = editor.locator('h1')

			// Check for BR tag immediately after transformation (the fix!)
			const hasBr = await h1.locator('br').count()
			expect(hasBr).toBeGreaterThan(0)

			// Verify it's still visible and can accept input
			await expect(h1).toBeVisible()
			await editor.pressSequentially('text')
			await expect(h1).toContainText('text')
		})

		test('empty code block has <br> to prevent collapse', async ({ page }) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// Create code block
			await editor.pressSequentially('```')
			await page.waitForTimeout(300)

			const code = editor.locator('pre code')
			const pre = editor.locator('pre')

			// Check for BR tag immediately after transformation (the main fix!)
			const hasBr = await code.locator('br').count()
			expect(hasBr).toBeGreaterThan(0)

			// Verify it's still visible
			await expect(pre).toBeVisible()
		})

		test('empty blockquote has <br> to prevent collapse', async ({ page }) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// Create blockquote (needs text to transform)
			await editor.pressSequentially('> ')
			await page.waitForTimeout(200)

			// Type one character to trigger transformation, then delete it to make it empty
			await editor.pressSequentially('x')
			await page.waitForTimeout(200)

			const blockquote = editor.locator('blockquote')
			await expect(blockquote).toBeVisible()

			// Delete the character to make blockquote empty
			await page.keyboard.press('Backspace')
			await page.waitForTimeout(200)

			// Check for BR tag in the now-empty blockquote
			const p = blockquote.locator('p')
			const hasBr = await p.locator('br').count()
			expect(hasBr).toBeGreaterThan(0)

			// Verify it can still accept input
			await editor.pressSequentially('quote')
			await expect(blockquote).toContainText('quote')
		})
	})

	test.describe('Empty Paragraph Enter Key Behavior', () => {
		test('pressing Enter in empty paragraphs should not create collapsed elements', async ({
			page
		}) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// Press Enter 5 times in empty paragraphs
			for (let i = 0; i < 5; i++) {
				await page.keyboard.press('Enter')
				await page.waitForTimeout(100)
			}

			// Get all paragraph elements
			const paragraphs = await editor.locator('p').all()

			// Check that all paragraphs have BR tags (no collapsed empty paragraphs)
			for (const p of paragraphs) {
				const innerHTML = await p.innerHTML()
				const hasBr = innerHTML.includes('<br>')
				const hasText = (await p.textContent())?.trim().length ?? 0 > 0

				// Each paragraph should either have a BR or have text content
				expect(hasBr || hasText).toBeTruthy()
			}

			// Verify no completely empty paragraphs exist (those would be collapsed)
			const emptyParagraphs = await editor.evaluate(() => {
				const ps = Array.from(document.querySelectorAll('[contenteditable] p'))
				return ps.filter((p) => p.innerHTML === '').length
			})

			expect(emptyParagraphs).toBe(0)
		})

		test('typing in empty paragraph after Enter should work correctly', async ({ page }) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// Press Enter to create new paragraph
			await page.keyboard.press('Enter')
			await page.waitForTimeout(100)

			// Type text
			await editor.pressSequentially('test')
			await page.waitForTimeout(100)

			// Check DOM structure
			const paragraphCount = await editor.locator('p').count()

			// Should have 2 paragraphs: one empty with BR, one with "test"
			expect(paragraphCount).toBe(2)

			// First paragraph should have BR
			const firstP = editor.locator('p').first()
			const firstHtml = await firstP.innerHTML()
			expect(firstHtml).toBe('<br>')

			// Second paragraph should have text
			const secondP = editor.locator('p').nth(1)
			await expect(secondP).toContainText('test')

			// Verify no collapsed empty paragraphs
			const emptyParagraphs = await editor.evaluate(() => {
				const ps = Array.from(document.querySelectorAll('[contenteditable] p'))
				return ps.filter((p) => p.innerHTML === '').length
			})

			expect(emptyParagraphs).toBe(0)
		})

		test('splitting paragraph with Enter should preserve both paragraphs', async ({ page }) => {
			await clearEditor(page)
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// Type text
			await editor.pressSequentially('hello world')
			await page.waitForTimeout(100)

			// Move cursor to middle (after "hello ")
			for (let i = 0; i < 5; i++) {
				await page.keyboard.press('ArrowLeft')
			}

			// Press Enter to split paragraph
			await page.keyboard.press('Enter')
			await page.waitForTimeout(100)

			// Check both paragraphs exist and have content or BR
			const paragraphCount = await editor.locator('p').count()
			expect(paragraphCount).toBe(2)

			const firstP = editor.locator('p').first()
			const secondP = editor.locator('p').nth(1)

			// First paragraph should have "hello " or just "hello" with BR
			const firstText = await firstP.textContent()
			expect(firstText?.trim()).toBeTruthy()

			// Second paragraph should have "world"
			const secondText = await secondP.textContent()
			expect(secondText?.trim()).toBe('world')

			// Verify no collapsed empty paragraphs
			const emptyParagraphs = await editor.evaluate(() => {
				const ps = Array.from(document.querySelectorAll('[contenteditable] p'))
				return ps.filter((p) => p.innerHTML === '').length
			})

			expect(emptyParagraphs).toBe(0)
		})
	})
})
