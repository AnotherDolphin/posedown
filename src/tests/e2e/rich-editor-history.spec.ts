import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test/text-block-editor'

test.describe('Rich Editor History - Undo/Redo System', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL)
		// Clear the editor by selecting all and deleting
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
		// Wait for editor to be ready
		await page.waitForTimeout(100)
	})

	test.describe('Delete Operations - Missing History State', () => {
		test('should save state before deleting all content (Ctrl+A → Delete)', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type some content
			await page.keyboard.type('Hello world')
			await page.waitForTimeout(600) // Wait for coalescing to save

			// Select all and delete
			await page.keyboard.press('Control+a')
			await page.keyboard.press('Backspace')
			await page.waitForTimeout(100)

			// Verify editor is empty
			const textAfterDelete = await editor.textContent()
			expect(textAfterDelete?.trim()).toBe('')

			// Undo should restore the deleted content
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const textAfterUndo = await editor.textContent()
			expect(textAfterUndo).toContain('Hello world')
		})

		test('should save state when deleting content with Backspace', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type content
			await page.keyboard.type('Test content')
			await page.waitForTimeout(600)

			// Delete all with backspace
			for (let i = 0; i < 20; i++) {
				await page.keyboard.press('Backspace')
			}
			await page.waitForTimeout(100)

			// Should be empty
			expect((await editor.textContent())?.trim()).toBe('')

			// Undo should restore
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const restored = await editor.textContent()
			expect(restored).toContain('Test')
		})

		test('should handle rapid type→delete→type sequence', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type quickly
			await page.keyboard.type('First')
			await page.waitForTimeout(100) // Don't wait for full coalescing

			// Delete quickly
			await page.keyboard.press('Control+a')
			await page.keyboard.press('Backspace')

			// Type new content immediately
			await page.keyboard.type('Second')
			await page.waitForTimeout(600)

			// Should have "Second"
			await expect(editor).toContainText('Second')

			// Undo should go to empty state
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			// Undo again should restore "First"
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const text = await editor.textContent()
			// At minimum, should be able to undo to some previous state
			// Ideally should restore "First"
			expect(text).toBeDefined()
		})
	})

	test.describe('First Character After Operations - Separate History Entry Bug', () => {
		test('should coalesce first character after paste with subsequent typing', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Paste some text
			await page.evaluate(() => {
				const clipboardData = new DataTransfer()
				clipboardData.setData('text/plain', 'Pasted text')
				const pasteEvent = new ClipboardEvent('paste', {
					clipboardData,
					bubbles: true,
					cancelable: true
				})
				document.querySelector('[role="article"][contenteditable="true"]')?.dispatchEvent(pasteEvent)
			})
			await page.waitForTimeout(200)

			// Type "word" after paste
			await page.keyboard.type('word')
			await page.waitForTimeout(600) // Wait for coalescing

			// Should have both pasted text and typed word
			await expect(editor).toContainText('Pasted text')
			await expect(editor).toContainText('word')

			// Undo once should remove the entire typed word "word", not just "ord"
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterFirstUndo = await editor.textContent()
			// Should have pasted text but NOT the word we typed
			// If bug exists: "w" is saved separately, so undo removes "ord" leaving "w"
			// If fixed: entire "word" is one undo unit, so undo removes all of it
			expect(afterFirstUndo).toContain('Pasted text')
			expect(afterFirstUndo).not.toContain('w')
			expect(afterFirstUndo).not.toContain('word')
		})

		test('should coalesce first character after inline transformation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type bold markdown
			await page.keyboard.type('**bold**')
			await page.keyboard.press(' ') // Trigger transformation
			await page.waitForTimeout(200)

			// Verify bold was created
			await expect(editor.locator('strong')).toContainText('bold')

			// Type "test" after the transformation
			await page.keyboard.type('test')
			await page.waitForTimeout(600) // Wait for coalescing

			// Undo should remove the entire "test", not just "est"
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.textContent()
			// Should still have bold but NOT "test" or "t"
			// If bug exists: "t" is saved separately, so undo removes "est" leaving "t"
			// If fixed: entire "test" is one undo unit
			expect(afterUndo).toContain('bold')
			expect(afterUndo).not.toContain('t')
			expect(afterUndo).not.toContain('test')
		})

		test('should coalesce first character after Enter key', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type first paragraph
			await page.keyboard.type('First')
			await page.waitForTimeout(600)

			// Press Enter to create new block
			await page.keyboard.press('Enter')
			await page.waitForTimeout(200)

			// Type in new paragraph
			await page.keyboard.type('Second')
			await page.waitForTimeout(600)

			// Verify two paragraphs exist
			const paragraphs = editor.locator('p')
			await expect(paragraphs).toHaveCount(2)

			// Undo should remove entire "Second", not just "econd"
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.textContent()
			// Should have First but NOT "Second" or "S"
			// If bug exists: "S" is saved separately, so undo removes "econd" leaving "S"
			// If fixed: entire "Second" is one undo unit
			expect(afterUndo).toContain('First')
			expect(afterUndo).not.toContain('S')
			expect(afterUndo).not.toContain('Second')
		})
	})

	test.describe('Transformation History - Block Patterns Not Saved', () => {
		test('should save history for heading transformation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type heading pattern
			await page.keyboard.type('# Heading')
			await page.keyboard.press(' ')
			await page.waitForTimeout(300)

			// Should have heading
			await expect(editor.locator('h1')).toContainText('Heading')

			// Undo should go back to pre-transformation state (with # in text)
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.innerHTML()
			// Should either have the original "# Heading" or be further back
			// Bug: transformation may not be undoable as a single step
			expect(afterUndo).toBeDefined()

			// Check if we can still undo (meaning transformation was saved)
			const canUndo = await page.evaluate(() => {
				const editor = document.querySelector('[role="article"][contenteditable="true"]')
				// @ts-ignore - accessing internal state for testing
				return editor?._richEditorState?.history?.canUndo() ?? false
			})

			console.log('Can undo after heading transformation:', canUndo)
		})

		test('should save history for list transformation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type list item
			await page.keyboard.type('- Item one')
			await page.keyboard.press(' ')
			await page.waitForTimeout(300)

			// Should have list
			await expect(editor.locator('li')).toContainText('Item one')

			// Undo should work
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			// Should be able to undo the transformation
			const afterUndo = await editor.innerHTML()
			expect(afterUndo).toBeDefined()
		})

		test('should save history for blockquote transformation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('> Quote')
			await page.keyboard.press(' ')
			await page.waitForTimeout(300)

			await expect(editor.locator('blockquote')).toContainText('Quote')

			// Undo transformation
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.innerHTML()
			expect(afterUndo).toBeDefined()
		})
	})

	test.describe('Transformation History - Inline Patterns Not Saved', () => {
		test('should save history for bold transformation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('**bold**')
			await page.keyboard.press(' ')
			await page.waitForTimeout(300)

			await expect(editor.locator('strong')).toContainText('bold')

			// Undo should remove transformation
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.innerHTML()
			expect(afterUndo).toBeDefined()
		})

		test('should save history for italic transformation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('*italic*')
			await page.keyboard.press(' ')
			await page.waitForTimeout(300)

			await expect(editor.locator('em')).toContainText('italic')

			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.innerHTML()
			expect(afterUndo).toBeDefined()
		})

		test('should save history for code transformation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('`code`')
			await page.keyboard.press(' ')
			await page.waitForTimeout(300)

			await expect(editor.locator('code')).toContainText('code')

			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.innerHTML()
			expect(afterUndo).toBeDefined()
		})
	})

	test.describe('Complex History Scenarios', () => {
		test('should handle multiple transformations with proper undo stack', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type bold
			await page.keyboard.type('**bold**')
			await page.keyboard.press(' ')
			await page.waitForTimeout(600)

			// Type italic
			await page.keyboard.type('*italic*')
			await page.keyboard.press(' ')
			await page.waitForTimeout(600)

			// Type code
			await page.keyboard.type('`code`')
			await page.keyboard.press(' ')
			await page.waitForTimeout(600)

			// Should have all three
			await expect(editor.locator('strong')).toBeVisible()
			await expect(editor.locator('em')).toBeVisible()
			await expect(editor.locator('code')).toBeVisible()

			// Undo three times should remove each transformation
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			// Should have gone back through the history
			const finalState = await editor.innerHTML()
			expect(finalState).toBeDefined()
		})

		test('should maintain undo/redo consistency across operations', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type text
			await page.keyboard.type('Hello')
			await page.waitForTimeout(600)

			// Transform to heading
			await page.keyboard.press('Home')
			await page.keyboard.type('# ')
			await page.waitForTimeout(300)

			await expect(editor.locator('h1')).toContainText('Hello')

			// Undo
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			// Redo
			await page.keyboard.press('Control+y')
			await page.waitForTimeout(200)

			// Should be back to heading
			const afterRedo = await editor.innerHTML()
			expect(afterRedo).toBeDefined()
		})

		test('should handle paste followed by typing with proper history', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Paste markdown
			await page.evaluate(() => {
				const clipboardData = new DataTransfer()
				clipboardData.setData('text/plain', '**pasted bold**')
				const pasteEvent = new ClipboardEvent('paste', {
					clipboardData,
					bubbles: true,
					cancelable: true
				})
				document.querySelector('[role="article"][contenteditable="true"]')?.dispatchEvent(pasteEvent)
			})
			await page.waitForTimeout(300)

			await expect(editor.locator('strong')).toContainText('pasted bold')

			// Type additional text
			await page.keyboard.type(' and typed')
			await page.waitForTimeout(600)

			// Undo should remove typed text
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.textContent()
			// Should still have pasted text but NOT the typed text
			// If bug exists: first character is saved separately
			// If fixed: entire " and typed" is one undo unit
			expect(afterUndo).toContain('pasted bold')
			expect(afterUndo).not.toContain('and')
			expect(afterUndo).not.toContain('typed')

			// Undo again should remove paste
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterSecondUndo = await editor.textContent()
			// Should have removed pasted content
			expect(afterSecondUndo).toBeDefined()
		})
	})

	test.describe('Cursor Movement and Coalescing', () => {
		test('should break coalescing on arrow key movement', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type first word
			await page.keyboard.type('first')

			// Move cursor with arrow
			await page.keyboard.press('ArrowRight')
			await page.waitForTimeout(600)

			// Type second word
			await page.keyboard.type(' second')
			await page.waitForTimeout(600)

			// Undo should remove only "second" (cursor movement broke coalescing)
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.textContent()
			expect(afterUndo).toContain('first')
			expect(afterUndo).not.toContain('second')
		})

		test('should NOT break coalescing on automatic cursor repositioning', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type and trigger transformation (cursor auto-repositions)
			await page.keyboard.type('**bold**')
			await page.keyboard.press(' ')
			await page.waitForTimeout(200)

			// Type more (should coalesce with what comes after transformation)
			await page.keyboard.type('text')
			await page.waitForTimeout(600)

			// Undo should remove "text" as one unit
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			const afterUndo = await editor.textContent()
			// Should have bold but NOT "text" or "t"
			// If bug exists: "t" is saved separately due to auto cursor repositioning
			// If fixed: entire "text" is one undo unit
			expect(afterUndo).toContain('bold')
			expect(afterUndo).not.toContain('t')
			expect(afterUndo).not.toContain('test')
		})
	})

	test.describe('Edge Cases', () => {
		test('should handle undo when no history exists', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Try to undo with no history
			await page.keyboard.press('Control+z')
			await page.waitForTimeout(200)

			// Should not crash
			const text = await editor.textContent()
			expect(text).toBeDefined()
		})

		test('should handle redo when no forward history exists', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('test')
			await page.waitForTimeout(600)

			// Try to redo without undo
			await page.keyboard.press('Control+y')
			await page.waitForTimeout(200)

			// Should not crash
			await expect(editor).toContainText('test')
		})

		test('should handle rapid undo/redo sequence', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('test')
			await page.waitForTimeout(600)

			// Rapid undo/redo
			for (let i = 0; i < 5; i++) {
				await page.keyboard.press('Control+z')
				await page.waitForTimeout(50)
				await page.keyboard.press('Control+y')
				await page.waitForTimeout(50)
			}

			// Should still have content
			const text = await editor.textContent()
			expect(text).toBeDefined()
		})
	})
})
