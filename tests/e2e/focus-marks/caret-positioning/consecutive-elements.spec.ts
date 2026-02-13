import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Issue #77 - Consecutive formatted elements caret jump', () => {
	test.beforeEach(async ({ page }) => {
		page.on('console', msg => console.log('BROWSER:', msg.text()))
		await page.goto(EDITOR_URL)
		await page.waitForLoadState('networkidle')

		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(50)
	})

	test('typing *a* after first <em> in consecutive <em> elements should place caret after new element', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Set up DOM with consecutive italic elements using a double-space gap.
		//    The double space is required to place the caret at a non-edge position
		//    (offset 1 of "  "), which avoids the focus mark edge handler intercepting
		//    the first typed "*" as a delimiter upgrade rather than new text.
		await editor.evaluate((el) => {
			el.innerHTML = '<p><em>a</em>  <em>a</em> <em>a</em></p>'
		})
		await page.waitForTimeout(100)

		// 2. Click outside to ensure a clean state (no stale focus marks)
		await page.click('body', { position: { x: 10, y: 10 } })
		await page.waitForTimeout(100)

		// 3. Place caret at offset 1 of the "  " text node between first and second <em>.
		//    Offset 1 is the middle of a 2-character text node — not at start (0) or end (2),
		//    so atEdgeOfFormatted() returns null and no focus marks are injected.
		await editor.evaluate((el) => {
			const p = el.querySelector('p')!
			const sel = window.getSelection()!
			// childNodes: [em, "  ", em, " ", em]
			// childNodes[1] is the "  " text node between first and second <em>
			const textNode = p.childNodes[1] as Text
			const range = document.createRange()
			range.setStart(textNode, 1) // middle of "  "
			range.collapse(true)
			sel.removeAllRanges()
			sel.addRange(range)
		})
		await page.waitForTimeout(50)

		// 4. Type *a* to create a new italic element at the caret position
		await page.keyboard.type('*a*')
		await page.waitForTimeout(200)

		// 5. Log innerHTML after transformation for debugging
		const innerHTMLAfterTyping = await editor.evaluate((el) => el.innerHTML)
		console.log('innerHTML after typing *a*:', innerHTMLAfterTyping)

		// 6. Verify: transformation created 4 <em> elements total
		const emCount = await editor.locator('em').count()
		console.log('em count after typing:', emCount)
		expect(emCount).toBe(4)

		// 7. Type 'X' immediately to reveal where the caret landed
		await page.keyboard.type('X')
		await page.waitForTimeout(100)

		// 8. Get the final innerHTML
		const innerHTML = await editor.evaluate((el) => el.innerHTML)
		console.log('innerHTML after typing X:', innerHTML)

		// 9. Verify caret is correctly positioned AFTER the second <em> (the newly created one),
		//    NOT inside the third <em> (the one that was originally second).
		//
		//    CORRECT: X appears between </em> and <em> tags (outside any element)
		//    e.g.: <em>a</em> <em>a</em>X <em>a</em> <em>a</em>
		//
		//    BUG (#77): X lands inside the third <em> element instead
		//    e.g.: <em>a</em> <em>a</em> <em>aX</em> <em>a</em>
		expect(innerHTML).toMatch(/<\/em>\s*X\s*<em>/i)
	})
})
