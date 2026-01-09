import { htmlToMarkdown } from '../transforms/ast-utils'
import { getMainParentBlock, INLINE_FORMATTED_TAGS, BLOCK_FORMATTED_TAGS } from './dom'
import { isBlockTagName } from './block-marks'

/**
 * Class name for injected mark spans
 */
export const FOCUS_MARK_CLASS = 'pd-focus-mark'

/**
 * Manages focus marks - dynamic delimiter injection for markdown formatting.
 *
 * When cursor enters a formatted element, injects <span> elements showing the
 * markdown delimiters. Removes them when cursor leaves.
 *
 * Core principle: Clean DOM 99% of the time. Max 4 spans at any moment
 * (1 inline opening + 1 inline closing + 1 block opening + 1 block closing).
 */
export class FocusMarkManager {
	private activeInline: HTMLElement | null = null
	private activeBlock: HTMLElement | null = null
	private spanListeners = new Map<HTMLSpanElement, (e: Event) => void>()

	/**
	 * Main update method - call this on selection change.
	 * Detects focused elements, ejects old marks, injects new marks.
	 */
	update(selection: Selection, root: HTMLElement): void {
		if (!selection.anchorNode) return

		// 1. Find which inline/block elements contain the cursor
		const focusedInline = this.findFocusedInline(selection, root)
		const focusedBlock = this.findFocusedBlock(selection, root)

		// 2. Handle inline transition (if focused element changed)
		if (this.activeInline !== focusedInline) {
			// Eject marks from old element
			if (this.activeInline) {
				this.ejectMarks(this.activeInline)
			}

			// Inject marks into new element
			if (focusedInline) {
				this.injectInlineMarks(focusedInline)
			}

			this.activeInline = focusedInline
		}

		// 3. Handle block transition (if focused element changed)
		if (this.activeBlock !== focusedBlock) {
			// Eject marks from old element
			if (this.activeBlock) {
				this.ejectMarks(this.activeBlock)
			}

			// Inject marks into new element
			if (focusedBlock) {
				this.injectBlockMarks(focusedBlock)
			}

			this.activeBlock = focusedBlock
		}
	}

	/**
	 * Find the closest inline formatted parent element containing the cursor.
	 * Only considers INLINE_FORMATTED_TAGS (strong, em, code, s, del).
	 */
	private findFocusedInline(selection: Selection, root: HTMLElement): HTMLElement | null {
		let node: Node | null = selection.anchorNode

		// Walk up the tree looking for inline formatted elements
		// #1: can use getStyledAncestor instead?
		// ##1: do both need to exist (semantically different)?
		// Answer: YES - INLINE_FORMATTED_TAGS is now centralized in dom.ts and used by both
		// FocusMarks (this file) and exit-styled-element (richEditorState.svelte.ts)
		// Could use getStyledAncestor, but keeping this for clarity and avoiding circular dependency
		while (node && node !== root) {
			if (node instanceof HTMLElement && INLINE_FORMATTED_TAGS.includes(node.tagName as any)) {
				return node
			}
			node = node.parentNode
		}

		return null
	}

	/**
	 * Find the closest block formatted parent element containing the cursor.
	 * Only considers BLOCK_FORMATTED_TAGS (h1-h6, blockquote, li).
	 */
	private findFocusedBlock(selection: Selection, root: HTMLElement): HTMLElement | null {
		const block = getMainParentBlock(selection.anchorNode!, root)
		if (!block) return null

		// Check if this block is a formatted block that should show marks
		if (BLOCK_FORMATTED_TAGS.includes(block.tagName as any)) {
			return block
		}

		return null
	}

	/**
	 * Inject marks for inline formatted elements (bold, italic, code, etc.).
	 * Creates two spans: opening and closing delimiters.
	 *
	 * Example: <strong>text</strong> → <strong><span>**</span>text<span>**</span></strong>
	 */
	private injectInlineMarks(element: HTMLElement): void {
		// Skip if already marked
		if (element.querySelector(`.${FOCUS_MARK_CLASS}`)) return

		// Extract delimiters by reverse-engineering from markdown
		const delimiters = this.extractDelimiters(element)
		if (!delimiters || !delimiters.end) return

		// Create mark spans
		const startSpan = this.createMarkSpan(delimiters.start)
		const endSpan = this.createMarkSpan(delimiters.end)

		// Inject at element boundaries
		element.prepend(startSpan)
		element.append(endSpan)
	}

	/**
	 * Inject marks for block formatted elements (headings, blockquotes, lists).
	 * Creates one span: opening prefix only (blocks don't have closing delimiters).
	 *
	 * Example: <h1>text</h1> → <h1><span># </span>text</h1>
	 */
	private injectBlockMarks(element: HTMLElement): void {
		// Skip if already marked
		if (element.querySelector(`.${FOCUS_MARK_CLASS}`)) return

		// Extract delimiter prefix
		const delimiters = this.extractDelimiters(element)
		if (!delimiters) return

		// Create prefix span
		const prefixSpan = this.createMarkSpan(delimiters.start)

		// Inject at start of block
		element.prepend(prefixSpan)
	}

