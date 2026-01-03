import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test/text-block-editor'

test.describe('List Item Behavior - Enter Key Handling', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL)
		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
	})

	test.describe('Unordered List - Creating List Items', () => {
		test('should create a new list item when pressing Enter in a non-empty list item', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create first list item
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')
			await expect(editor.locator('li')).toHaveCount(1)

			// Press Enter to create second item
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second item')

			// Should have 2 list items
			const listItems = editor.locator('li')
			await expect(listItems).toHaveCount(2)
			await expect(listItems.nth(0)).toContainText('First item')
			await expect(listItems.nth(1)).toContainText('Second item')

			// Both should be in the same UL
			const lists = editor.locator('ul')
			await expect(lists).toHaveCount(1)
		})

		test('should create multiple list items in sequence', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list
			await page.keyboard.type('- Item 1')
			await page.keyboard.press(' ')

			// Create more items
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 2')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 3')

			const listItems = editor.locator('li')
			await expect(listItems).toHaveCount(3)
			await expect(listItems.nth(0)).toContainText('Item 1')
			await expect(listItems.nth(1)).toContainText('Item 2')
			await expect(listItems.nth(2)).toContainText('Item 3')
		})

		test('should split content when pressing Enter in the middle of a list item', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list item with text
			await page.keyboard.type('- First Second')
			await page.keyboard.press(' ')
			await expect(editor.locator('li')).toContainText('First Second')

			// Move cursor between "First" and "Second"
			await page.keyboard.press('ArrowLeft') // before 'd'
			await page.keyboard.press('ArrowLeft') // before 'n'
			await page.keyboard.press('ArrowLeft') // before 'o'
			await page.keyboard.press('ArrowLeft') // before 'c'
			await page.keyboard.press('ArrowLeft') // before 'e'
			await page.keyboard.press('ArrowLeft') // before 'S'
			await page.keyboard.press('ArrowLeft') // before space

			// Press Enter to split
			await page.keyboard.press('Enter')

			// Should have 2 list items
			const listItems = editor.locator('li')
			await expect(listItems).toHaveCount(2)
			await expect(listItems.nth(0)).toContainText('First')
			await expect(listItems.nth(1)).toContainText('Second')
		})
	})

	test.describe('Unordered List - Exiting Lists', () => {
		test('should exit the list when pressing Enter on an empty list item at the end', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create a list item
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')
			await expect(editor.locator('li')).toHaveCount(1)

			// Press Enter to create empty item
			await page.keyboard.press('Enter')

			// At this point we have an empty LI
			// Press Enter again to exit
			await page.keyboard.press('Enter')

			// Should have exited the list - only 1 LI should remain
			await expect(editor.locator('li')).toHaveCount(1)

			// Should have created a new paragraph
			const paragraphs = editor.locator('p')
			await expect(paragraphs).toHaveCount(1)

			// Cursor should be in the new paragraph, allowing typing
			await page.keyboard.type('After list')
			await expect(paragraphs.first()).toContainText('After list')
		})

		test('should break list in middle when pressing Enter on empty item between items', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create three list items
			await page.keyboard.type('- Item 1')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 2')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 3')

			// Now go back and clear Item 2 content
			await page.keyboard.press('ArrowUp')
			await page.keyboard.press('Home')
			await page.keyboard.press('Shift+End')
			await page.keyboard.press('Backspace')

			// Now we have an empty LI in the middle
			// Press Enter to break the list
			await page.keyboard.press('Enter')

			// Should have 2 separate lists
			const lists = editor.locator('ul')
			await expect(lists).toHaveCount(2)

			// First list should have Item 1
			await expect(lists.first().locator('li')).toHaveCount(1)
			await expect(lists.first().locator('li')).toContainText('Item 1')

			// Second list should have Item 3
			await expect(lists.last().locator('li')).toHaveCount(1)
			await expect(lists.last().locator('li')).toContainText('Item 3')

			// Should have a paragraph between them
			await expect(editor.locator('p')).toHaveCount(1)
		})

		test('should remove empty list container after exiting', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create a list with one item
			await page.keyboard.type('- Only item')
			await page.keyboard.press(' ')

			// Clear the content of the list item
			await page.keyboard.press('Control+a')
			await page.keyboard.press('Backspace')

			// Now press Enter on the empty list item
			await page.keyboard.press('Enter')

			// The list should be completely removed
			await expect(editor.locator('ul')).toHaveCount(0)
			await expect(editor.locator('li')).toHaveCount(0)

			// Should have a paragraph
			await expect(editor.locator('p')).toHaveCount(1)
		})

		test('should keep non-empty list items when exiting from the last empty item', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create multiple items
			await page.keyboard.type('- Item 1')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 2')
			await page.keyboard.press('Enter')

			// Now we have an empty third item
			// Press Enter to exit
			await page.keyboard.press('Enter')

			// Should still have 2 list items
			await expect(editor.locator('li')).toHaveCount(2)
			await expect(editor.locator('ul')).toHaveCount(1)

			// Should have created a paragraph after the list
			await expect(editor.locator('p')).toHaveCount(1)
		})
	})

	test.describe('Ordered List - Creating List Items', () => {
		test('should create a new ordered list item when pressing Enter', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create first ordered list item
			await page.keyboard.type('1. First item')
			await page.keyboard.press(' ')
			await expect(editor.locator('ol li')).toHaveCount(1)

			// Press Enter to create second item
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second item')

			// Should have 2 list items in an OL
			const listItems = editor.locator('ol li')
			await expect(listItems).toHaveCount(2)
			await expect(listItems.nth(0)).toContainText('First item')
			await expect(listItems.nth(1)).toContainText('Second item')
		})

		test('should exit ordered list on empty item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('1. First item')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.press('Enter')

			// Should have exited
			await expect(editor.locator('ol li')).toHaveCount(1)
			await expect(editor.locator('p')).toHaveCount(1)
		})
	})

	test.describe('List Items with Inline Formatting', () => {
		test('should preserve bold formatting when splitting list item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list item with bold text
			await page.keyboard.type('- **bold**')
			await page.keyboard.press(' ')

			// Verify bold was applied
			await expect(editor.locator('li strong')).toContainText('bold')

			// Add more text
			await page.keyboard.type('more')

			// Move cursor after "bold"
			await page.keyboard.press('ArrowLeft') // before 'e'
			await page.keyboard.press('ArrowLeft') // before 'r'
			await page.keyboard.press('ArrowLeft') // before 'o'
			await page.keyboard.press('ArrowLeft') // before 'm'

			// Press Enter to split
			await page.keyboard.press('Enter')

			// Should have 2 items
			await expect(editor.locator('li')).toHaveCount(2)

			// First item should still have bold
			await expect(editor.locator('li').first().locator('strong')).toContainText('bold')

			// Second item should have "more"
			await expect(editor.locator('li').nth(1)).toContainText('more')
		})

		test('should create list from text with inline formatting', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type formatted text first
			await page.keyboard.type('**bold** and *italic*')

			// Wait for formatting
			await page.waitForTimeout(200)

			// Move to start
			await page.keyboard.press('Home')

			// Add list pattern
			await page.keyboard.type('- ')

			// Should transform to list and preserve formatting
			await expect(editor.locator('li')).toHaveCount(1)
			await expect(editor.locator('li strong')).toContainText('bold')
			await expect(editor.locator('li em')).toContainText('italic')
		})
	})

	test.describe('Shift+Enter in Lists', () => {
		test('should create a line break with Shift+Enter instead of new list item', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list item
			await page.keyboard.type('- First line')
			await page.keyboard.press(' ')

			// Press Shift+Enter for line break
			await page.keyboard.press('Shift+Enter')
			await page.keyboard.type('Second line')

			// Should still have only 1 list item
			await expect(editor.locator('li')).toHaveCount(1)

			// The list item should contain both lines
			const listItem = editor.locator('li').first()
			const text = await listItem.textContent()
			expect(text).toContain('First line')
			expect(text).toContain('Second line')
		})
	})

	test.describe('Cursor Positioning', () => {
		test('should place cursor at the end of text when creating list from paragraph', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type text
			await page.keyboard.type('text')

			// Move to start and add list pattern
			await page.keyboard.press('Home')
			await page.keyboard.type('- ')

			// Cursor should be at the end of "text"
			// Type more to verify cursor position
			await page.keyboard.press('End')
			await page.keyboard.type('more')

			await expect(editor.locator('li')).toContainText('textmore')
		})

		test('should place cursor at start of new list item after Enter', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('- First')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')

			// Immediately type - should appear in new item
			await page.keyboard.type('Second')

			const items = editor.locator('li')
			await expect(items.nth(1)).toContainText('Second')
		})

		test('should place cursor in paragraph after exiting list', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('- Item')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.press('Enter')

			// Should be in paragraph, ready to type
			await page.keyboard.type('Paragraph text')

			const p = editor.locator('p')
			await expect(p).toContainText('Paragraph text')
		})
	})

	test.describe('Edge Cases', () => {
		test('should ALLOW nested lists when typing "- " in empty list item WITH siblings', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create a list item
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')

			// Now we're in an empty list item with a sibling
			// Type "- " which SHOULD create nested list
			await page.keyboard.type('- ')

			// Should have created a nested list
			const nestedLists = editor.locator('ul ul')
			await expect(nestedLists).toHaveCount(1)

			// Verify structure: outer UL has 2 LIs, second LI contains nested UL
			const outerList = editor.locator('ul').first()
			const outerItems = outerList.locator('> li')
			await expect(outerItems).toHaveCount(2)
			await expect(outerItems.first()).toContainText('First item')

			// Second outer LI should contain the nested UL
			const secondLI = outerItems.nth(1)
			const nestedUL = secondLI.locator('ul')
			await expect(nestedUL).toHaveCount(1)
		})

		test('should create nested list in middle of list when typing "- " with siblings above and below', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create three list items
			await page.keyboard.type('- Item 1')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 2')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 3')

			// Go back to middle item (Item 2)
			await page.keyboard.press('ArrowUp')
			await page.keyboard.press('Home')
			await page.keyboard.press('Shift+End')
			await page.keyboard.press('Delete')

			// Now middle LI is empty, type "- " to create nested list
			await page.keyboard.type('- ')

			// Should have created nested list in the middle
			const nestedLists = editor.locator('ul ul')
			await expect(nestedLists).toHaveCount(1)

			// Should still have 3 outer list items
			const outerItems = editor.locator('> ul > li')
			await expect(outerItems).toHaveCount(3)

			// First and third should have their text, second should have nested UL
			await expect(outerItems.first()).toContainText('Item 1')
			await expect(outerItems.nth(2)).toContainText('Item 3')
			await expect(outerItems.nth(1).locator('ul')).toHaveCount(1)
		})

		test('should NOT create nested lists when typing "- " in single empty list item WITHOUT siblings', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create a single list item
			await page.keyboard.type('- ')

			// Should have created a list
			await expect(editor.locator('ul li')).toHaveCount(1)

			// Now type "- " again in this single empty LI
			await page.keyboard.type('- ')

			// Should NOT have nested lists (ghost prevention)
			const nestedLists = editor.locator('ul ul')
			await expect(nestedLists).toHaveCount(0)

			// Should still have just 1 list item containing "- "
			const listItems = editor.locator('li')
			await expect(listItems).toHaveCount(1)
			await expect(listItems.first()).toContainText('- ')
		})

		test('should NOT create infinite nesting when typing inline "- " with text in list item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create a list with text
			await page.keyboard.type('- Item with text')
			await page.keyboard.press(' ')

			// Type "- " inline (non-empty LI) - should NOT transform
			await page.keyboard.type(' - more')

			// Should NOT have nested lists (inline transformation blocked)
			const nestedLists = editor.locator('ul ul')
			await expect(nestedLists).toHaveCount(0)

			// Should have 1 list item with the inline text
			const listItems = editor.locator('li')
			await expect(listItems).toHaveCount(1)
			await expect(listItems.first()).toContainText('Item with text - more')
		})

		test('should handle Enter at the start of a list item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('- content')
			await page.keyboard.press(' ')

			// Move cursor to start of content
			await page.keyboard.press('Home')

			// Press Enter
			await page.keyboard.press('Enter')

			// Should create new item before with empty content
			const items = editor.locator('li')
			await expect(items).toHaveCount(2)

			// Second item should have the content
			await expect(items.nth(1)).toContainText('content')
		})

		test('should create a separate list when typing "- " in a new block after a list', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// 1. Create a nested list
			await page.keyboard.type('- first item')
			await page.keyboard.press('Enter')
			await page.keyboard.type('- second item') // This is where we'll nest
			await page.keyboard.press('Enter')
			await page.keyboard.type('- ') // Create nested list
			await page.keyboard.type('nested')

			// We should have a nested list
			await expect(editor.locator('ul ul li')).toContainText('nested')

			// 2. Press Enter twice to exit the list
			await page.keyboard.press('Enter')
			await page.keyboard.press('Enter')

			// 3. Type "- " in the new block
			await page.keyboard.type('- ')

			// 4. Assert the buggy behavior
			const lists = editor.locator('ul')
			await expect(lists).toHaveCount(2)

			const lastList = lists.last()
			await expect(await lastList.innerHTML()).toBe('<li>-</li>')
		});

		test('should handle rapid Enter presses in list', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.keyboard.type('- Item')
			await page.keyboard.press(' ')

			// Press Enter multiple times quickly
			await page.keyboard.press('Enter')
			await page.keyboard.press('Enter')
			await page.keyboard.press('Enter')

			// Should have exited list and created paragraphs
			await expect(editor.locator('li')).toHaveCount(1)
			await expect(editor.locator('p').last()).toBeVisible()
		})

		test('should maintain list structure when typing markdown pattern in list item', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list
			await page.keyboard.type('- Item 1')
			await page.keyboard.press(' ')

			// Don't create new item, instead type a pattern in the existing item
			await page.keyboard.type(' with **bold**')

			// Should still be one list item with bold formatting
			await expect(editor.locator('li')).toHaveCount(1)
			await expect(editor.locator('li strong')).toContainText('bold')
		})
	})

	test.describe('Mixed Content', () => {
		test('should create list after existing paragraph', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create paragraph
			await page.keyboard.type('Regular paragraph')
			await page.keyboard.press('Enter')

			// Create list
			await page.keyboard.type('- List item')
			await page.keyboard.press(' ')

			// Should have both P and UL
			await expect(editor.locator('p')).toHaveCount(1)
			await expect(editor.locator('ul li')).toHaveCount(1)
		})

		test('should create paragraph after exiting list', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create and exit list
			await page.keyboard.type('- List item')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.press('Enter')

			// Type in paragraph
			await page.keyboard.type('Paragraph after list')

			// Should have list and paragraph
			await expect(editor.locator('li')).toHaveCount(1)
			const paragraphs = editor.locator('p')
			await expect(paragraphs).toHaveCount(1)
			await expect(paragraphs.first()).toContainText('Paragraph after list')
		})

		test('should create another list after paragraph following a list', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// First list
			await page.keyboard.type('- First list')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.press('Enter')

			// Paragraph
			await page.keyboard.type('Middle paragraph')
			await page.keyboard.press('Enter')

			// Second list
			await page.keyboard.type('- Second list')
			await page.keyboard.press(' ')

			// Should have 2 separate lists
			const lists = editor.locator('ul')
			await expect(lists).toHaveCount(2)
			await expect(editor.locator('p')).toHaveCount(1)
		})
	})

	test.describe('Backspace Key - Escaping Lists', () => {
		test('should convert empty list item to paragraph when pressing Backspace', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create a list item
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')
			await expect(editor.locator('li')).toHaveCount(1)

			// Press Enter to create empty item
			await page.keyboard.press('Enter')
			await expect(editor.locator('li')).toHaveCount(2)

			// Press Backspace in the empty item to escape
			await page.keyboard.press('Backspace')

			// Should have converted to paragraph
			await expect(editor.locator('li')).toHaveCount(1)
			await expect(editor.locator('p')).toHaveCount(1)

			// Cursor should be in the paragraph, allowing typing
			await page.keyboard.type('After list')
			await expect(editor.locator('p').first()).toContainText('After list')
		})

		test('should remove empty list container when backspacing the only item', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create a list with one item
			await page.keyboard.type('- Only item')
			await page.keyboard.press(' ')

			// Clear the content of the list item
			await page.keyboard.press('Control+a')
			await page.keyboard.press('Backspace')

			// Now press Backspace on the empty list item
			await page.keyboard.press('Backspace')

			// The list should be completely removed
			await expect(editor.locator('ul')).toHaveCount(0)
			await expect(editor.locator('li')).toHaveCount(0)

			// Should have a paragraph
			await expect(editor.locator('p')).toHaveCount(1)

			// Should be able to type in the paragraph
			await page.keyboard.type('New content')
			await expect(editor.locator('p').first()).toContainText('New content')
		})

		test('should keep non-empty list items when backspacing empty item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create multiple items
			await page.keyboard.type('- Item 1')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 2')
			await page.keyboard.press('Enter')

			// Now we have an empty third item
			// Press Backspace to escape
			await page.keyboard.press('Backspace')

			// Should still have 2 list items
			await expect(editor.locator('li')).toHaveCount(2)
			await expect(editor.locator('ul')).toHaveCount(1)

			// Should have created a paragraph after the list
			await expect(editor.locator('p')).toHaveCount(1)
		})

		test('should escape from ordered list with Backspace', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create ordered list item
			await page.keyboard.type('1. First item')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')

			// Press Backspace in empty item
			await page.keyboard.press('Backspace')

			// Should have exited and created paragraph
			await expect(editor.locator('ol li')).toHaveCount(1)
			await expect(editor.locator('p')).toHaveCount(1)
		})

		test('should place paragraph after list when backspacing', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list with items
			await page.keyboard.type('- Item 1')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 2')
			await page.keyboard.press('Enter')

			// Backspace in empty item
			await page.keyboard.press('Backspace')

			// Type in the paragraph
			await page.keyboard.type('After list')

			// Verify structure: paragraph comes after the list (same as Enter behavior)
			const allBlocks = await editor.evaluate((el) => {
				return Array.from(el.children).map((child) => child.tagName)
			})

			expect(allBlocks[0]).toBe('UL')
			expect(allBlocks[1]).toBe('P')
		})

		test('should not escape when backspacing in non-empty list item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create list item with text
			await page.keyboard.type('- Content')
			await page.keyboard.press(' ')

			// Press Backspace - should just delete text, not escape
			await page.keyboard.press('Backspace')

			// Should still be in list
			await expect(editor.locator('li')).toHaveCount(1)
			await expect(editor.locator('p')).toHaveCount(0)

			// Text should be modified
			await expect(editor.locator('li').first()).toContainText('Conten')
		})

		test('should convert to P instead of merging with previous LI when backspacing empty item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create two list items
			await page.keyboard.type('- Item 1')
			await page.keyboard.press(' ')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Item 2')

			// Delete all content from Item 2 by selecting within the LI
			// Move to start of "Item 2" and select to end
			await page.keyboard.press('Home')
			await page.keyboard.press('Shift+End')
			await page.keyboard.press('Backspace')

			// Now backspace in the empty LI - should convert to P, not merge with Item 1
			await page.keyboard.press('Backspace')

			// Should have 1 LI and 1 P
			await expect(editor.locator('li')).toHaveCount(1)
			await expect(editor.locator('li').first()).toContainText('Item 1')
			await expect(editor.locator('p')).toHaveCount(1)

			// Should NOT have merged - Item 1 should still be in a list
			await expect(editor.locator('ul')).toHaveCount(1)
		})
	})
})
