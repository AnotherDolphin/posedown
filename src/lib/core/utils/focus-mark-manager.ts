import { htmlToMarkdown } from '../transforms/ast-utils'
import {
	getMainParentBlock,
	INLINE_FORMATTED_TAGS,
	BLOCK_FORMATTED_TAGS,
	getFirstOfAncestors,
	isInlineFormattedElement,
	calculateCleanCursorOffset
} from './dom'
import { isBlockTagName } from './block-marks'
import { findAndTransform } from '../transforms/transform'
import { findFirstMarkdownMatch, SUPPORTED_INLINE_DELIMITERS } from './inline-patterns'
import { smartReplaceChildren, reparse, buildBlockFragmentWithReplacement } from '../dom'
import { setCaretAtEnd } from '.'

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
	skipNextFocusMarks = false
	private editableRef: HTMLElement | null = null // should this be even here

	constructor() {
		if (typeof window === 'undefined' || !window.document) return // to prevent sudden 500 errors. why?
	}

	/**
	 * Main update method - call this on selection change.
	 * Detects focused elements, ejects old marks, injects new marks.
	 */
	update(selection: Selection, root: HTMLElement, skipCaretCorrection = false): void {
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
				this.injectInlineMarks(focusedInline, skipCaretCorrection)
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
	 * Manually unfocus/eject marks from all active elements.
	 * Clears both inline and block focus marks and resets active state.
	 *
	 * Useful for programmatically removing focus marks without waiting for selection change.
	 */
	unfocus(): void {
		if (this.activeInline) {
			this.ejectMarks(this.activeInline)
			this.activeInline = null
		}

		if (this.activeBlock) {
			this.ejectMarks(this.activeBlock)
			this.activeBlock = null
		}

		this.activeDelimiter = null
	}

	/**
	 * Inject marks for inline formatted elements (bold, italic, code, etc.).
	 * Creates two spans: opening and closing delimiters.
	 * Corrects caret to end of delimiter on refocusing/navigating into R edge
	 * but skips correction while editing/reparsing
	 *
	 * Example: <strong>text</strong> → <strong><span>**</span>text<span>**</span></strong>
	 */
	private injectInlineMarks(element: HTMLElement, skipCaretCorrection = false): void {
		// Skip if already marked
		if (element.querySelector(`.${FOCUS_MARK_CLASS}`)) return

		// Extract delimiters by reverse-engineering from markdown
		const delimiters = this.extractDelimiters(element)
		if (!delimiters || !delimiters.end) return

		// Create mark spans
		const startSpan = this.createMarkSpan(delimiters.start)
		const endSpan = this.createMarkSpan(delimiters.end)

		this.inlineSpanRefs = [startSpan, endSpan]

		// issue#81 fix: check to correct caret to the R side if caret was at END of element
		// BUT skip this during reprocessing (issue#71) - caret is already correctly positioned
		const selection = window.getSelection()
		const offset = calculateCleanCursorOffset(element, selection!)
		const atEnd = offset === element.textContent.length

		// Inject at element boundaries
		element.prepend(startSpan)
		element.append(endSpan)

		// correct to end (only during manual navigation, not reprocessing)
		if (atEnd && !skipCaretCorrection) setCaretAtEnd(element, selection!)

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
	 * Unwraps the active inline element and re-parses for new patterns.
	 * Used when focus mark spans are edited/disconnected or when breaking delimiters are typed.
	 *
	 * @param selection - Current selection for caret restoration
	 * @param skipCaretCorrection - don't correct caret to end on reinjection
	 * @returns true if unwrap was performed, false otherwise
	 */
	public unwrapAndReparse(selection: Selection, skipCaretCorrection = false): boolean {
		const formattedElement = this.activeInline
		if (!formattedElement) return false

		const parentBlock = formattedElement.parentElement
		if (!parentBlock) return false

		const newElementFrag = reparse(formattedElement, true)
		const newBlockFrag = buildBlockFragmentWithReplacement(
			parentBlock,
			formattedElement,
			newElementFrag
		)

		const hasInlinePattern = findFirstMarkdownMatch(parentBlock.textContent || '')
		smartReplaceChildren(parentBlock, newBlockFrag, selection, hasInlinePattern)

		this.editableRef && this.update(selection, this.editableRef, skipCaretCorrection)

		return true
	}

	// ============================ EDIT HANDLING ===================================

	/**
	 * Check if spans are disconnected or modified, and handle mirroring.
	 * Syncs delimiter changes between opening and closing spans.
	 *
	 * @returns Status flags indicating if spans were disconnected or modified
	 */
	private checkSpanStatus(): { spanDisconnected: boolean; spanModified: boolean } {
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

		return { spanDisconnected, spanModified }
	}

	/**
	 * Handle markdown patterns typed inside active formatted elements.
	 * Detects nested patterns, removes spans, reparses, then reinjects spans.
	 *
	 * @param selection Current selection for caret restoration
	 * @returns true if patterns were handled, false otherwise
	 */
	private handleNestedPatterns(selection: Selection): boolean {
		if (!this.activeInline) return false

		const hasInlinePattern = findFirstMarkdownMatch(this.getSpanlessClone()?.textContent || '')
		if (!hasInlinePattern) return false

		const [startSpan, endSpan] = this.inlineSpanRefs
		// Remove spans to prevent pattern interference
		startSpan?.remove()
		endSpan?.remove()
		const fragment = reparse(this.activeInline) // No unwrapping here, just removing spans
		smartReplaceChildren(this.activeInline, fragment, selection, hasInlinePattern)
		// Reinject spans
		if (startSpan) this.activeInline.prepend(startSpan)
		if (endSpan) this.activeInline.append(endSpan)
		// Skip next focusmarks (this triggers onSelectionChange)
		this.skipNextFocusMarks = true

		return true
	}

	/**
	 * Handle breaking delimiter edits (e.g., typing ** in the middle of bold text).
	 * Detects when typing breaks the pattern and unwraps/reparses the element.
	 *
	 * @param selection Current selection for caret restoration
	 * @returns true if breaking change was handled, false otherwise
	 */
	private handleBreakingDelimiters(selection: Selection): boolean {
		if (!this.activeInline) return false

		// If activeInline received edit that breaks its previous pattern length
		// (adding text in the middle that is == activeDelimiter)
		// e.g. **bold** => **bo**ld**
		// then match a new pattern where the old closing delimiter is now just text
		// and the new closing focus mark is at the closest valid activeDelimiter to the first span
		const matchWhole = findFirstMarkdownMatch(this.activeInline.textContent || '')
		const hasBreakingChange = matchWhole && matchWhole.text !== this.activeInline.textContent

		if (!hasBreakingChange) return false

		// Find new best pattern
		this.unwrapAndReparse(selection)
		// Unfocus to skip showing marks (like regular typing)
		this.skipNextFocusMarks = true
		this.unfocus()
		// maydo: may redesign to always keep marks shown (unless user types away like obsidian) but move caret to end (for whole system)

		return true
	}

	/**
	 * Main handler for active inline elements with focus marks.
	 * Checks for span modifications, nested patterns, and breaking delimiter edits.
	 *
	 * @param selection Current selection for caret restoration
	 * @returns true if any inline handling occurred, false otherwise
	 */
	public handleActiveInlineChange(selection: Selection): boolean {
		if (!this.activeInline) return false

		// Only enter focus mark edit flow if:
		// 1. A span was modified (delimiter edited), OR
		// 2. A span was disconnected (deleted), OR
		// Do NOT trigger just because cursor is inside activeInline (user typing regular content)
		// ALSO, sometimes activeInline.contains(selection.anchorNode) is false if editing spans at edges

		// 1. Check span status and handle mirroring
		const { spanModified, spanDisconnected } = this.checkSpanStatus()

		// 2. If spans modified/disconnected, unwrap and reparse
		if (spanModified || spanDisconnected) {
			// Skip fix if caret wasn't at end of end span
			const skipCorrection = this.isAtEdge(selection) !== 'after-closing'
			this.unwrapAndReparse(selection, skipCorrection)
			this.update(selection, this.editableRef!)
			return true
		}

		// 3. Check for patterns inside active element
		if (!this.activeInline.contains(selection.anchorNode)) return false

		if (this.handleNestedPatterns(selection)) {
			return true
		}

		// 4. Check for breaking delimiter edits
		if (this.handleBreakingDelimiters(selection)) {
			return true
		}

		return false
	}

	/**
	 * @returns get a clone for activeInline without spans
	 */
	getSpanlessClone = () => {
		if (!this.activeInline) return null
		const clone = this.activeInline.cloneNode(true) as HTMLElement
		clone.querySelectorAll(`.${FOCUS_MARK_CLASS}`).forEach(span => span.remove())
		return clone
	}

	// ============================ EDGE DELIMITER HANDLING ===================================

	/**
	 * Main entry point for handling edge delimiter input at the far side of either side.
	 * Called from onBeforeInput to handle typing at the edge of a formatted element.
	 *
	 * @param selection - Current selection
	 * @param typedChar - The character being typed
	 * @returns true if handled (caller should preventDefault), false otherwise
	 */
	public handleEdgeInput(selection: Selection, typedChar: string): boolean {
		const edgePosition = this.isAtEdge(selection)
		if (!edgePosition) return false
		if (!this.wouldFormValidDelimiter(edgePosition, typedChar)) return false

		const [startSpan, endSpan] = this.inlineSpanRefs
		const targetSpan = edgePosition === 'before-opening' ? startSpan : endSpan
		// Insert at correct position (prepend for before-opening, append for after-closing)
		if (edgePosition === 'before-opening') {
			targetSpan.textContent = typedChar + (targetSpan.textContent || '')
			// side effect (design/bug): the text is placed into the span infront of the caret; caret doesn't move
		} else {
			targetSpan.textContent = (targetSpan.textContent || '') + typedChar
			// fix: issue#71.1 - correct caret to end to apply skipCorrection correctly later
			setCaretAtEnd(targetSpan, selection)
		}

		// side independent caret fix attempt
		// const newOffset = edgePosition === 'before-opening' ? 1 : targetSpan.textContent!.length
		// const range = getDomRangeFromContentOffsets(targetSpan, newOffset)
		// // this snippet fails because onSelectionChange (and the effects inside) runs before removeAllRanges
		// selection.removeAllRanges()
		// selection.addRange(range)

		return this.handleActiveInlineChange(selection)
	}

	/**
	 * Check if cursor is at the edge of activeInline.
	 * Detects both: cursor in adjacent text node, or cursor inside focus mark spans at their edges.
	 */
	private isAtEdge(selection: Selection): 'before-opening' | 'after-closing' | null {
		if (!this.activeInline || !selection.anchorNode) return null
		if (selection.anchorNode.nodeType !== Node.TEXT_NODE) return null

		const textNode = selection.anchorNode as Text
		const offset = selection.anchorOffset

		// Case 1: Cursor in adjacent text node OUTSIDE activeInline
		if (offset === textNode.textContent?.length && textNode.nextSibling === this.activeInline) {
			return 'before-opening'
		}
		if (offset === 0 && textNode.previousSibling === this.activeInline) {
			return 'after-closing'
		}

		// Case 2: Cursor INSIDE the focus mark spans at their edges
		const [startSpan, endSpan] = this.inlineSpanRefs
		if (startSpan && textNode.parentNode === startSpan && offset === 0) {
			return 'before-opening'
		}
		if (endSpan && textNode.parentNode === endSpan && offset === textNode.textContent?.length) {
			return 'after-closing'
		}

		return null
	}

	/**
	 * Check if typing a character at the given edge would form a valid delimiter.
	 */
	private wouldFormValidDelimiter(
		edgePosition: 'before-opening' | 'after-closing',
		typedChar: string
	): boolean {
		if (!this.activeDelimiter) return false

		const potentialDelimiter =
			edgePosition === 'before-opening'
				? typedChar + this.activeDelimiter
				: this.activeDelimiter + typedChar

		return SUPPORTED_INLINE_DELIMITERS.has(potentialDelimiter)
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
