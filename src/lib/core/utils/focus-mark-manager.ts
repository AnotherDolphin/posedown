import { htmlToMarkdown } from '../transforms/ast-utils'
import {
	getMainParentBlock,
	INLINE_FORMATTED_TAGS,
	BLOCK_FORMATTED_TAGS,
	getFirstOfAncestors,
	isInlineFormattedElement
} from './dom'
import { isBlockTagName } from './block-marks'
import { findAndTransform } from '../transforms/transform'
import { findFirstMarkdownMatch, SUPPORTED_INLINE_DELIMITERS } from './inline-patterns'
import { smartReplaceChildren, unwrapFormattedElement, buildBlockFragmentWithReplacement } from '../dom'

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
	activeDelimiter: string | null = null
	inlineSpanRefs: Array<HTMLElement> = []
	private editableRef: HTMLElement | null = null

	constructor() {
		if (typeof window === 'undefined' || !window.document) return // to prevent sudden 500 errors. why?
	}

	/**
	 * Get all focus mark spans from an element.
	 * Always queries the DOM to ensure fresh references.
	 */
	private getSpans(element: HTMLElement): HTMLElement[] {
		return Array.from(element.querySelectorAll(`.${FOCUS_MARK_CLASS}`)) as HTMLElement[]
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
		// console.log(selection.anchorNode, focusedInline)

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
	 * Check if cursor is at the edge of a text node adjacent to a formatted element.
	 * @returns The adjacent formatted element if found, null otherwise
	 */
	private checkTextNodeEdges(textNode: Text, offset: number): HTMLElement | null {
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
	 * Find the closest inline formatted parent element containing the cursor.
	 * Only considers INLINE_FORMATTED_TAGS (strong, em, code, s, del).
	 *
	 * Also detects when cursor is at the edge of a formatted element (in adjacent text node).
	 */
	private findFocusedInline(selection: Selection, root: HTMLElement): HTMLElement | null {
		if (!selection.anchorNode) return null

		const anchorNode = selection.anchorNode
		const offset = selection.anchorOffset

		// Check if cursor is inside a formatted element
		const insideFormatted = getFirstOfAncestors(
			anchorNode,
			root,
			INLINE_FORMATTED_TAGS
		) as HTMLElement | null

		// If inside formatted element AND in text node, check if cursor at edge with sibling
		// (issue#34 fix: prioritize sibling over parent)
		if (insideFormatted && anchorNode.nodeType === Node.TEXT_NODE) {
			const edgeSibling = this.checkTextNodeEdges(anchorNode as Text, offset)
			if (edgeSibling) return edgeSibling
		}

		if (insideFormatted) return insideFormatted

		// Not inside any formatted element - check for adjacent formatted elements

		// Case A: Cursor in text node - check edge siblings
		if (anchorNode.nodeType === Node.TEXT_NODE) {
			const edgeSibling = this.checkTextNodeEdges(anchorNode as Text, offset)
			if (edgeSibling) return edgeSibling
		}

		// Case B: Cursor in container element - check children by index
		else if (anchorNode.nodeType === Node.ELEMENT_NODE) {
			const containerEl = anchorNode as HTMLElement
			const childNodes = containerEl.childNodes

			// Cursor before a child
			if (offset < childNodes.length && childNodes[offset].nodeType === Node.ELEMENT_NODE) {
				const el = childNodes[offset] as HTMLElement
				if (isInlineFormattedElement(el.tagName)) return el
			}

			// Cursor after a child
			if (
				offset > 0 &&
				offset <= childNodes.length &&
				childNodes[offset - 1].nodeType === Node.ELEMENT_NODE
			) {
				const el = childNodes[offset - 1] as HTMLElement
				if (isInlineFormattedElement(el.tagName)) return el
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
		return getFirstOfAncestors(
			selection.anchorNode,
			root,
			BLOCK_FORMATTED_TAGS
		) as HTMLElement | null
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

		// store refs in weakmap (auto garbage collected) // this appraoch failed because weakMap doesn't reflect immediately and await GC
		// this.spanMeta.set(startSpan, delimiters.start)
		// this.spanMeta.set(endSpan, delimiters.end)
		// store refs in array for easy access
		this.inlineSpanRefs = [startSpan, endSpan]

		// Inject at element boundaries
		element.prepend(startSpan)
		element.append(endSpan)
		this.activeDelimiter = delimiters.start
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

		// todo: refs state for block spans?

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
		marks.forEach(mark => mark.remove())
		this.inlineSpanRefs = []
		// this.blockSpanRefs = []
		// WeakMap entries auto-cleaned when spans garbage collected

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

	/**
	 * Unwraps the active inline element and re-parses for new patterns.
	 * Used when focus mark spans are edited/disconnected or when breaking delimiters are typed.
	 *
	 * @param selection - Current selection for caret restoration
	 * @returns true if unwrap was performed, false otherwise
	 */
	public unwrapAndReparse(selection: Selection): boolean {
		const formattedElement = this.activeInline
		if (!formattedElement) return false

		const parentBlock = formattedElement.parentElement
		if (!parentBlock) return false

		const fragment = unwrapFormattedElement(formattedElement)
		const newBlockFragment = buildBlockFragmentWithReplacement(parentBlock, formattedElement, fragment)

		const hasInlinePattern = findFirstMarkdownMatch(parentBlock.textContent || '')
		smartReplaceChildren(parentBlock, newBlockFragment, selection, hasInlinePattern)

		// Update focus marks after DOM change
		if (this.editableRef) {
			this.update(selection, this.editableRef)
		}

		return true
	}

	/**
	 * Checks for span modifications/disconnections and handles mirroring.
	 * Detects if spans are disconnected or edited, performs cleanup or mirroring as needed.
	 *
	 * @returns Object with spanModified and spanDisconnected flags
	 */
	public handleSpanChanges(): { spanModified: boolean; spanDisconnected: boolean } {
		const spans = this.inlineSpanRefs
		const spanDisconnected = spans.some(span => !span.isConnected)
		const spanModified = spans.some(span => span.textContent !== this.activeDelimiter)

		if (spanDisconnected) {
			spans.forEach(span => span.remove())
			this.activeDelimiter = ''
		} else if (spanModified) {
			const editedSpan = spans.find(span => span.textContent !== this.activeDelimiter)
			const mirrorSpan = spans.find(span => span !== editedSpan)

			if (editedSpan && mirrorSpan && SUPPORTED_INLINE_DELIMITERS.has(editedSpan.textContent)) {
				mirrorSpan.textContent = editedSpan.textContent
				this.activeDelimiter = editedSpan.textContent || ''
			}
		}

		return { spanModified, spanDisconnected }
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
