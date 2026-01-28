import { htmlToMarkdown } from '../transforms/ast-utils'
import { isBlockTagName } from '../utils/block-marks'

/**
 * Extract markdown delimiters for inline formatted elements (bold, italic, code, etc.).
 *
 * Converts the element to markdown and compares with plain text content.
 * This approach PRESERVES original syntax:
 * - **bold** vs __bold__ (both become <strong>, but we detect which was used)
 * - *italic* vs _italic_ (both become <em>, but we detect which was used)
 *
 * @returns { start, end } for opening and closing delimiters, or null if extraction fails
 * @example extractInlineMarks(<strong>text</strong>) → { start: "**", end: "**" }
 */
export function extractInlineMarks(element: HTMLElement): { start: string; end: string } | null {
	try {
		const textContent = element.textContent || ''
		if (!textContent.trim()) return null

		// Create element with just text content
		const temp = document.createElement(element.tagName)
		temp.textContent = textContent

		// Convert to markdown
		const markdown = htmlToMarkdown(temp.outerHTML).trim()
		const trimmedText = textContent.trim()

		// Split markdown by text content to extract delimiters
		// Example: "**bold**".split("bold") → ["**", "**"]
		const parts = markdown.split(trimmedText)

		// Error handling: text not found in markdown (would give only 1 part)
		if (parts.length < 2) return null

		const start = parts[0]
		const end = parts[1] || ''

		// Inline elements must have both opening and closing delimiters
		if (!start || !end) return null

		return { start, end }
	} catch (error) {
		console.error('[FocusMarks] Failed to extract inline delimiters:', error)
		return null
	}
}

/**
 * Extract markdown prefix for block formatted elements (headings, blockquotes, lists).
 *
 * Converts the element to markdown and compares with plain text content.
 * Block elements only have opening prefixes, no closing delimiters.
 *
 * Special handling for LI: needs parent list context to determine delimiter.
 * Handles empty elements by using placeholder text to extract delimiter pattern.
 *
 * @returns { start } for opening prefix only, or null if extraction fails
 * @example extractBlockMarks(<h1>Title</h1>) → { start: "# " }
 * @example extractBlockMarks(<h1></h1>) → { start: "# " }
 * @example extractBlockMarks(<li>Item</li>) → { start: "- " } (if parent is UL)
 */
export function extractBlockMarks(element: HTMLElement): { start: string } | null {
	try {
		const textContent = element.textContent || ''
		const isEmpty = !textContent.trim()

		// Use placeholder text for empty elements to extract delimiter pattern
		const contentToUse = isEmpty ? 'x' : textContent

		let temp: HTMLElement

		// Special handling for LI: needs parent list context to determine delimiter
		if (element.tagName === 'LI') {
			const parentList = element.parentElement
			if (!parentList || (parentList.tagName !== 'UL' && parentList.tagName !== 'OL')) {
				return null
			}

			// Create parent list with single LI child
			// This preserves context: UL → "- " or OL → "1. "
			const listWrapper = document.createElement(parentList.tagName)
			const liTemp = document.createElement('LI')
			liTemp.textContent = contentToUse
			listWrapper.appendChild(liTemp)
			temp = listWrapper
		} else {
			// Regular handling for other block elements (headings, blockquote, etc.)
			temp = document.createElement(element.tagName)
			temp.textContent = contentToUse
		}

		// Convert to markdown
		const markdown = htmlToMarkdown(temp.outerHTML).trim()
		const trimmedText = contentToUse.trim()

		// Split markdown by text content to extract prefix
		// Example: "# Title".split("Title") → ["# ", ""]
		// Example: "# x".split("x") → ["# ", ""] (for empty elements)
		// Example: "- Item".split("Item") → ["- ", ""]
		const parts = markdown.split(trimmedText)

		// Error handling: text not found in markdown (would give only 1 part)
		if (parts.length < 2) return null

		const start = parts[0]

		// Block elements: return only prefix
		return { start }
	} catch (error) {
		console.error('[FocusMarks] Failed to extract block delimiters:', error)
		return null
	}
}
