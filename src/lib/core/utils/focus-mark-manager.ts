import { htmlToMarkdown, markdownToDomFragment } from '../transforms/ast-utils'
import {
	getMainParentBlock,
	INLINE_FORMATTED_TAGS,
	BLOCK_FORMATTED_TAGS,
	getFirstOfAncestors,
	isInlineFormattedElement,
	calculateCleanCursorOffset
} from './dom'
import { findAndTransform } from '../transforms/transform'
import { findFirstMarkdownMatch, SUPPORTED_INLINE_DELIMITERS } from './inline-patterns'
import { isSupportedBlockDelimiter } from './block-patterns'
import { smartReplaceChildren } from '../dom/smartReplaceChildren2'
import { reparse, buildBlockFragmentWithReplacement } from '../dom'
import { setCaretAtEnd, setCaretAt } from './selection'
import {
	extractInlineMarks,
	extractBlockMarks,
	FOCUS_MARK_CLASS,
	createMarkSpan,
	atEdgeOfFormatted,
	getSpanlessClone,
	wouldFormValidDelimiter,
	wouldFormValidBlockDelimiter
} from '../focus/utils'

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
	activeInlineDelimiter: string | null = null
	activeBlockDelimiter: string | null = null
	inlineSpanRefs: Array<HTMLElement> = []
	blockSpanRefs: Array<HTMLElement> = []
	skipNextFocusMarks = false
	private editableRef: HTMLElement | null = null // should this be even here

	constructor() {
		if (typeof window === 'undefined' || !window.document) return // to prevent sudden 500 errors. why?
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

		// 2. Handle inline transition (if focused element changed) or re-injection if marks were removed
		// skipNextFocusMarks only affects inline marks (for just-transformed elements)
		const needsInlineMarks = focusedInline && !this.activeInlineDelimiter

		if (this.activeInline !== focusedInline || needsInlineMarks) {
			// Eject marks from old element
			if (this.activeInline) {
				this.ejectMarks(this.activeInline)
			}

			// Inject marks into new element (unless skipping)
			if (focusedInline && !this.skipNextFocusMarks) {
				// Infer skipCaretCorrection from DOM state:
				// - If activeInline still connected → navigation (don't skip correction)
				// - If activeInline disconnected → unwrap/edit (skip correction)
				const isNavigating = !this.activeInline || this.activeInline.isConnected
				const skipCaretCorrection = !isNavigating
				this.injectInlineMarks(focusedInline, skipCaretCorrection)
			}

			this.activeInline = focusedInline
		}

		// Reset the skip flag after inline handling
		if (this.skipNextFocusMarks) this.skipNextFocusMarks = false

		// 3. Handle block transition or re-injection if marks were removed
		const needsBlockMarks = focusedBlock && !this.activeBlockDelimiter
		if (this.activeBlock !== focusedBlock || needsBlockMarks) {
			// Eject marks from old element (if different)
			if (this.activeBlock && this.activeBlock !== focusedBlock) {
				this.ejectMarks(this.activeBlock)
			}

			// Inject marks into new element (or re-inject if missing)
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
			const edgeSibling = atEdgeOfFormatted(anchorNode as Text, offset)
			if (edgeSibling) return edgeSibling
		}

		if (insideFormatted) return insideFormatted

		// Not inside any formatted element - check for adjacent formatted elements

		// Case A: Cursor in text node - check edge siblings
		if (anchorNode.nodeType === Node.TEXT_NODE) {
			const edgeSibling = atEdgeOfFormatted(anchorNode as Text, offset)
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

		this.activeInlineDelimiter = null
		this.activeBlockDelimiter = null
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
		const delimiters = extractInlineMarks(element)
		if (!delimiters) return

		// Create mark spans
		const startSpan = createMarkSpan(delimiters.start)
		const endSpan = createMarkSpan(delimiters.end)

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

		this.activeInlineDelimiter = delimiters.start
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
		const delimiters = extractBlockMarks(element)
		if (!delimiters) return

		// Create prefix span
		const prefixSpan = createMarkSpan(delimiters.start)

		// Store reference and delimiter
		this.blockSpanRefs = [prefixSpan]
		this.activeBlockDelimiter = delimiters.start

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
		this.blockSpanRefs = []
		this.activeInlineDelimiter = null
		this.activeBlockDelimiter = null
		// WeakMap entries auto-cleaned when spans garbage collected

		// Merge fragmented text nodes back together
		element.normalize()
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

		const newElementFrag = reparse(formattedElement, true)
		const newBlockFrag = buildBlockFragmentWithReplacement(
			parentBlock,
			formattedElement,
			newElementFrag
		)

		const hasInlinePattern = findFirstMarkdownMatch(parentBlock.textContent || '')
		smartReplaceChildren(parentBlock, newBlockFrag, selection, hasInlinePattern)

		this.editableRef && this.update(selection, this.editableRef)

		return true
	}

	/**
	 * Unwraps the active block element and re-parses for new patterns.
	 * Used when block focus mark spans are edited/disconnected.
	 *
	 * @param selection - Current selection for caret restoration
	 * @returns true if unwrap was performed, false otherwise
	 */
	public unwrapBlock(selection: Selection): boolean {
		const blockElement = this.activeBlock
		if (!blockElement) return false

		const parentBlock = blockElement.parentElement
		if (!parentBlock) return false

		// Clean focus marks first (like inline does)
		this.ejectMarks(blockElement)

		// Use reparse like inline does - preserves inline formatting
		const fragment = reparse(blockElement, true) as DocumentFragment

		// Use same replacement pattern as inline
		const newBlockFrag = buildBlockFragmentWithReplacement(parentBlock, blockElement, fragment)
		const hasInlinePattern = findFirstMarkdownMatch(parentBlock.textContent || '')
		smartReplaceChildren(parentBlock, newBlockFrag, selection, hasInlinePattern)

		// Update focus marks after replacement
		this.editableRef && this.update(selection, this.editableRef)

		return true
	}

	// ============================ EDIT HANDLING ===================================

	/**
	 * Check if spans are disconnected or modified, and handle mirroring.
	 * Syncs delimiter changes between opening and closing spans.
	 *
	 * @returns Status flags indicating if spans were disconnected or modified
	 */
	private checkAndMirrorSpans() {
		const spans = this.inlineSpanRefs
		const someDisconnected = spans.some(span => !span.isConnected)
		const someModified = spans.some(span => span.textContent !== this.activeInlineDelimiter)
		let [spansDisconnected, spansMirrored] = [false, false]

		if (someDisconnected) {
			spans.forEach(span => span.remove())
			this.activeInlineDelimiter = ''
			spansDisconnected = true
		} else if (someModified) {
			const editedSpan = spans.find(span => span.textContent !== this.activeInlineDelimiter)
			const mirrorSpan = spans.find(span => span !== editedSpan)
			const shouldMirror =
				mirrorSpan && editedSpan && SUPPORTED_INLINE_DELIMITERS.has(editedSpan.textContent)

			if (shouldMirror) {
				mirrorSpan.textContent = editedSpan.textContent
				this.activeInlineDelimiter = editedSpan.textContent || ''
				spansMirrored = true
			}
		}
		const invalid = someModified && !spansMirrored
		return { spansDisconnected, spansMirrored, invalidChanges: invalid }
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

		const hasInlinePattern = findFirstMarkdownMatch(
			getSpanlessClone(this.activeInline)?.textContent || ''
		)
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
	 * Main handler for both block and inline focus mark changes.
	 * Call this in onInput to handle all focus mark editing scenarios.
	 *
	 * Processes in order:
	 * 1. Block changes first (more structural, can affect inline elements)
	 * 2. Inline changes second (more granular, contained within blocks)
	 * moi: prob wrong order
	 *
	 * @param selection Current selection for caret restoration
	 * @returns true if any handling occurred, false otherwise
	 */
	public handleInFocused(selection: Selection): boolean {
		// BLOCK FIRST - more structural, can replace/restructure DOM
		if (this.activeBlock) {
			const blockHandled = this.handleFocusedBlock(selection)
			if (blockHandled) {
				// Block was unwrapped/restructured - let next update() cycle handle inline detection
				return true
			}
		}

		// INLINE SECOND - more granular, only if block didn't restructure
		if (this.activeInline) {
			return this.handleFocusedInline(selection)
		}

		return false
	}

	/**
	 * Handle changes to active block element focus marks.
	 * Detects when block delimiter spans are modified or disconnected.
	 *
	 * @param selection Current selection for caret restoration
	 * @returns true if block handling occurred, false otherwise
	 */
	private handleFocusedBlock(selection: Selection): boolean {
		if (!this.activeBlock) return false

		const [prefixSpan] = this.blockSpanRefs
		if (!prefixSpan) return false

		// Check if span was disconnected
		if (!prefixSpan.isConnected) {
			return this.unwrapBlock(selection)
		}

		// Check if span content changed
		const newDelimiter = prefixSpan.textContent || ''
		if (newDelimiter === this.activeBlockDelimiter) {
			return false
		}

		// Check if new delimiter is valid
		if (!isSupportedBlockDelimiter(newDelimiter)) {
			// Invalid delimiter - unwrap to plain paragraph
			return this.unwrapBlock(selection)
		}

		// Valid new delimiter - apply it
		// Get content without the delimiter span, preserving inline formatting
		const cleanBlock = this.activeBlock.cloneNode(true) as HTMLElement
		cleanBlock.querySelectorAll('.' + FOCUS_MARK_CLASS).forEach(mark => mark.remove())
		cleanBlock.normalize()

		// Use htmlToMarkdown to preserve inline formatting (not textContent which loses it)
		const contentInMd = htmlToMarkdown(cleanBlock.innerHTML)

		// Create new markdown with new delimiter
		const newMarkdown = newDelimiter + contentInMd
		const { fragment } = markdownToDomFragment(newMarkdown)

		const newBlock = fragment.firstChild
		if (!newBlock) return false

		// Replace the heading element itself, NOT the parent
		this.activeBlock.replaceWith(newBlock)
		setCaretAtEnd(newBlock, selection)

		// Update state and refresh focus marks
		this.activeBlockDelimiter = newDelimiter
		this.editableRef && this.update(selection, this.editableRef)

		return true
	}

	/**
	 * Handle changes to active inline element focus marks.
	 * Checks for span modifications, nested patterns, and breaking delimiter edits.
	 *
	 * @param selection Current selection for caret restoration
	 * @returns true if inline handling occurred, false otherwise
	 */
	private handleFocusedInline(selection: Selection): boolean {
		if (!this.activeInline) return false

		// 1. Check span status and handle mirroring
		const { spansMirrored, spansDisconnected, invalidChanges } = this.checkAndMirrorSpans()
		// 2. If spans modified/disconnected, unwrap and reparse
		if (spansMirrored || spansDisconnected || invalidChanges) {
			this.unwrapAndReparse(selection)
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

	// ============================ EDGE DELIMITER HANDLING ===================================

	/**
	 * Handle typing delimiter characters at the edges of focus mark spans.
	 * Intercepts input to upgrade delimiters (e.g., * → ** for italic → bold).
	 *
	 * @param selection - Current selection
	 * @param typedChar - The character being typed
	 * @returns true if handled (caller should preventDefault), false otherwise
	 */
	public handleInlineSpanEdges(selection: Selection, typedChar: string): boolean {
		const edge = this.isAtEdge(selection)
		if (!edge) return false

		const { position, target } = edge
		const [startSpan, endSpan] = this.inlineSpanRefs
		const targetSpan = target === 'open' ? startSpan : endSpan
		const validDelimiter = wouldFormValidDelimiter(
			this.activeInlineDelimiter || '',
			position,
			typedChar,
			SUPPORTED_INLINE_DELIMITERS
		)

		// Special case: after opening span with invalid delimiter → insert into content
		if (position === 'after' && target === 'open' && !validDelimiter) {
			const contentNode = startSpan.nextSibling
			if (contentNode && contentNode.nodeType === Node.TEXT_NODE) {
				contentNode.textContent = typedChar + (contentNode.textContent || '')
			} else {
				const textNode = document.createTextNode(typedChar)
				startSpan.after(textNode)
			}
			// issue#76 fix: move caret after the typed character
			setCaretAt(startSpan.nextSibling as Text, typedChar.length, selection)
			return true
		}

		if (!validDelimiter) return false

		// Insert into span: prepend for 'before', append for 'after'
		if (position === 'before') {
			targetSpan.textContent = typedChar + (targetSpan.textContent || '')
		} else {
			targetSpan.textContent = (targetSpan.textContent || '') + typedChar
			setCaretAtEnd(targetSpan, selection)
		}

		return this.handleFocusedInline(selection)
	}

	/**
	 * Check if cursor is at the edge of activeInline.
	 * Detects cursor in adjacent text node or inside focus mark spans at their edges.
	 *
	 * @returns Object with position info, or null if not at edge
	 *   - position: 'before' | 'after' - relative to the target span
	 *   - target: 'open' | 'close' - which span the cursor is at
	 *   - caretInSpan: true if caret is inside the span, false if in adjacent content
	 */
	private isAtEdge(selection: Selection): {
		position: 'before' | 'after'
		target: 'open' | 'close'
		caretInSpan: boolean
	} | null {
		if (!this.activeInline || !selection.anchorNode) return null
		if (selection.anchorNode.nodeType !== Node.TEXT_NODE) return null

		const textNode = selection.anchorNode as Text
		const offset = selection.anchorOffset
		const [startSpan, endSpan] = this.inlineSpanRefs

		const atStart = offset === 0
		const atEnd = offset === textNode.textContent?.length
		if (!atStart && !atEnd) return null

		const parent = textNode.parentNode
		const next = textNode.nextSibling
		const prev = textNode.previousSibling

		// Determine target span from context
		const target: 'open' | 'close' | null =
			parent === startSpan ||
			(atEnd && next === this.activeInline) ||
			(atStart && prev === startSpan)
				? 'open'
				: parent === endSpan ||
					  (atStart && prev === this.activeInline) ||
					  (atEnd && next === endSpan)
					? 'close'
					: null

		if (!target) return null

		const caretInSpan = parent === startSpan || parent === endSpan
		const position = caretInSpan ? (atStart ? 'before' : 'after') : atEnd ? 'before' : 'after'

		return { position, target, caretInSpan }
	}

	/**
	 * Check if cursor is at the edge of activeBlock.
	 * Detects cursor in adjacent text node or inside focus mark spans at their edges.
	 * Block spans only have opening delimiters (no closing), so target is always 'open'.
	 *
	 * @returns Object with position info, or null if not at edge
	 *   - position: 'before' | 'after' - relative to the target span
	 *   - target: 'open' | 'close' - which span the cursor is at (always 'open' for blocks)
	 *   - caretInSpan: true if caret is inside the span, false if in adjacent content
	 */
	private isAtEdge2(selection: Selection): {
		position: 'before' | 'after'
		target: 'open' | 'close'
		caretInSpan: boolean
	} | null {
		const [startSpan] = this.blockSpanRefs
		const anchorNode = selection.anchorNode
		if (!this.activeBlock || !anchorNode || !startSpan) return null

		// if cursor in <br> sibling of span (empty block)
		if (anchorNode.nodeName === 'BR' && anchorNode.previousSibling === startSpan) {
			return { position: 'after', target: 'open', caretInSpan: false }
		}

		if (anchorNode.nodeType !== Node.TEXT_NODE) return null

		const textNode = anchorNode as Text
		const offset = selection.anchorOffset

		const atStart = offset === 0
		const atEnd = offset === textNode.textContent?.length
		if (!atStart && !atEnd) return null

		const parent = textNode.parentNode
		const next = textNode.nextSibling
		const prev = textNode.previousSibling

		// Determine target span from context
		// For blocks, we only have opening span, so target is always 'open'
		const target: 'open' | 'close' | null =
			parent === startSpan ||
			(atEnd && next === this.activeBlock) ||
			(atStart && prev === startSpan)
				? 'open'
				: null

		if (!target) return null

		const caretInSpan = parent === startSpan
		const position = caretInSpan ? (atStart ? 'before' : 'after') : atEnd ? 'before' : 'after'

		return { position, target, caretInSpan }
	}

	/**
	 * Check if cursor is at the edge of a block delimiter span.
	 * Block elements only have opening delimiter spans at the start.
	 *
	 * @returns Object with position info, or null if not at edge
	 *   - position: 'before' | 'after' - relative to the delimiter span
	 *   - caretInSpan: true if caret is inside the span, false if in adjacent content
	 */
	private isAtBlockEdge(selection: Selection): {
		position: 'before' | 'after'
		caretInSpan: boolean
	} | null {
		if (!this.activeBlock || !selection.anchorNode || this.blockSpanRefs.length === 0) {
			return null
		}
		if (selection.anchorNode.nodeType !== Node.TEXT_NODE) return null

		const textNode = selection.anchorNode as Text
		const offset = selection.anchorOffset
		const [prefixSpan] = this.blockSpanRefs

		const atStart = offset === 0
		const atEnd = offset === textNode.textContent?.length
		if (!atStart && !atEnd) return null

		const parent = textNode.parentNode
		const next = textNode.nextSibling
		const prev = textNode.previousSibling

		// Check if we're at the edge of the prefix span
		// Either inside the span at its edges, or in adjacent text node
		const atPrefixEdge =
			parent === prefixSpan || (atEnd && next === prefixSpan) || (atStart && prev === prefixSpan)

		if (!atPrefixEdge) return null

		const caretInSpan = parent === prefixSpan
		const position = caretInSpan ? (atStart ? 'before' : 'after') : atEnd ? 'before' : 'after'

		return { position, caretInSpan }
	}

	/**
	 * Handle typing characters in block focus mark spans.
	 * Intercepts input to handle delimiter modifications (e.g., # → ## for h1 → h2).
	 * Also handles escaping out of the span when typing non-delimiter characters.
	 *
	 * @param selection - Current selection
	 * @param typedChar - The character being typed
	 * @returns true if handled (caller should preventDefault), false otherwise
	 */
	public handleBlockMarkSpanEdges(selection: Selection, typedChar: string): boolean {
		const edge = this.isAtEdge2(selection)
		if (!edge) return false

		const { position, caretInSpan, target } = edge
		const [prefixSpan] = this.blockSpanRefs
		const targetSpan = prefixSpan

		const validDelimiter = wouldFormValidBlockDelimiter(
			this.activeBlockDelimiter || '',
			position,
			typedChar,
			isSupportedBlockDelimiter
		)

		// Special case: after prefix span with invalid delimiter → insert into content (escape the span)
		if (position === 'after' && target === 'open' && !validDelimiter) {
			const contentNode = prefixSpan.nextSibling
			if (contentNode && contentNode.nodeType === Node.TEXT_NODE) {
				contentNode.textContent = typedChar + (contentNode.textContent || '')
			} else {
				const textNode = document.createTextNode(typedChar)
				prefixSpan.after(textNode)
			}
			// Move caret after the typed character
			setCaretAt(prefixSpan.nextSibling as Text, typedChar.length, selection)
			return true
		}

		if (!validDelimiter) return false

		// Insert into span: prepend for 'before', append for 'after'
		if (position === 'before') {
			// browser will handle edit
			if (caretInSpan) return false
			// next code should not be reached for block spans
			prefixSpan.textContent = typedChar + (prefixSpan.textContent || '')
			setCaretAt(prefixSpan, typedChar.length, selection)
		} else {
			prefixSpan.textContent = (prefixSpan.textContent || '') + typedChar
			setCaretAtEnd(prefixSpan, selection)
		}

		// After modifying the span, trigger block unwrap/reparse
		return this.handleFocusedBlock(selection)
	}
}

/**
 * Known issues:
 * - Selecting a code block should focus outside the focusMarks (spans) OR prevent enter from adding new lines inside spans
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
