import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Block Transformation (unwrapBlock)', () => {
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

	test.describe('Natural Block Conversion', () => {
		test('should convert H1 to H2 when editing focus mark span from # to ##', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1
			await editor.pressSequentially('# heading text')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()
			await expect(h1).toContainText('heading text')

			// 2. Click to show focus marks
			await h1.click()
			await page.waitForTimeout(50)

			const focusMark = editor.locator('.pd-focus-mark')
			await expect(focusMark).toBeVisible()
			await expect(focusMark).toContainText('# ')

			// 3. Navigate into the delimiter span and add another #
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // Move after #
			await page.keyboard.type('#') // Now it's "## "
			await page.waitForTimeout(100)

			// 4. Verify H1 transformed to H2
			await expect(h1).not.toBeVisible()
			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()
			await expect(h2).toContainText('heading text')
		})

		test('should convert H2 to H3 when editing focus mark from ## to ###', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H2
			await editor.pressSequentially('## heading')
			await page.waitForTimeout(100)

			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()

			// 2. Click and navigate into delimiter
			await h2.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // After first #
			await page.keyboard.press('ArrowRight') // After second #

			// 3. Add third #
			await page.keyboard.type('#')
			await page.waitForTimeout(100)

			// 4. Verify H2 → H3
			await expect(h2).not.toBeVisible()
			const h3 = editor.locator('h3')
			await expect(h3).toBeVisible()
			await expect(h3).toContainText('heading')
		})

		test('should convert H3 to H2 when deleting one # from delimiter', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H3
			await editor.pressSequentially('### my heading')
			await page.waitForTimeout(100)

			const h3 = editor.locator('h3')
			await expect(h3).toBeVisible()

			// 2. Navigate into delimiter and delete one #
			await h3.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // After first #
			await page.keyboard.press('ArrowRight') // After second #
			await page.keyboard.press('ArrowRight') // After third #
			await page.keyboard.press('Backspace') // Delete third #
			await page.waitForTimeout(100)

			// 3. Verify H3 → H2
			await expect(h3).not.toBeVisible()
			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()
			await expect(h2).toContainText('my heading')
		})
	})

	test.describe('Caret Position Preservation', () => {
		test('should preserve caret position after H1 to H2 upgrade', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1 with text
			await editor.pressSequentially('# heading text here')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()

			// 2. Navigate into focus mark and type # to upgrade to H2
			await h1.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // After #
			await page.keyboard.type('#')
			await page.waitForTimeout(100)

			// 3. Verify transformed to H2
			await expect(h1).not.toBeVisible()
			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()

			// 4. Check caret position directly - should NOT be at end of content
			const caretOffset = await page.evaluate(() => {
				const sel = window.getSelection()
				if (!sel || !sel.anchorNode) return -1
				const block = sel.anchorNode.parentElement?.closest('h2')
				if (!block) return -1
				const range = document.createRange()
				range.setStart(block, 0)
				range.setEnd(sel.anchorNode, sel.anchorOffset)
				return range.toString().length
			})

			const totalLength = await h2.evaluate(el => el.textContent?.length || 0)

			// Caret should be near the start (inside/after delimiter), not at end
			expect(caretOffset).toEqual(2) // at "##| ..."
		})

		test('should not jump caret to end when transforming H1 to H2', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1
			await editor.pressSequentially('# content')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()

			// 2. Navigate into delimiter and add #
			await h1.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.type('#')
			await page.waitForTimeout(100)

			// 3. Verify transformation
			await expect(h1).not.toBeVisible()
			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()

			// 4. Check caret position - should be near delimiter, not at end of "content"
			const caretOffset = await page.evaluate(() => {
				const sel = window.getSelection()
				if (!sel || !sel.anchorNode) return -1
				const block = sel.anchorNode.parentElement?.closest('h2')
				if (!block) return -1
				const range = document.createRange()
				range.setStart(block, 0)
				range.setEnd(sel.anchorNode, sel.anchorOffset)
				return range.toString().length
			})

			expect(caretOffset).toEqual(2) // at "##| ..."
		})

		test('should preserve caret position when downgrading H3 to H2', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H3
			await editor.pressSequentially('### some heading')
			await page.waitForTimeout(100)

			const h3 = editor.locator('h3')
			await expect(h3).toBeVisible()

			// 2. Navigate into delimiter and delete one #
			await h3.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight') // After third #
			await page.keyboard.press('Backspace') // Delete one #
			await page.waitForTimeout(100)

			// 3. Verify H3 → H2
			await expect(h3).not.toBeVisible()
			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()

			// 4. Check caret position - should be near delimiter, not at end
			const caretOffset = await page.evaluate(() => {
				const sel = window.getSelection()
				if (!sel || !sel.anchorNode) return -1
				const block = sel.anchorNode.parentElement?.closest('h2')
				if (!block) return -1
				const range = document.createRange()
				range.setStart(block, 0)
				range.setEnd(sel.anchorNode, sel.anchorOffset)
				return range.toString().length
			})

			// const totalLength = await h2.evaluate(el => el.textContent?.length || 0)
			// expect(caretOffset).toBeLessThan(totalLength)

			expect(caretOffset).toEqual(2) // at "##| ..."
		})
	})

	test.describe('Span Disconnected/Deleted', () => {
		test('should handle span deletion by selecting and deleting focus mark span', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1
			await editor.pressSequentially('# heading')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()

			// 2. Show focus marks
			await h1.click()
			await page.waitForTimeout(50)

			const focusMark = editor.locator('.pd-focus-mark')
			await expect(focusMark).toBeVisible()

			// 3. Select the entire focus mark span and delete it
			await page.keyboard.press('Home')
			await page.keyboard.press('Shift+ArrowRight') // Select #
			await page.keyboard.press('Shift+ArrowRight') // Select space
			await page.keyboard.press('Delete')
			await page.waitForTimeout(100)

			// 4. Should unwrap to paragraph since delimiter is gone
			await expect(h1).not.toBeVisible()
			const p = editor.locator('p')
			await expect(p).toBeVisible()
			await expect(p).toContainText('heading')
		})

		test('should handle disconnected span when focus mark removed programmatically', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H2
			await editor.pressSequentially('## test')
			await page.waitForTimeout(100)

			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()

			// 2. Show focus marks
			await h2.click()
			await page.waitForTimeout(50)

			// 3. Select and delete the span content
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // Into span
			await page.keyboard.press('Shift+End') // Select to end
			await page.keyboard.press('Backspace')
			await page.waitForTimeout(100)

			// 4. Verify unwrap happened (no valid delimiter left)
			// Should fall back to paragraph
			const p = editor.locator('p')
			await expect(p).toBeVisible()
		})
	})

	test.describe('Invalid Delimiter Handling (Fix Verified)', () => {
		test('should convert to paragraph when making heading delimiter invalid (e.g., "#x ")', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1
			await editor.pressSequentially('# heading')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()

			// 2. Show focus marks
			await h1.click()
			await page.waitForTimeout(50)

			const focusMark = editor.locator('.pd-focus-mark')
			await expect(focusMark).toBeVisible()

			// 3. Navigate into delimiter span and type 'x' (invalid)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // After #
			await page.keyboard.type('x') // Creates "#x " - invalid delimiter
			await page.waitForTimeout(100)

			// 4. Verify H1 is gone (unwrapped due to invalid delimiter)
			await expect(h1).not.toBeVisible()

			// 5. Should convert to paragraph with flattened span
			const p = editor.locator('p')
			await expect(p).toBeVisible()
			await expect(p).toContainText('#x heading')

			// 6. FIXED: Verify no orphaned focus mark spans in the paragraph
			const orphanedSpan = p.locator('.pd-focus-mark')
			await expect(orphanedSpan).toHaveCount(0)
		})

		test('should convert to paragraph when making blockquote delimiter invalid (">x ")', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create blockquote
			await editor.pressSequentially('> quote text')
			await page.waitForTimeout(100)

			const blockquote = editor.locator('blockquote')
			await expect(blockquote).toBeVisible()

			// 2. Show focus marks
			await blockquote.click()
			await page.waitForTimeout(50)

			const focusMark = editor.locator('.pd-focus-mark')
			await expect(focusMark).toBeVisible()
			await expect(focusMark).toContainText('> ')

			// 3. Navigate and type invalid character
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // After >
			await page.keyboard.type('x') // Creates ">x " - invalid
			await page.waitForTimeout(100)

			// 4. Verify blockquote unwrapped
			await expect(blockquote).not.toBeVisible()

			// 5. Should convert to paragraph
			const p = editor.locator('p')
			await expect(p).toBeVisible()
			await expect(p).toContainText('>x quote text')

			// 6. FIXED: Verify no orphaned focus mark spans
			const orphanedSpan = p.locator('.pd-focus-mark')
			await expect(orphanedSpan).toHaveCount(0)
		})

		test('should convert to paragraph when deleting trailing space from heading delimiter', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H2
			await editor.pressSequentially('## heading')
			await page.waitForTimeout(100)

			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()

			// 2. Show focus marks
			await h2.click()
			await page.waitForTimeout(50)

			// 3. Navigate to the space after ## and delete it
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // After first #
			await page.keyboard.press('ArrowRight') // After second #
			await page.keyboard.press('Delete') // Delete the space (makes "##heading")
			await page.waitForTimeout(100)

			// 4. Should unwrap to paragraph (## without space is invalid)
			await expect(h2).not.toBeVisible()
			const p = editor.locator('p')
			await expect(p).toBeVisible()
			await expect(p).toContainText('##heading')

			// 5. FIXED: Verify no orphaned focus mark spans
			const orphanedSpan = p.locator('.pd-focus-mark')
			await expect(orphanedSpan).toHaveCount(0)
		})

		test('should preserve content and caret position when converting invalid heading to paragraph', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1 with formatted content
			await editor.pressSequentially('# text **bold** more')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()
			const strong = h1.locator('strong')
			await expect(strong).toContainText('bold')

			// 2. Show focus marks and make delimiter invalid
			await h1.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // After #
			await page.keyboard.type('z') // Creates "#z " - invalid
			await page.waitForTimeout(100)

			// 3. Verify conversion to paragraph with preserved formatting
			await expect(h1).not.toBeVisible()
			const p = editor.locator('p')
			await expect(p).toBeVisible()
			await expect(p).toContainText('#z text')

			// Verify inline formatting is preserved
			const strongInP = p.locator('strong')
			await expect(strongInP).toContainText('bold')
			await expect(p).toContainText('more')

			// 4. FIXED: Verify no orphaned spans
			const orphanedSpan = p.locator('.pd-focus-mark')
			await expect(orphanedSpan).toHaveCount(0)
		})
	})

	test.describe('Fallback to Paragraph', () => {
		test('should convert to paragraph when fully deleting heading delimiter', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1
			await editor.pressSequentially('# content')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()

			// 2. Show focus marks and delete the delimiter
			await h1.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // After #
			await page.keyboard.press('Backspace') // Delete #
			await page.keyboard.press('Delete') // Delete space
			await page.waitForTimeout(100)

			// 3. Should unwrap to paragraph
			await expect(h1).not.toBeVisible()
			const p = editor.locator('p')
			await expect(p).toBeVisible()
			await expect(p).toContainText('content')
		})

		test('should convert blockquote to paragraph when deleting > delimiter', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create blockquote
			await editor.pressSequentially('> quote')
			await page.waitForTimeout(100)

			const blockquote = editor.locator('blockquote')
			await expect(blockquote).toBeVisible()

			// 2. Delete delimiter
			await blockquote.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight') // After >
			await page.keyboard.press('Backspace') // Delete >
			await page.keyboard.press('Delete') // Delete space
			await page.waitForTimeout(100)

			// 3. Should be paragraph
			await expect(blockquote).not.toBeVisible()
			const p = editor.locator('p')
			await expect(p).toBeVisible()
			await expect(p).toContainText('quote')
		})

		test('should preserve inline formatting when converting heading to paragraph', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1 with bold
			await editor.pressSequentially('# text **bold** more')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()
			const strong = h1.locator('strong')
			await expect(strong).toContainText('bold')

			// 2. Delete delimiter
			await h1.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('Backspace') // Delete #
			await page.keyboard.press('Delete') // Delete space
			await page.waitForTimeout(100)

			// 3. Verify paragraph with preserved formatting
			await expect(h1).not.toBeVisible()
			const p = editor.locator('p')
			await expect(p).toBeVisible()
			const strongInP = p.locator('strong')
			await expect(strongInP).toContainText('bold')
		})

		test('should handle empty block element conversion to paragraph', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create empty H2
			await editor.pressSequentially('## ')
			await page.waitForTimeout(100)

			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()

			// 2. Delete delimiter
			await h2.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('Backspace') // Delete second #
			await page.keyboard.press('Backspace') // Delete first #
			await page.keyboard.press('Delete') // Delete space
			await page.waitForTimeout(100)

			// 3. Should have paragraph (possibly empty or with BR)
			await expect(h2).not.toBeVisible()
			const p = editor.locator('p')
			await expect(p).toBeVisible()
		})
	})

	test.describe('Complex Transformations', () => {
		test('should handle rapid block level changes (H1 → H2 → H3)', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1
			await editor.pressSequentially('# text')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()

			// 2. Upgrade to H2
			await h1.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.type('#')
			await page.waitForTimeout(100)

			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()
			await expect(h1).not.toBeVisible()

			// 3. Upgrade to H3
			await h2.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.type('#')
			await page.waitForTimeout(100)

			const h3 = editor.locator('h3')
			await expect(h3).toBeVisible()
			await expect(h2).not.toBeVisible()
			await expect(h3).toContainText('text')
		})

		// passes in iso
		test('should handle block transformation with nested inline formatting', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create complex H1
			await editor.pressSequentially('# **bold** and *italic* and `code`')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()
			await expect(h1.locator('strong')).toContainText('bold')
			await expect(h1.locator('em')).toContainText('italic')
			await expect(h1.locator('code')).toContainText('code')

			// 2. Transform to H2
			await h1.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.type('#')
			await page.waitForTimeout(100)

			// 3. Verify all inline formatting preserved
			await expect(h1).not.toBeVisible()
			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()
			await expect(h2.locator('strong')).toContainText('bold')
			await expect(h2.locator('em')).toContainText('italic')
			await expect(h2.locator('code')).toContainText('code')
		})

		test('should handle blockquote with complex content transformation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create blockquote with formatting
			await editor.pressSequentially('> This is **important** quote')
			await page.waitForTimeout(100)

			const blockquote = editor.locator('blockquote')
			await expect(blockquote).toBeVisible()
			await expect(blockquote.locator('strong')).toContainText('important')

			// 2. Delete delimiter to convert to paragraph
			await blockquote.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Delete') // Delete space
			await page.waitForTimeout(100)

			// 3. Verify formatting preserved in paragraph
			await expect(blockquote).not.toBeVisible()
			const p = editor.locator('p')
			await expect(p).toBeVisible()
			await expect(p.locator('strong')).toContainText('important')
		})
	})

	test.describe('Edge Cases', () => {
		test('should handle transformation with very long content', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			const longText =
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'

			// 1. Create H1 with long content
			await editor.pressSequentially(`# ${longText}`)
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()
			await expect(h1).toContainText('Lorem ipsum')

			// 2. Transform to H2
			// Use evaluate to set caret to start of block — Home key only goes to
			// start of the visual line, which may be a wrapped line for long content.
			await h1.click()
			await page.waitForTimeout(50)
			await h1.evaluate(el => {
				const sel = window.getSelection()!
				const range = document.createRange()
				range.setStart(el, 0)
				range.collapse(true)
				sel.removeAllRanges()
				sel.addRange(range)
			})
			await page.keyboard.press('ArrowRight')
			await page.keyboard.type('#')
			await page.waitForTimeout(100)

			// 3. Verify transformation preserved all content
			await expect(h1).not.toBeVisible()
			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()

			const h2Text = await h2.evaluate(el => {
				const clone = el.cloneNode(true) as HTMLElement
				clone.querySelectorAll('.pd-focus-mark').forEach(mark => mark.remove())
				return clone.textContent || ''
			})

			expect(h2Text).toBe(longText)
		})

		test('should handle multiple whitespace characters in delimiter', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1
			await editor.pressSequentially('# text')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()

			// 2. Try to add extra spaces in delimiter (should be normalized)
			await h1.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight') // After "# "
			await page.keyboard.type('  ') // Extra spaces
			await page.waitForTimeout(100)

			// The behavior here depends on implementation
			// Just verify something reasonable happens (doesn't crash)
			const hasH1 = await h1.isVisible().catch(() => false)
			const hasP = await editor
				.locator('p')
				.isVisible()
				.catch(() => false)

			expect(hasH1 || hasP).toBe(true)
		})

		test('should handle special characters in content during transformation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')

			// 1. Create H1 with special chars
			await editor.pressSequentially('# Special: & < > " \' chars')
			await page.waitForTimeout(100)

			const h1 = editor.locator('h1')
			await expect(h1).toBeVisible()

			// 2. Transform to H2
			await h1.click()
			await page.waitForTimeout(50)
			await page.keyboard.press('Home')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.type('#')
			await page.waitForTimeout(100)

			// 3. Verify special chars preserved
			await expect(h1).not.toBeVisible()
			const h2 = editor.locator('h2')
			await expect(h2).toBeVisible()
			await expect(h2).toContainText('Special: & < >')
		})
	})
})
