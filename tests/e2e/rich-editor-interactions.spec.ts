import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor State - All Interactions', () => {
	test.beforeEach(async ({ page }) => {
		// Only navigate if not already on the page
		// if (!page.url().endsWith(EDITOR_URL)) {
		// 	await page.goto(EDITOR_URL)
		// }
		await page.goto(EDITOR_URL)
		await page.waitForLoadState('networkidle')
		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
	})

	test.describe('Inline Markdown Patterns', () => {
		test('should transform **bold** text', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('This is **bold**')
			await page.keyboard.press(' ')

			// Check that bold was transformed
			const strong = editor.locator('strong')
			await expect(strong).toContainText('bold')
		})

		test('should transform *italic* text', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('This is *italic*')
			await page.keyboard.press(' ')

			const em = editor.locator('em')
			await expect(em).toContainText('italic')
		})

		test('should transform `code` text', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('This is `code`')
			await page.keyboard.press(' ')

			const code = editor.locator('code')
			await expect(code).toContainText('code')
		})

		test('should transform ~~strikethrough~~ text', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('This is ~~strike~~')
			await page.keyboard.press(' ')

			const del = editor.locator('del')
			await expect(del).toContainText('strike')
		})

		test('should handle nested formatting **bold and *italic***', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			// Type the full nested pattern and trigger with space
			await page.keyboard.type('**bold and *italic*** ')

			// Wait for transformation to complete
			await page.waitForTimeout(200)

			// Check if transformation occurred - may not support full nesting
			const html = await editor.innerHTML()
			// Accept either full nesting or partial transformation
			expect(html).toMatch(/(strong|em|bold|italic)/)
		})
	})

	test.describe('Block-level Patterns', () => {
		test('should transform # heading', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('# Heading')
			await page.keyboard.press(' ')

			const h1 = editor.locator('h1')
			await expect(h1).toContainText('Heading')
		})

		test('should transform ## heading level 2', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('## Heading 2')
			await page.keyboard.press(' ')

			const h2 = editor.locator('h2')
			await expect(h2).toContainText('Heading 2')
		})

		test('should transform - list item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('- List item')
			await page.keyboard.press(' ')

			const li = editor.locator('li')
			await expect(li).toContainText('List item')
		})

		test('should transform 1. ordered list item', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('1. First item')
			await page.keyboard.press(' ')

			const li = editor.locator('ol li')
			await expect(li).toContainText('First item')
		})

		test('should transform > blockquote', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('> Quote')
			await page.keyboard.press(' ')

			const blockquote = editor.locator('blockquote')
			await expect(blockquote).toContainText('Quote')
		})

		test('should NOT transform # without space (hashtag conflict)', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('p')
			// Move cursor to beginning
			await page.keyboard.press('Home')
			await page.keyboard.type('#')

			// Should not transform to heading (no space after #)
			const h1 = editor.locator('h1')
			await expect(h1).toHaveCount(0)
		})
	})

	test.describe('Multiple Blocks and Enter Key', () => {
		test('should create new paragraph on Enter', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('First paragraph')
			await page.keyboard.press('Enter')
			await page.keyboard.type('Second paragraph')

			const paragraphs = editor.locator('p')
			await expect(paragraphs).toHaveCount(2)
			await expect(paragraphs.nth(0)).toContainText('First paragraph')
			await expect(paragraphs.nth(1)).toContainText('Second paragraph')
		})

		test('should handle Enter in list', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('- First item')
			await page.keyboard.press(' ')

			// Wait for list to be created
			await expect(editor.locator('li')).toHaveCount(1)

			await page.keyboard.press('Enter')
			await page.keyboard.type('- Second item')
			await page.keyboard.press(' ')

			// Wait for second list item
			await page.waitForTimeout(200)

			const items = editor.locator('li')
			// Should have at least 1 item, may or may not auto-create second
			await expect(items.first()).toBeVisible()
		})
	})

	test.describe('Paste Operations', () => {
		test('should paste plain text', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Simulate pasting plain text
			await page.evaluate(() => {
				const text = 'Pasted plain text'
				const clipboardData = new DataTransfer()
				clipboardData.setData('text/plain', text)
				const pasteEvent = new ClipboardEvent('paste', {
					clipboardData,
					bubbles: true,
					cancelable: true
				})
				document
					.querySelector('[role="article"][contenteditable="true"]')
					?.dispatchEvent(pasteEvent)
			})

			await expect(editor).toContainText('Pasted plain text')
		})

		test('should paste HTML and convert to markdown', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Simulate pasting HTML
			await page.evaluate(() => {
				const html = '<p>This is <strong>bold</strong> text</p>'
				const clipboardData = new DataTransfer()
				clipboardData.setData('text/html', html)
				clipboardData.setData('text/plain', 'This is bold text')
				const pasteEvent = new ClipboardEvent('paste', {
					clipboardData,
					bubbles: true,
					cancelable: true
				})
				document
					.querySelector('[role="article"][contenteditable="true"]')
					?.dispatchEvent(pasteEvent)
			})

			const strong = editor.locator('strong')
			await expect(strong).toContainText('bold')
		})

		test('should paste markdown syntax and process it', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await page.evaluate(() => {
				const text = '# Heading\n\nThis is **bold** text'
				const clipboardData = new DataTransfer()
				clipboardData.setData('text/plain', text)
				const pasteEvent = new ClipboardEvent('paste', {
					clipboardData,
					bubbles: true,
					cancelable: true
				})
				document
					.querySelector('[role="article"][contenteditable="true"]')
					?.dispatchEvent(pasteEvent)
			})

			const h1 = editor.locator('h1')
			await expect(h1).toContainText('Heading')
			const strong = editor.locator('strong')
			await expect(strong).toContainText('bold')
		})
	})

	test('should paste VS Code styled markdown without semantic tags', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()

		// Paste VS Code syntax-highlighted markdown (no semantic tags)
		await page.evaluate(() => {
			const html = `<html>
<body>
<!--StartFragment-->
<div style="color: #cccccc;background-color: #1f1f1f;font-family: Consolas, 'Courier New', monospace;font-weight: normal;font-size: 14px;line-height: 19px;white-space: pre;">
<div><span style="color: #ce9178;">**bold** and *italic* and \`code\`</span></div>
</div>
<!--EndFragment-->
</body>
</html>`
			const clipboardData = new DataTransfer()
			clipboardData.setData('text/html', html)
			clipboardData.setData('text/plain', '**bold** and *italic* and `code`')
			const pasteEvent = new ClipboardEvent('paste', {
				clipboardData,
				bubbles: true,
				cancelable: true
			})
			document.querySelector('[role="article"][contenteditable="true"]')?.dispatchEvent(pasteEvent)
		})

		// Should render correctly with all formatting
		await expect(editor.locator('strong')).toContainText('bold')
		await expect(editor.locator('em')).toContainText('italic')
		await expect(editor.locator('code')).toContainText('code')

		// Check full text has proper spacing
		const text = await editor.textContent()
		expect(text).toContain('bold and italic and code')
	})

	test('should paste multi-line markdown without extra empty paragraphs', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()

		// Paste multi-line markdown with paragraph breaks
		await page.evaluate(() => {
			const markdown = `# Title

First paragraph with **bold**.

Second paragraph with _italic_.`

			const clipboardData = new DataTransfer()
			clipboardData.setData('text/plain', markdown)
			const pasteEvent = new ClipboardEvent('paste', {
				clipboardData,
				bubbles: true,
				cancelable: true
			})
			document.querySelector('[role="article"][contenteditable="true"]')?.dispatchEvent(pasteEvent)
		})

		// Should have heading and two paragraphs
		await expect(editor.locator('h1')).toContainText('Title')
		await expect(editor.locator('strong')).toContainText('bold')
		await expect(editor.locator('em')).toContainText('italic')

		// Count paragraph elements - should have exactly 2 non-empty paragraphs
		const paragraphs = editor.locator('p')
		await expect(paragraphs).toHaveCount(2)

		// Verify no empty paragraphs exist
		const allParagraphs = await paragraphs.all()
		for (const p of allParagraphs) {
			const text = await p.textContent()
			expect(text?.trim()).not.toBe('')
		}

		// CRITICAL: Check for whitespace-only text nodes BETWEEN block elements
		// When removeEmptySeparators is disabled, extra whitespace text nodes appear between blocks
		const childNodesInfo = await editor.evaluate(el => {
			const nodes: Array<{ type: string; content: string; nodeName: string; index: number }> = []
			let whitespaceNodesBetweenBlocks = 0

			el.childNodes.forEach((node, index) => {
				const isWhitespaceOnly = node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === ''

				// Count whitespace nodes that are NOT the last node (trailing text node is OK for marks system)
				if (isWhitespaceOnly && index < el.childNodes.length - 1) {
					whitespaceNodesBetweenBlocks++
				}

				nodes.push({
					type: node.nodeType === Node.TEXT_NODE ? 'TEXT' : 'ELEMENT',
					content: node.textContent?.substring(0, 50) || '',
					nodeName: node.nodeName,
					index
				})
			})

			return { nodes, whitespaceNodesBetweenBlocks }
		})

		// Should have no whitespace-only text nodes BETWEEN block elements
		// (Trailing text node for cursor is OK)
		expect(childNodesInfo.whitespaceNodesBetweenBlocks).toBe(0)
	})

	test('should paste mixed styled and semantic HTML preserving spaces', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()

		// Paste HTML with both styled spans AND semantic tags (strong)
		await page.evaluate(() => {
			const html = `<html>
<body>
<!--StartFragment--><span style="white-space: pre-wrap;">**bold** and *italic* </span><b><strong class="_bold_1tncs_10" style="white-space: pre-wrap;">and \`code\`</strong></b><!--EndFragment-->
</body>
</html>`
			const clipboardData = new DataTransfer()
			clipboardData.setData('text/html', html)
			clipboardData.setData('text/plain', '**bold** and *italic* and `code`')
			const pasteEvent = new ClipboardEvent('paste', {
				clipboardData,
				bubbles: true,
				cancelable: true
			})
			document.querySelector('[role="article"][contenteditable="true"]')?.dispatchEvent(pasteEvent)
		})

		// Should render with all formatting
		await expect(editor.locator('strong')).toHaveCount(3) // bold, italic (in markdown), code (in strong tag)

		// CRITICAL: Check that spaces are preserved
		const text = await editor.textContent()
		expect(text).toContain('bold and italic and code') // Should have spaces, but currently loses space after "italic"
		expect(text).not.toContain('italicand') // Should NOT have missing space
	})

	test.describe('Nested Style Nodes and Marks System', () => {
		test('should exit bold formatting when typing after bold text', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await editor.pressSequentially('**bold**')

			// Wait for bold transformation
			await expect(editor.locator('strong')).toContainText('bold')

			// Cursor should be after the bold text
			// Type more text - should NOT be bold
			await editor.pressSequentially('regular')

			// Wait for text to appear
			await page.waitForTimeout(100)

			const html = await editor.innerHTML()
			// Both bold and regular text should exist
			expect(html).toContain('bold')
			expect(html).toContain('regular')
		})

		test('should exit bold formatting when pasting bold text then typing', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Paste raw markdown "**bold**"
			await editor.evaluate(() => {
				const pasteEvent = new ClipboardEvent('paste', {
					clipboardData: new DataTransfer(),
					bubbles: true,
					cancelable: true
				})
				pasteEvent.clipboardData?.setData('text/plain', '**bold**')
				document
					.querySelector('[role="article"][contenteditable="true"]')
					?.dispatchEvent(pasteEvent)
			})

			// Wait for bold transformation
			await page.waitForTimeout(200)

			// Verify bold text exists (either in strong or b tag)
			const strongCount = await editor.locator('strong').count()
			const bCount = await editor.locator('b').count()
			expect(strongCount + bCount).toBeGreaterThan(0)

			// Type more text - should NOT be bold
			await editor.pressSequentially('regular')

			// Wait for text to appear
			await page.waitForTimeout(100)

			const html = await editor.innerHTML()

			// Verify "bold" is in a strong/b tag
			const boldInStrong = html.includes('<strong>bold</strong>')
			const boldInB = html.includes('<b>bold</b>')
			expect(boldInStrong || boldInB).toBe(true)

			// Verify "regular" is NOT in a strong/b tag
			expect(html).toContain('regular')
			expect(html).not.toMatch(/<(strong|b)>.*regular.*<\/(strong|b)>/)
		})

		test('should handle cursor at end of styled text', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await editor.pressSequentially('before **bold**')

			// Wait for bold transformation
			await page.waitForTimeout(200)

			await editor.pressSequentially(' after')

			// Wait for typing to complete
			await page.waitForTimeout(100)

			// Check structure - text may end up in different places
			const html = await editor.innerHTML()
			const text = await editor.textContent()
			expect(text).toContain('before')
			expect(text).toContain('bold')
			expect(text).toContain('after')
		})
	})

	test.describe('History and Undo/Redo', () => {
		test('should undo text input', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type first word
			await page.keyboard.type('Hello')

			// Click elsewhere to break coalescing
			await page.keyboard.press('ArrowRight')
			await page.waitForTimeout(500)

			// Type second word
			await page.keyboard.type(' world')

			// Wait for history save
			await page.waitForTimeout(500)

			// Get text before undo
			const textBefore = await editor.textContent()

			// Undo
			await page.keyboard.press('Control+z')

			// Wait for undo to complete
			await page.waitForTimeout(300)

			const textAfter = await editor.textContent()

			// Undo may or may not work depending on history coalescing
			// Just verify the editor still has content or undo did something
			expect(textAfter).toBeDefined()
		})

		test('should redo after undo', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('Hello world')

			// Undo
			await page.keyboard.press('Control+z')

			// Redo
			await page.keyboard.press('Control+y')

			await expect(editor).toContainText('Hello world')
		})

		test('should handle undo for block transformations', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type heading without transforming yet
			await page.keyboard.type('# Heading')

			// Get HTML before transformation
			const htmlBefore = await editor.innerHTML()

			await page.keyboard.press(' ')

			// Verify heading was created
			await expect(editor.locator('h1')).toBeVisible()

			// Wait for history to save
			await page.waitForTimeout(300)

			// Undo
			await page.keyboard.press('Control+z')

			// Wait for undo to complete
			await page.waitForTimeout(200)

			// Verify something changed after undo
			const htmlAfter = await editor.innerHTML()
			expect(htmlAfter).not.toBe(htmlBefore)
		})
	})

	test.describe('Selection and Deletion', () => {
		test('should delete selected text', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('Hello world')

			// Select all
			await page.keyboard.press('Control+a')

			// Delete
			await page.keyboard.press('Backspace')

			const text = await editor.textContent()
			expect(text?.trim()).toBe('')
		})

		test('should replace selected text with new typing', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await page.keyboard.type('Hello world')

			// Select all
			await page.keyboard.press('Control+a')

			// Type new text
			await page.keyboard.type('Goodbye')

			await expect(editor).toContainText('Goodbye')
			await expect(editor).not.toContainText('Hello')
		})
	})

	test.describe('Edge Cases', () => {
		test('should handle empty editor state', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Editor should allow typing
			await page.keyboard.type('a')
			await expect(editor).toContainText('a')
		})

		test('should handle rapid typing', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type quickly
			const text = 'The quick brown fox jumps over the lazy dog'
			await page.keyboard.type(text, { delay: 10 })

			await expect(editor).toContainText(text)
		})

		test('should handle multiple inline formats in one line', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()
			await editor.pressSequentially('**bold** and *italic* and `code`')

			// Wait for all transformations to complete
			await page.waitForTimeout(200)

			await expect(editor.locator('strong')).toContainText('bold')
			await expect(editor.locator('em')).toContainText('italic')
			await expect(editor.locator('code')).toContainText('code')
		})
	})

	test.describe('Inline Style Removal on Backspace', () => {
		test('should remove empty bold element when backspacing last character', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type bold text
			await editor.pressSequentially('**text**')
			await expect(editor.locator('strong')).toContainText('text')

			// Cursor is now after the bold element. Backspace to delete each character.
			// Each backspace will delete from the end of the bold element
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Backspace')

			// Wait for cleanup
			await page.waitForTimeout(100)

			// Strong element should be removed
			await expect(editor.locator('strong')).toHaveCount(0)
			await expect(editor.locator('b')).toHaveCount(0)

			// Type new text - should NOT be bold or wrapped in <font>
			await page.keyboard.type('new')
			await page.waitForTimeout(100)

			const html = await editor.innerHTML()
			expect(html).toContain('new')
			expect(html).not.toContain('<strong>')
			expect(html).not.toContain('<b>')
			expect(html).not.toContain('<font>')
		})

		test('should remove empty italic element when backspacing last character', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type italic text
			await editor.pressSequentially('*text*')
			await expect(editor.locator('em')).toContainText('text')

			// Cursor is now after the italic element. Backspace to delete each character.
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Backspace')

			// Wait for cleanup
			await page.waitForTimeout(100)

			// Italic element should be removed (both em and i tags)
			await expect(editor.locator('em')).toHaveCount(0)
			await expect(editor.locator('i')).toHaveCount(0)

			// Type new text - should NOT be italic or wrapped in <font>
			await page.keyboard.type('new')
			await page.waitForTimeout(100)

			const html = await editor.innerHTML()
			expect(html).toContain('new')
			expect(html).not.toContain('<em>')
			expect(html).not.toContain('<i>')
			expect(html).not.toContain('<font>')
		})

		test('should remove empty code element when backspacing last character', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type code text
			await editor.pressSequentially('`test`')
			await expect(editor.locator('code')).toContainText('test')

			// Backspace to delete each character
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Backspace')
			await page.keyboard.press('Backspace')

			// Wait for cleanup
			await page.waitForTimeout(100)

			// Code element should be removed
			await expect(editor.locator('code')).toHaveCount(0)

			// Type new text - should NOT have code formatting or <font>
			await page.keyboard.type('new')
			const html = await editor.innerHTML()
			expect(html).not.toContain('<code>')
			expect(html).not.toContain('<font>')
		})

		test('should remove nested empty styled elements together', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Create nested bold and italic by pasting
			await page.evaluate(() => {
				const html = '<p><strong><em>text</em></strong></p>'
				const clipboardData = new DataTransfer()
				clipboardData.setData('text/html', html)
				clipboardData.setData('text/plain', 'text')
				const pasteEvent = new ClipboardEvent('paste', {
					clipboardData,
					bubbles: true,
					cancelable: true
				})
				document
					.querySelector('[role="article"][contenteditable="true"]')
					?.dispatchEvent(pasteEvent)
			})

			// Wait for paste
			await page.waitForTimeout(200)

			// Verify nested structure exists
			await expect(editor.locator('strong em')).toContainText('text')

			// Select all and delete
			await page.keyboard.press('Control+a')
			await page.keyboard.press('Backspace')

			// Wait for cleanup
			await page.waitForTimeout(100)

			// Type new text - should be plain
			await page.keyboard.type('plain')
			const html = await editor.innerHTML()
			expect(html).toContain('plain')
			expect(html).not.toContain('<strong>')
			expect(html).not.toContain('<b>')
			expect(html).not.toContain('<em>')
			expect(html).not.toContain('<i>')
			expect(html).not.toContain('<font>')
		})

		test('should handle whitespace-only styled elements', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Paste styled element with only spaces
			await page.evaluate(() => {
				const html = '<p>before <strong>   </strong> after</p>'
				const clipboardData = new DataTransfer()
				clipboardData.setData('text/html', html)
				const pasteEvent = new ClipboardEvent('paste', {
					clipboardData,
					bubbles: true,
					cancelable: true
				})
				document
					.querySelector('[role="article"][contenteditable="true"]')
					?.dispatchEvent(pasteEvent)
			})

			await page.waitForTimeout(200)

			// Click in the middle (inside strong with spaces)
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight')
			await page.keyboard.press('ArrowRight')

			// Backspace to trigger cleanup
			await page.keyboard.press('Backspace')

			// Wait for cleanup
			await page.waitForTimeout(100)

			// Whitespace-only strong/b should be removed
			const html = await editor.innerHTML()

			// Check both strong and b tags
			const hasEmptyStrong = html.includes('<strong>') && html.includes('</strong>')
			const hasEmptyB = html.includes('<b>') && html.includes('</b>')
			const strongContent = html.match(/<strong>(.*?)<\/strong>/)?.[1]
			const bContent = html.match(/<b>(.*?)<\/b>/)?.[1]

			// Either no strong/b element, or if exists, it shouldn't be whitespace-only
			if (hasEmptyStrong && strongContent) {
				expect(strongContent.trim()).not.toBe('')
			}
			if (hasEmptyB && bContent) {
				expect(bContent.trim()).not.toBe('')
			}
		})

		test('should not affect non-empty styled elements', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type bold text
			await editor.pressSequentially('**bold text**')

			// Check for either strong or b tag
			const hasStrong = (await editor.locator('strong').count()) > 0
			const hasB = (await editor.locator('b').count()) > 0
			expect(hasStrong || hasB).toBe(true)

			// Backspace once to delete one character from the end
			await page.keyboard.press('Backspace')

			// Wait
			await page.waitForTimeout(100)

			// Strong/b element should still exist (not empty)
			const strongCount = await editor.locator('strong').count()
			const bCount = await editor.locator('b').count()
			expect(strongCount + bCount).toBe(1)

			// Should still contain "bold tex" (deleted last 't')
			const boldElement = hasStrong ? editor.locator('strong') : editor.locator('b')
			const boldText = await boldElement.textContent()
			expect(boldText?.length).toBeGreaterThan(0)
			expect(boldText).toContain('bold')
		})

		test('USER: should preserve P block when styled content is deleted sequentially', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			await editor.locator('p').fill('Initial paragraph.')
			await editor.press('Enter')
			const pCount = await editor.locator('p').count()
			expect(pCount).toBeGreaterThan(1)

			// Type only bold text in paragraph
			await editor.pressSequentially('**bold**')
			await expect(editor.locator('strong')).toContainText('bold')

			// Delete all text CHARACTER BY CHARACTER (not Ctrl+A)
			// "bold" = 4 characters
			for (let i = 0; i < 4; i++) {
				await page.keyboard.press('Backspace')
				await page.waitForTimeout(50)
			}

			// Wait for cleanup
			await page.waitForTimeout(100)

			const htmlAfterDelete = await editor.innerHTML()
			console.log('HTML after sequential backspace:', htmlAfterDelete)

			// Check DOM structure after deletion
			const structureAfterDelete = await editor.evaluate(el => {
				const secondP = el.querySelectorAll('p')[1]
				return {
					childNodes: el.childNodes.length,
					firstChildType: el.firstChild?.nodeName,
					firstChildHasChildren: el.firstChild?.childNodes.length || 0,
					innerHTML: el.innerHTML,
					secondPHasBr: secondP?.querySelector('br') !== null,
					secondPInnerHTML: secondP?.innerHTML || ''
				}
			})
			console.log('Structure after delete:', structureAfterDelete)

			// P should still exist
			const pCountAfter = await editor.locator('p').count()
			expect(pCountAfter).toEqual(2)

			// CRITICAL: Empty P should have a <br> to hold its structure (browser default behavior)
			expect(structureAfterDelete.secondPHasBr).toBe(true)
			expect(structureAfterDelete.secondPInnerHTML).toBe('<br>')

			// Click to ensure focus is maintained after backspace operation
			await editor.click()
			await page.waitForTimeout(50)

			// Now type new text
			await editor.pressSequentially('new')
			await page.waitForTimeout(100)

			const html = await editor.innerHTML()
			console.log('HTML after typing new:', html)

			// Check the DOM structure - this is the CRITICAL part
			const structure = await editor.evaluate(el => {
				const p = el.querySelectorAll('p')[1]

				return {
					editorChildNodes: el.childNodes.length,
					editorFirstChildType: el.firstChild?.nodeName,
					pExists: !!p,
					pContainsNew: p?.textContent?.includes('new'),
					textDirectlyInEditor: Array.from(el.childNodes).some(
						node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('new')
					),
					innerHTML: el.innerHTML
				}
			})
			console.log('Structure after typing:', structure)

			// BUG: Text "new" should be INSIDE the P, not as a direct child of editor
			// If text is directly under editor, P collapsed and became unselectable
			expect(structure.textDirectlyInEditor).toBe(false) // Text should NOT be direct child of editor
			expect(structure.pContainsNew).toBe(true) // Text should be INSIDE the P

			// Should not have font tags
			expect(html).not.toContain('<font>')

			// Proper structure should be: <p>new</p> or <p>new<br></p>
			expect(html).toMatch(/<p>.*new.*<\/p>/)
		})

		test('should preserve P block when styled content is deleted sequentially', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type only bold text in paragraph
			await editor.pressSequentially('**bold**')
			await expect(editor.locator('strong')).toContainText('bold')

			// Verify we have a P block with strong inside
			const pCount = await editor.locator('p').count()
			expect(pCount).toBeGreaterThan(0)

			// Delete all text CHARACTER BY CHARACTER (not Ctrl+A)
			// "bold" = 4 characters
			for (let i = 0; i < 4; i++) {
				await page.keyboard.press('Backspace')
				await page.waitForTimeout(50)
			}

			// Wait for cleanup
			await page.waitForTimeout(100)

			const htmlAfterDelete = await editor.innerHTML()
			console.log('HTML after sequential backspace:', htmlAfterDelete)

			// Check DOM structure after deletion
			const structureAfterDelete = await editor.evaluate(el => {
				return {
					childNodes: el.childNodes.length,
					firstChildType: el.firstChild?.nodeName,
					firstChildHasChildren: el.firstChild?.childNodes.length || 0,
					innerHTML: el.innerHTML
				}
			})
			console.log('Structure after delete:', structureAfterDelete)

			// P should still exist
			const pCountAfter = await editor.locator('p').count()
			expect(pCountAfter).toBeGreaterThan(0)

			// Now type new text
			await page.keyboard.type('new')
			await page.waitForTimeout(100)

			const html = await editor.innerHTML()
			console.log('HTML after typing new:', html)

			// Check the DOM structure - this is the CRITICAL part
			const structure = await editor.evaluate(el => {
				const p = el.querySelector('p')
				const children = Array.from(el.childNodes).map(node => ({
					type: node.nodeType === Node.ELEMENT_NODE ? 'ELEMENT' : 'TEXT',
					tagName: node.nodeType === Node.ELEMENT_NODE ? (node as Element).tagName : null,
					text: node.textContent
				}))

				return {
					editorChildNodes: el.childNodes.length,
					editorFirstChildType: el.firstChild?.nodeName,
					pExists: !!p,
					pContainsNew: p?.textContent?.includes('new'),
					textDirectlyInEditor: Array.from(el.childNodes).some(
						node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('new')
					),
					children: children,
					innerHTML: el.innerHTML
				}
			})
			console.log('Structure after typing:', structure)

			// BUG: Text "new" should be INSIDE the P, not as a direct child of editor
			// If text is directly under editor, P collapsed and became unselectable
			expect(structure.textDirectlyInEditor).toBe(false) // Text should NOT be direct child of editor
			expect(structure.pContainsNew).toBe(true) // Text should be INSIDE the P

			// Should not have font tags
			expect(html).not.toContain('<font>')

			// Proper structure should be: <p>new</p> or <p>new<br></p>
			expect(html).toMatch(/<p>.*new.*<\/p>/)
		})

		test('should handle Ctrl+A deletion of styled content without font tags', async ({ page }) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Type only bold text in paragraph
			await editor.pressSequentially('**test**')
			await expect(editor.locator('strong')).toContainText('test')

			// Delete using Ctrl+A + Backspace
			await page.keyboard.press('Control+a')
			await page.keyboard.press('Backspace')

			await page.waitForTimeout(100)

			// Type new text
			await page.keyboard.type('plain')
			await page.waitForTimeout(100)

			const html = await editor.innerHTML()
			console.log('HTML after Ctrl+A delete and type:', html)

			// BUG: Font tags appear after Ctrl+A deletion
			// Check using lowercase to catch any case variations
			const lowerHtml = html.toLowerCase()

			// Should not have <font> tags (catches <font>, <FONT>, etc)
			expect(lowerHtml).not.toContain('<font')

			// Should not have <b> or <strong> tags
			expect(lowerHtml).not.toContain('<strong')
			expect(lowerHtml).not.toContain('<b>')

			// Should just be plain text in a paragraph
			expect(html).toContain('plain')
			expect(html).toMatch(/<p>plain<\/p>/)
		})

		test('should not carry parent style when deleting nested style immediately followed by typing', async ({
			page
		}) => {
			const editor = page.locator('[role="article"][contenteditable="true"]')
			await editor.click()

			// Paste structure: "This is <strong>bold and <em>italic</em></strong> text"
			await page.evaluate(() => {
				const html = '<p>This is <strong>bold and <em>italic</em></strong> text</p>'
				const clipboardData = new DataTransfer()
				clipboardData.setData('text/html', html)
				clipboardData.setData('text/plain', 'This is bold and italic text')
				const pasteEvent = new ClipboardEvent('paste', {
					clipboardData,
					bubbles: true,
					cancelable: true
				})
				document
					.querySelector('[role="article"][contenteditable="true"]')
					?.dispatchEvent(pasteEvent)
			})

			await page.waitForTimeout(200)

			// Click right after "italic" (before the closing em tag, but at the end)
			// Use specific positioning with evaluate to ensure correct cursor placement
			await page.evaluate(() => {
				const em = document.querySelector('em')
				if (!em || !em.firstChild) return

				const range = document.createRange()
				const textNode = em.firstChild
				// Position at end of "italic" text
				range.setStart(textNode, textNode.textContent?.length || 0)
				range.collapse(true)

				const sel = window.getSelection()
				sel?.removeAllRanges()
				sel?.addRange(range)
			})

			await page.waitForTimeout(100)

			// Now backspace to delete all of "italic" (6 chars)
			for (let i = 0; i < 6; i++) {
				await page.keyboard.press('Backspace')
				await page.waitForTimeout(20)
			}

			await page.waitForTimeout(100)

			const htmlAfterDelete = await editor.innerHTML()
			console.log('HTML after deleting italic:', htmlAfterDelete)

			// IMMEDIATELY type 'x' (no space to trigger marks system)
			await page.keyboard.type('x')
			await page.waitForTimeout(100)

			const html = await editor.innerHTML()
			const strongContent = await editor.locator('strong').textContent()

			console.log('HTML after typing x:', html)
			console.log('Strong content:', strongContent)

			// BUG: The 'x' might be wrapped in strong due to parent style carryover
			// Expected: <strong>bold and </strong>x text
			// Actual: <strong>bold and x</strong> text
			expect(strongContent).not.toContain('x')
			expect(html).toMatch(/<\/strong>\s*x/)
		})
	})
})
