import { htmlToMarkdown } from '../transforms/ast-utils'
import { isBlockTagName } from '../utils/block-marks'
import { isInlineFormattedElement } from '../utils/dom'

/**
 * Class name for injected mark spans
 */
export const FOCUS_MARK_CLASS = 'pd-focus-mark'

/**
 * Class name for block focus mark spans (used in addition to FOCUS_MARK_CLASS)
 */
export const BLOCK_FOCUS_MARK_CLASS = 'pd-focus-mark-block'

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

/**
 * Create a mark span element with proper class and styling attributes.
 * Spans inherit contentEditable from parent, so users can modify delimiters to unwrap formatting.
 *
 * @param text - The delimiter text to display in the span
 * @param isBlock - Whether this is a block focus mark (adds BLOCK_FOCUS_MARK_CLASS in addition to FOCUS_MARK_CLASS)
 * @returns A span element with the focus mark class
 */
export function createMarkSpan(text: string, isBlock = false): HTMLSpanElement {
	const span = document.createElement('span')
	span.className = FOCUS_MARK_CLASS
	if (isBlock) span.classList.add(BLOCK_FOCUS_MARK_CLASS)
	span.textContent = text
	// Note: contentEditable inherited from parent editor div
	return span
}

/**
 * Check if cursor is at the edge of a text node adjacent to a formatted element.
 *
 * @param textNode - The text node to check
 * @param offset - The cursor offset within the text node
 * @returns The adjacent formatted element if found, null otherwise
 */
export function atEdgeOfFormatted(textNode: Text, offset: number): HTMLElement | null {
	// At start of text node - check previous sibling
	if (offset === 0 && textNode.previousSibling?.nodeType === Node.ELEMENT_NODE) {
		const el = textNode.previousSibling as HTMLElement
		if (isInlineFormattedElement(el.tagName)) return el
	}

	// At end of text node - check next sibling
	if (
		offset === textNode.textContent?.length &&
		textNode.nextSibling?.nodeType === Node.ELEMENT_NODE
	) {
		const el = textNode.nextSibling as HTMLElement
		if (isInlineFormattedElement(el.tagName)) return el
	}

	return null
}

/**
 * Get a clone of an element without focus mark spans.
 *
 * @param element - The element to clone
 * @returns A clone of the element with all focus mark spans removed, or null if element is null
 */
export function getSpanlessClone(element: HTMLElement): HTMLElement {
	const clone = element.cloneNode(true) as HTMLElement
	clone.querySelectorAll(`.${FOCUS_MARK_CLASS}`).forEach(span => span.remove())
	return clone
}

/**
 * Check if typing a character at the given edge would form a valid delimiter.
 *
 * @param currentDelimiter - The current delimiter being used (e.g., "*" or "**")
 * @param position - Whether the character is being typed before or after the delimiter
 * @param typedChar - The character being typed
 * @param supportedDelimiters - Set of valid delimiters
 * @returns true if the resulting delimiter would be valid, false otherwise
 */
export function wouldFormValidDelimiter(
	currentDelimiter: string,
	position: 'before' | 'after',
	typedChar: string,
	supportedDelimiters: Set<string | null>
): boolean {
	if (!currentDelimiter) return false

	const potentialDelimiter =
		position === 'after' ? currentDelimiter + typedChar : typedChar + currentDelimiter

	return supportedDelimiters.has(potentialDelimiter)
}

/**
 * Check if typing a character at the given position would form a valid block delimiter.
 * Handles both fixed delimiters (headings, blockquotes, lists) and dynamic ones (ordered lists).
 *
 * @param currentDelimiter - The current block delimiter being used (e.g., "# ", "> ")
 * @param position - Whether the character is being typed before or after the delimiter
 * @param typedChar - The character being typed
 * @param validateFn - Function to validate if a string is a supported block delimiter
 * @returns true if the resulting delimiter would be valid, false otherwise
 */
export function wouldFormValidBlockDelimiter(
	currentDelimiter: string,
	position: 'before' | 'after',
	typedChar: string,
	validateFn: (delimiter: string) => boolean
): boolean {
	if (!currentDelimiter) return false

	const potentialDelimiter =
		position === 'after' ? currentDelimiter + typedChar : typedChar + currentDelimiter

	return validateFn(potentialDelimiter)
}