	/**
	 * Remove all focus mark spans from an element and normalize text nodes.
	 */
	private ejectMarks(element: HTMLElement): void {
		// Early exit if element was removed from DOM
		if (!element.isConnected) return

		// Remove all mark spans
		const marks = element.querySelectorAll(`.${FOCUS_MARK_CLASS}`)
		marks.forEach(mark => {
			const span = mark as HTMLSpanElement
			const listener = this.spanListeners.get(span)
			if (listener) {
				span.removeEventListener('input', listener)
				this.spanListeners.delete(span)
			}
			mark.remove()
		})

		// Merge fragmented text nodes back together
		element.normalize()
	}

	/**
	 * Extract markdown delimiters by converting the element to markdown and
	 * comparing with plain text content.
	 *
	 * This approach PRESERVES original syntax:
	 * - **bold** vs __bold__ (both become <strong>, but we detect which was used)
	 * - *italic* vs _italic_ (both become <em>, but we detect which was used)
	 *
	 * Returns { start, end } for inline elements (e.g., { start: "**", end: "**" })
	 * Returns { start } only for block elements (e.g., { start: "# " })
	 */
	private extractDelimiters(element: HTMLElement): { start: string; end?: string } | null {
		try {
			// #5: Simplified approach - create element with just text content
			const textContent = element.textContent || ''
			if (!textContent.trim()) return null

			// Create clean element with same tag name and text content only
			const temp = document.createElement(element.tagName)
			temp.textContent = textContent

			// Convert to markdown
			const markdown = htmlToMarkdown(temp.outerHTML).trim()
			const trimmedText = textContent.trim()

			// Split markdown by text content to extract delimiters
			// Example: "**bold**".split("bold") → ["**", "**"] (2 parts)
			// Example: "# Title".split("Title") → ["# ", ""] (2 parts - prefix + empty)
			const parts = markdown.split(trimmedText)

			// Error handling: text not found in markdown (would give only 1 part)
			if (parts.length < 2) return null

			const start = parts[0]
			const end = parts[1] || ''

			// Block elements: return only prefix (end is empty string anyway)
			if (isBlockTagName(element.tagName as any)) {
				return { start }
			}

			// Inline elements: return both opening and closing delimiters
			return { start, end }
		} catch (error) {
			console.error('[FocusMarks] Failed to extract delimiters:', error)
			return null
		}
	}

	/**
	 * Create a mark span element with proper class and styling attributes.
	 * Spans are editable so users can modify delimiters to unwrap formatting.
	 */
	private createMarkSpan(text: string): HTMLSpanElement {
		const span = document.createElement('span')
		span.className = FOCUS_MARK_CLASS
		span.textContent = text
		span.contentEditable = 'true'

		// NEW: Attach input event listener
		const listener = this.handleSpanInput.bind(this, span)
		span.addEventListener('input', listener)
		this.spanListeners.set(span, listener)

		return span
	}

	// NEW: Handle input in focus mark span
	private handleSpanInput(span: HTMLSpanElement, e: Event): void {
		// Find the formatted element (parent of span)
		const formattedElement = span.parentElement
		if (!formattedElement || !INLINE_FORMATTED_TAGS.includes(formattedElement.tagName as any)) {
			return
		}

		// Get current selection
		const selection = window.getSelection()
		if (!selection) return

		// Calculate cursor offset before unwrapping
		const cursorOffset = this.calculateCursorOffset(formattedElement, selection)

		// Unwrap: Extract all text and replace with plain text node
		const fullText = formattedElement.textContent || ''
		const textNode = document.createTextNode(fullText)
		formattedElement.replaceWith(textNode)

		// Restore cursor
		this.restoreCursor(textNode, cursorOffset, selection)

		// Clean up our active references (element is gone)
		if (this.activeInline === formattedElement) {
			this.activeInline = null
		}
	}

	// NEW: Calculate cursor offset in formatted element
	private calculateCursorOffset(element: HTMLElement, selection: Selection): number {
		const anchorNode = selection.anchorNode
		if (!anchorNode || !element.contains(anchorNode)) return 0

		const range = document.createRange()
		range.setStart(element, 0)
		range.setEnd(anchorNode, selection.anchorOffset)
		return range.toString().length
	}

	// NEW: Restore cursor in text node
	private restoreCursor(textNode: Text, offset: number, selection: Selection): void {
		const safeOffset = Math.min(offset, textNode.length)
		const range = document.createRange()
		range.setStart(textNode, safeOffset)
		range.collapse(true)
		selection.removeAllRanges()
		selection.addRange(range)
	}
}

// NOTE: Integration points that need to be handled elsewhere:
//
// 1. IN onInput (richEditorState.svelte.ts):
//    - Strip .pd-focus-mark spans BEFORE pattern detection and markdown conversion
//    - Use: block.querySelectorAll('.pd-focus-mark').forEach(m => m.remove())
//    - Then: block.normalize()
//
// 2. IN onInput (after pattern detection triggers unwrap):
//    - When user edits a mark span (e.g., changes ** to *), the next onInput cycle
//      will parse the invalid markdown (e.g., "*text**") and unwrap the formatting
//    - No special handling needed - existing pipeline handles this automatically
//
// 3. IN history system:
//    - Ensure mark spans don't trigger history saves (they're UI-only, not content)
//    - May need to filter them out during history serialization
//
// 4. IN CSS (RichEditor.svelte):
//    - Add .pd-focus-mark { color: #888; font-family: monospace; font-size: 0.9em; }
//    - Ensure marks don't inherit parent formatting (font-weight: normal, etc.)
