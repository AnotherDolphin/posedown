import { htmlToMarkdown } from '../transforms/ast-utils'
import {
	getMainParentBlock,
	INLINE_FORMATTED_TAGS,
	BLOCK_FORMATTED_TAGS,
	getFirstOfAncestors
} from './dom'
import { isBlockTagName } from './block-marks'
import { findAndTransform } from '../transforms/transform'

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
	activeInline: HTMLElement | null = null
	activeBlock: HTMLElement | null = null
	spanRefs: Array<HTMLElement> = []
	activeDelimiter: string | null = null
	private spanObserver: MutationObserver | null = null
	private editableRef: HTMLElement | null = null

	constructor() {
		if (typeof window === 'undefined' || !window.document) return // to prevent sudden 500 errors. why?
		// issue: onInput can't fire on a child of contentEditable (bubbling stops at contentEditable boundary)
		// obersever on each span for content changes failed (if emptied, span removed and no mutation observed)
		// observing the activeInline/activeBlock for childList changes fires after onInput, 
		// which is too late because spans must mirror before onInput works on the changed content

		// Create observer for detecting span content changes
		this.spanObserver = new MutationObserver(mutations => {
			for (const mutation of mutations) {
				if (mutation.type === 'characterData' || mutation.type === 'childList') {
					const target = mutation.target
					console.log('overserve')
					
					// Find which span was edited (target could be text node inside span)
					const editedSpan =
						target.nodeType === Node.TEXT_NODE
							? (target.parentElement as HTMLElement)
							: (target as HTMLElement)

					if (editedSpan && this.spanRefs.includes(editedSpan)) {
						const selection = window.getSelection()
						if (selection) {
							// this.handleSpanEdit(editedSpan, selection)
						}
						break // Only handle first mutation
					}
				}
			}
		})
	}

	/**
	 * Main update method - call this on selection change.
	 * Detects focused elements, ejects old marks, injects new marks.
	 */
	update(selection: Selection, root: HTMLElement): void {
		
		this.editableRef = root // Store for use in handleSpanEdit
		if (!selection.anchorNode) return
		
		// 1. Find which inline/block elements contain the cursor
		const focusedInline = this.findFocusedInline(selection, root)
		const focusedBlock = this.findFocusedBlock(selection, root)
		console.log(selection.anchorNode, focusedInline)

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
	 *
	 * Also detects when cursor is at the edge of a formatted element (in adjacent text node).
	 */
	private findFocusedInline(selection: Selection, root: HTMLElement): HTMLElement | null {
		if (!selection.anchorNode) return null
		// First check if cursor is inside a formatted element (existing behavior)

		// issue#34: this give priority to parent elements even if the caret is at either edge
		// of a child element that should be prioritized instead
		// i.e. when the caret at `This is bold and |italic text`
		// the html is:
		// <p>This is <strong><span class="pd-focus-mark">**</span>bold and <em>italic</em><span class="pd-focus-mark">**</span></strong> text</p>
		// but it shoud show the focus marks around the italic instead of the strong

		const insideFormatted = getFirstOfAncestors(
			selection.anchorNode,
			root,
			INLINE_FORMATTED_TAGS
		) as HTMLElement | null
		if (insideFormatted) return insideFormatted

		// Check if cursor is at the edge of an adjacent formatted element
		const anchorNode = selection.anchorNode
		const offset = selection.anchorOffset

		// Case A: Cursor is in a text node - check adjacent siblings
		if (anchorNode.nodeType === Node.TEXT_NODE) {
			const textNode = anchorNode as Text

			// At start of text node (offset 0) - check previous sibling
			if (offset === 0 && textNode.previousSibling) {
				const prev = textNode.previousSibling
				if (prev.nodeType === Node.ELEMENT_NODE) {
					const el = prev as HTMLElement
					if (INLINE_FORMATTED_TAGS.includes(el.tagName as any)) {
						return el
					}
				}
			}

			// At end of text node - check next sibling
			if (offset === textNode.textContent?.length && textNode.nextSibling) {
				console.log('end of', textNode)
				
				const next = textNode.nextSibling
				if (next.nodeType === Node.ELEMENT_NODE) {
					const el = next as HTMLElement
					if (INLINE_FORMATTED_TAGS.includes(el.tagName as any)) {
						return el
					}
				}
			}
		}

		// Case B: Cursor is directly in a container element (e.g., P)
		// anchorOffset represents the child index in this case
		else if (anchorNode.nodeType === Node.ELEMENT_NODE) {
			const containerEl = anchorNode as HTMLElement
			const childNodes = containerEl.childNodes

			// Cursor before a child (e.g., <p>|<em>word</em></p>)
			if (offset < childNodes.length) {
				const childAtCursor = childNodes[offset]
				if (childAtCursor.nodeType === Node.ELEMENT_NODE) {
					const el = childAtCursor as HTMLElement
					if (INLINE_FORMATTED_TAGS.includes(el.tagName as any)) {
						return el
					}
				}
			}

			// Cursor after a child (e.g., <p><em>word</em>|</p>)
			if (offset > 0 && offset <= childNodes.length) {
				const childBeforeCursor = childNodes[offset - 1]
				if (childBeforeCursor.nodeType === Node.ELEMENT_NODE) {
					const el = childBeforeCursor as HTMLElement
					if (INLINE_FORMATTED_TAGS.includes(el.tagName as any)) {
						return el
					}
				}
			}
		}

		return null
	}

	/**
	 * Find the closest block formatted parent element containing the cursor.
	 * Only considers BLOCK_FORMATTED_TAGS (h1-h6, blockquote, li).
	 */
	private findFocusedBlock(selection: Selection, root: HTMLElement): HTMLElement | null {
		if (!selection.anchorNode) return null
		return getFirstOfAncestors(selection.anchorNode, root, BLOCK_FORMATTED_TAGS) as HTMLElement | null
	}

	/**
	 * Inject marks for inline formatted elements (bold, italic, code, etc.).
	 * Creates two spans: opening and closing delimiters.
	 *
	 * Example: <strong>text</strong> → <strong><span>**</span>text<span>**</span></strong>
	 */
	injectInlineMarks(element: HTMLElement): void {
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
		this.activeDelimiter = delimiters.start

		// Track injected spans
		this.spanRefs.push(startSpan, endSpan)

		// Observe spans for content changes
		if (this.spanObserver) {
			this.spanObserver.observe(startSpan, { characterData: true, childList: true, subtree: true })
			this.spanObserver.observe(endSpan, { characterData: true, childList: true, subtree: true })
		}
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

		// Track injected span
		this.spanRefs.push(prefixSpan)

		// Observe span for content changes
		if (this.spanObserver) {
			this.spanObserver.observe(prefixSpan, { characterData: true, childList: true, subtree: true })
		}
	}

	/**
	 * Remove all focus mark spans from an element and normalize text nodes.
	 */
	private ejectMarks(element: HTMLElement): void {
		// Early exit if element was removed from DOM
		if (!element.isConnected) return

		// Disconnect observer before removing spans
		if (this.spanObserver) {
			this.spanObserver.disconnect()
		}

		// Remove all mark spans
		const marks = element.querySelectorAll(`.${FOCUS_MARK_CLASS}`)
		marks.forEach(mark => mark.remove())
		this.spanRefs = []

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
				liTemp.textContent = textContent
				listWrapper.appendChild(liTemp)
				temp = listWrapper
			} else {
				// Regular handling for other elements (headings, inline, blockquote, etc.)
				temp = document.createElement(element.tagName)
				temp.textContent = textContent
			}

			// Convert to markdown
			const markdown = htmlToMarkdown(temp.outerHTML).trim()
			const trimmedText = textContent.trim()

			// Split markdown by text content to extract delimiters
			// Example: "**bold**".split("bold") → ["**", "**"] (2 parts)
			// Example: "# Title".split("Title") → ["# ", ""] (2 parts - prefix + empty)
			// Example: "- Item".split("Item") → ["- ", ""] (2 parts - list prefix + empty)
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
	 * Spans inherit contentEditable from parent, so users can modify delimiters to unwrap formatting.
	 */
	private createMarkSpan(text: string): HTMLSpanElement {
		const span = document.createElement('span')
		span.className = FOCUS_MARK_CLASS
		span.textContent = text
		// Note: contentEditable inherited from parent editor div

		return span
	}

	/**
	 * Public method called when user edits a focus mark span.
	 * Mirrors the edit to the corresponding span (opening ↔ closing), then unwraps.
	 * Called from richEditorState.svelte.ts onInput when e.target is a focus mark span.
	 */
	public handleSpanEdit(span: HTMLElement, selection: Selection): void {
		// Find the formatted element (parent of span)
		const formattedElement = span.parentElement
		if (!formattedElement || !INLINE_FORMATTED_TAGS.includes(formattedElement.tagName as any)) {
			return
		}

		// Mirror edits: sync opening ↔ closing spans
		// Inline elements have 2 spans (opening + closing), block elements have 1 span (prefix only)
		// const spans = formattedElement.querySelectorAll(`.${FOCUS_MARK_CLASS}`)
		if (this.spanRefs.length === 2) {
			const openingSpan = this.spanRefs[0] as HTMLElement
			const closingSpan = this.spanRefs[1] as HTMLElement

			// Determine which span was edited and sync the other
			if (span === openingSpan) {
				// User edited opening span → update closing span to match
				closingSpan.textContent = openingSpan.textContent
			} else if (span === closingSpan) {
				// User edited closing span → update opening span to match
				openingSpan.textContent = closingSpan.textContent
			}
		}

		// Calculate cursor offset before unwrapping
		const cursorOffset = this.calculateCursorOffset(formattedElement, selection)
		// Clear active span references
		this.spanRefs = [] // will be set again by rest of onInput flow

		// Unwrap: Extract all text (including edited delimiter) and replace with plain text node
		const fullText = formattedElement.textContent || ''
		const textNode = document.createTextNode(fullText)
		formattedElement.replaceWith(textNode)

		// Trigger pattern detection on unwrapped text
		if (this.editableRef) {
			findAndTransform(this.editableRef)
		}
		// Restore cursor position in the new text node
		// this.restoreCursor(textNode, cursorOffset, selection)

		// Clean up our active references (element is gone)
		if (this.activeInline === formattedElement) {
			this.activeInline = null
		}
	}

	/**
	 * Calculate cursor offset within formatted element.
	 * Uses Range API to get character offset from start of element to cursor.
	 */
	private calculateCursorOffset(element: HTMLElement, selection: Selection): number {
		const anchorNode = selection.anchorNode
		if (!anchorNode || !element.contains(anchorNode)) return 0

		const range = document.createRange()
		range.setStart(element, 0)
		range.setEnd(anchorNode, selection.anchorOffset)
		return range.toString().length
	}

	/**
	 * Restore cursor position in text node after unwrapping.
	 * Ensures offset doesn't exceed text node length.
	 */
	private restoreCursor(textNode: Text, offset: number, selection: Selection): void {
		const safeOffset = Math.min(offset, textNode.length)
		// Create fresh range (not attached to old DOM structure)
		const range = document.createRange()
		range.setStart(textNode, safeOffset)
		range.setEnd(textNode, safeOffset)
		// Clear stale ranges and set new range
		selection.removeAllRanges()
		selection.addRange(range)
	}
}

/**
 * issues:
 * - blocks don't react to md mark changes
 * - selecting a code block should focus outside the focusMarks (spans) OR prevent enter from adding new lines inside spans
 */

// NOTE: Integration points that need to be handled elsewhere:
//
// 1. IN onInput (richEditorState.svelte.ts): ✅
//    - Strip .pd-focus-mark spans BEFORE pattern detection and markdown conversion
//    - Use: block.querySelectorAll('.pd-focus-mark').forEach(m => m.remove())
//    - Then: block.normalize()
//
// 2. IN onInput (after pattern detection triggers unwrap): ✅
//    - When user edits a mark span (e.g., changes ** to *), the next onInput cycle
//      will parse the invalid markdown (e.g., "*text**") and unwrap the formatting
//    - No special handling needed - existing pipeline handles this automatically
//
// 3. IN history system: ✅
//    - Ensure mark spans don't trigger history saves (they're UI-only, not content)
//    - May need to filter them out during history serialization
//
// 4. IN CSS (RichEditor.svelte):
//    - Add .pd-focus-mark { color: #888; font-family: monospace; font-size: 0.9em; }
//    - Ensure marks don't inherit parent formatting (font-weight: normal, etc.)
