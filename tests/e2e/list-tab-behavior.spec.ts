import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe.configure({ mode: 'serial' })

test.describe('List Item Behavior - Tab/Shift+Tab Indentation', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to the editor (only happens once due to serial mode)
		if (!page.url().includes(EDITOR_URL)) {
			await page.goto(EDITOR_URL)
		}

		// Clear the editor content between tests
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
	})

	test.describe('Tab Indentation', () => {
		test('should do nothing when Tab is pressed on first list item (no previous sibling)', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create first list item
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')

			// Should have 1 list item at root level
			const listItems = editor.locator('li')
			await expect(listItems).toHaveCount(1)

			// Try to indent with Tab (should do nothing - no previous sibling)
			await page.keyboard.press('Tab')

			// Should still have 1 list item at root level (no nesting)
			await expect(listItems).toHaveCount(1)
			const lists = editor.locator('ul')
			await expect(lists).toHaveCount(1) // Only one UL, no nested lists
		})

		test('should create nested list when Tab is pressed on second item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with two items
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second item')

			// Should have 2 list items
			let listItems = editor.locator('li')
			await expect(listItems).toHaveCount(2)

			// Press Tab on second item to indent it
			await page.keyboard.press('Tab')

			// Should still have 2 list items total, but second is nested
			listItems = editor.locator('li')
			await expect(listItems).toHaveCount(2)

			// Should have 2 UL elements (root + nested)
			const lists = editor.locator('ul')
			await expect(lists).toHaveCount(2)

			// Verify nested structure: first item contains a nested ul
			const firstItem = listItems.nth(0)
			const nestedList = firstItem.locator('ul')
			await expect(nestedList).toHaveCount(1)
		})

		test('should create deeper nesting with multiple Tab presses', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with three items
			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Third')

			// Should have 3 list items
			await expect(editor.locator('li')).toHaveCount(3)

			// Tab on second item (indent under first)
			await page.keyboard.press('ArrowUp') // Move to second item
			await page.keyboard.press('Tab')

			// Tab on third item (moves one level deeper, becomes sibling of second)
			await page.keyboard.press('ArrowDown') // Move to third item
			await page.keyboard.press('Tab')

			// Should have 2 UL elements (root + 1 nested level with Second and Third as siblings)
			const lists = editor.locator('ul')
			await expect(lists).toHaveCount(2)
		})

		test('should append to existing nested list if previous sibling already has one', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with three items
			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Third')

			// Tab on second item (creates nested list under first)
			await page.keyboard.press('ArrowUp')
			await page.keyboard.press('Tab')

			// Tab on third item (should append to same nested list)
			await page.keyboard.press('ArrowDown')
			await page.keyboard.press('Tab')

			// Should have 2 UL elements (root + 1 nested with 2 items)
			const lists = editor.locator('ul')
			await expect(lists).toHaveCount(2)

			// The nested list should have 2 items
			const firstItem = editor.locator('li').nth(0)
			const nestedItems = firstItem.locator('ul li')
			await expect(nestedItems).toHaveCount(2)
		})
	})

	test.describe('Shift+Tab Unindentation', () => {
		test('should unindent nested item to parent level', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with nested item
			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second')
			await page.keyboard.press('Tab') // Nest second item

			// Should have 2 UL elements
			await expect(editor.locator('ul')).toHaveCount(2)

			// Press Shift+Tab to unindent
			await page.keyboard.press('Shift+Tab')

			// Should be back to 1 UL element (flat list)
			await expect(editor.locator('ul')).toHaveCount(1)

			// Should have 2 list items at same level
			const listItems = editor.locator('ul > li')
			await expect(listItems).toHaveCount(2)
		})

		test('should remove empty nested list after unindenting', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with single nested item
			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second')
			await page.keyboard.press('Tab')

			// Unindent the nested item
			await page.keyboard.press('Shift+Tab')

			// Nested list should be removed
			const firstItem = editor.locator('li').nth(0)
			const nestedList = firstItem.locator('ul')
			await expect(nestedList).toHaveCount(0)
		})

		test('should exit list when Shift+Tab pressed at root level', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with one item
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')

			// Should have a UL
			await expect(editor.locator('ul')).toHaveCount(1)

			// Press Shift+Tab at root level
			await page.keyboard.press('Shift+Tab')

			// List should be gone, converted to paragraph
			await expect(editor.locator('ul')).toHaveCount(0)
			await expect(editor.locator('p')).toHaveCount(1)
			await expect(editor.locator('p')).toContainText('First item')
		})

		test('should remove list container when last item exits via Shift+Tab', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with two items
			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second')

			// Move to first item and exit list
			await page.keyboard.press('ArrowUp')
			await page.keyboard.press('Shift+Tab')

			// Should have 1 paragraph and 1 list with 1 item
			await expect(editor.locator('p')).toHaveCount(1)
			await expect(editor.locator('ul')).toHaveCount(1)
			await expect(editor.locator('li')).toHaveCount(1)
		})
	})

	test.describe('History Integration - Undo/Redo', () => {
		test('should undo Tab indentation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with two items
			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second')

			// Indent second item
			await page.keyboard.press('Tab')
			await expect(editor.locator('ul')).toHaveCount(2) // Nested

			// Undo
			await page.keyboard.press('Control+z')

			// Should be back to flat list
			await expect(editor.locator('ul')).toHaveCount(1)
			await expect(editor.locator('ul > li')).toHaveCount(2)
		})

		test('should undo Shift+Tab unindentation', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create nested list
			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second')
			await page.keyboard.press('Tab')

			// Unindent
			await page.keyboard.press('Shift+Tab')
			await expect(editor.locator('ul')).toHaveCount(1) // Flat

			// Undo
			await page.keyboard.press('Control+z')

			// Should be nested again
			await expect(editor.locator('ul')).toHaveCount(2)
		})

		test('should undo Shift+Tab list exit', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')

			// Exit list
			await page.keyboard.press('Shift+Tab')
			await expect(editor.locator('ul')).toHaveCount(0)
			await expect(editor.locator('p')).toHaveCount(1)

			// Undo
			await page.keyboard.press('Control+z')

			// Should be back to list
			await expect(editor.locator('ul')).toHaveCount(1)
			await expect(editor.locator('li')).toHaveCount(1)
		})

		test('should redo Tab indentation after undo', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create and indent
			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second')
			await page.keyboard.press('Tab')

			// Undo
			await page.keyboard.press('Control+z')
			await expect(editor.locator('ul')).toHaveCount(1)

			// Redo
			await page.keyboard.press('Control+y')
			await expect(editor.locator('ul')).toHaveCount(2) // Nested again
		})
	})

	test.describe('Pattern Blocking - Verify "- " Still Blocked', () => {
		test('should NOT create nested list when typing "- " inside list item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')

			// Type " - nested" (pattern that would create nested list if not blocked)
			await page.keyboard.type(' - nested')

			// Should still have only 1 UL (no nesting from pattern)
			await expect(editor.locator('ul')).toHaveCount(1)

			// Text should be literal "- nested"
			await expect(editor.locator('li')).toContainText('First item - nested')
		})

		test('should create proper list structure when typing just "- "', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type just the pattern "- "
			await page.keyboard.type('- ')

			// Should create UL element
			await expect(editor.locator('ul')).toHaveCount(1)

			// Should create LI wrapper (bug fix: was missing before)
			await expect(editor.locator('li')).toHaveCount(1)

			// Verify structure via innerHTML
			const innerHTML = await editor.evaluate(el => el.innerHTML)

			// Should have proper structure: <ul><li>...</li></ul>
			// Not malformed: <ul>- </ul> (without LI wrapper)
			expect(innerHTML).toContain('<ul>')
			expect(innerHTML).toContain('<li>')
			expect(innerHTML).toContain('</li>')
			expect(innerHTML).toContain('</ul>')
		})
	})

	test.describe('Edge Cases', () => {
		test('should preserve content when indenting item with formatting', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with bold text
			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item **two** bold')

			// Wait for bold to be applied
			await expect(editor.locator('strong')).toContainText('two')

			// Indent the item
			await page.keyboard.press('Tab')

			// Bold formatting should be preserved
			await expect(editor.locator('strong')).toContainText('two')
		})

		test('should work with ordered lists (ol)', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create ordered list
			await page.keyboard.type('1. First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second')

			// Indent
			await page.keyboard.press('Tab')

			// Should have nested OL
			const firstItem = editor.locator('ol > li').nth(0)
			const nestedList = firstItem.locator('ol')
			await expect(nestedList).toHaveCount(1)
		})

		test('should handle multiple levels of nesting and unindenting', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create nested structure
			// After Tab on Level 2: Level 2 is nested under Level 1
			// After Enter: New item created at same level as Level 2
			// After Tab on Level 3: Level 3 moves one level deeper (becomes sibling of Level 2)
			await page.keyboard.type('- Level 1')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Level 2')
			await page.keyboard.press('Tab')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Level 3')
			await page.keyboard.press('Tab')

			// Should have 3 UL elements (root + 2 nested levels)
			// Enter after Tab creates new item at same level, then Tab indents under previous sibling
			await expect(editor.locator('ul')).toHaveCount(3)

			// Unindent once brings Level 3 back to root level (still 2 ULs: root + nested under Level 1)
			await page.keyboard.press('Shift+Tab')
			await expect(editor.locator('ul')).toHaveCount(2)

			// Unindent again exits Level 3 from list to paragraph (still 2 ULs: root + nested under Level 1)
			await page.keyboard.press('Shift+Tab')
			await expect(editor.locator('ul')).toHaveCount(2)
		})
	})
})
