import {
	INLINE_FORMATTED_TAGS,
	BLOCK_FORMATTED_TAGS,
	getFirstOfAncestors,
	isInlineFormattedElement,
	calculateCleanCursorOffset,
	calculateCursorOffset
} from './dom'
import { findFirstMarkdownMatch, SUPPORTED_INLINE_DELIMITERS } from './inline-patterns'
import { isSupportedBlockDelimiter } from './block-patterns'
import { smartReplaceChildren } from '../dom/smartReplaceChildren'
import { reparse, buildBlockFragmentWithReplacement, getDomRangeFromContentOffsets } from '../dom'
import { setCaretAtEnd, setCaretAt } from './selection'
import {
	extractInlineMarks,
	extractBlockMarks,
	FOCUS_MARK_CLASS,
	createMarkSpan,
	atEdgeOfFormatted,
	getSpanlessClone,
	wouldFormValidDelimiter,
	wouldFormValidBlockDelimiter,
	BLOCK_FOCUS_MARK_CLASS
} from '../focus/utils'
import { isBlockTagName } from './block-marks'

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
	inlineSpanRefs: Array<HTMLElement | Element> = []
	blockSpanRefs: Array<HTMLElement | Element> = []
	skipNextFocusMarks = false
	private editableRef: HTMLElement | null = null // should this be even here

	constructor() {
		if (typeof window === 'undefined' || !window.document) return // to prevent sudden 500 errors. why?
	}

	// ============================ FOCUS HANDLING ===================================

	/**
	 * Main update method - call this on selection change.
	 * Detects focused elements, ejects old marks, injects new marks.
	 */
	onRefocus(selection: Selection, root: HTMLElement): void {
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
		// if correct spans exist update refs instead of injecting new spans (handles undo/redo case)
		const existingSpans = element.querySelectorAll(`.${FOCUS_MARK_CLASS}`)
		if (existingSpans.length > 0) {
			this.inlineSpanRefs = [...existingSpans]
			this.activeInlineDelimiter = existingSpans[0]?.textContent || ''
			return
		}

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
		// if correct spans exist update refs instead of injecting new spans (handles undo/redo case)
		const existingSpans = element.querySelectorAll(`.${BLOCK_FOCUS_MARK_CLASS}`)
		if (existingSpans.length > 0) {
			this.blockSpanRefs = [...existingSpans]
			this.activeBlockDelimiter = existingSpans[0].textContent || ''
			return
		}

		// Extract prefix delimiter
		const delimiters = extractBlockMarks(element)
		if (!delimiters) return

		// Create prefix span
		const prefixSpan = createMarkSpan(delimiters.start, true)

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
		if (element.isConnected) {
			// Remove all mark spans
			const marks = element.querySelectorAll(`.${FOCUS_MARK_CLASS}`)
			marks.forEach(mark => mark.remove())
		}

		// Only clear refs for the type of element being ejected.
		// Ejecting inline marks (e.g. cursor leaving <strong>) must NOT wipe block state.
		if (element === this.activeInline) {
			this.inlineSpanRefs = []
			this.activeInlineDelimiter = null
		}
		if (element === this.activeBlock) {
			this.blockSpanRefs = []
			this.activeBlockDelimiter = null
		}

		// Merge fragmented text nodes back together
		element.normalize()
	}

	// ============================ EDIT HANDLING ===================================

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
	public onEdit(selection: Selection): boolean {
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
			return this.onInlineMarkChange(selection)
		}

		return false
	}

	// ============================ REPARSING ===================================

	/**
	 * Unwraps the active inline element and re-parses for new patterns.
	 * Used when focus mark spans are edited/disconnected or when breaking delimiters are typed.
	 *
	 * @param selection - Current selection for caret restoration
	 * @returns true if unwrap was performed, false otherwise
	 */
	public unwrapAndReparseInline(selection: Selection): boolean {
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

		this.editableRef && this.onRefocus(selection, this.editableRef)

		return true
	}

	/**
	 * Unwraps the active block element and re-parses for new patterns.
	 * Used when block focus mark spans are edited/disconnected.
	 *
	 * @param selection - Current selection for caret restoration
	 * @returns true if unwrap was performed, false otherwise
	 */
	public unwrapAndReparseBlock(selection: Selection): boolean {
		const blockElement = this.activeBlock
		if (!blockElement) return false

		// keep focus marks and reparse as is to get new block dom tag from md
		const fragment = reparse(blockElement, true) as DocumentFragment // now has new and correct outer tag in firstChild, but no focus marks
		const newBlock =
			fragment.firstElementChild && isBlockTagName(fragment.firstElementChild.tagName)
				? fragment.firstElementChild
				: (function () {
						const p = document.createElement('p')
						p.append(...(fragment.childNodes || document.createElement('br')))
						return p
					})()

		// find cursor offset
		const caretOffset = calculateCursorOffset(blockElement, selection)
		const [prefixSpan, suffixSpan] = this.blockSpanRefs

		// move (and preserve) focus spans if connected
		if (prefixSpan?.isConnected) newBlock.prepend(prefixSpan)
		if (suffixSpan?.isConnected) newBlock.append(suffixSpan)

		// replace and restore caret
		blockElement.replaceWith(newBlock)
		setCaretAt(newBlock, caretOffset)
		return true
	}

	// ============================ INLINE EDIT HANDLING ===================================

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
	private onInlineBreakingEdits(selection: Selection): boolean {
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
		this.unwrapAndReparseInline(selection)
		// Unfocus to skip showing marks (like regular typing)
		this.skipNextFocusMarks = true
		this.unfocus()
		// maydo: may redesign to always keep marks shown (unless user types away like obsidian) but move caret to end (for whole system)

		return true
	}

	/**
	 * Handle changes to active inline element focus marks.
	 * Checks for span modifications, nested patterns, and breaking delimiter edits.
	 *
	 * @param selection Current selection for caret restoration
	 * @returns true if inline handling occurred, false otherwise
	 */
	private onInlineMarkChange(selection: Selection): boolean {
		if (!this.activeInline) return false

		// 1. Check span status and handle mirroring
		const { spansMirrored, spansDisconnected, invalidChanges } = this.checkAndMirrorSpans()
		// 2. If spans modified/disconnected, unwrap and reparse
		if (spansMirrored || spansDisconnected || invalidChanges) {
			this.unwrapAndReparseInline(selection)
			this.onRefocus(selection, this.editableRef!)
			return true
		}

		// 3. Check for patterns inside active element
		if (!this.activeInline.contains(selection.anchorNode)) return false

		if (this.handleNestedPatterns(selection)) {
			return true
		}

		// 4. Check for breaking delimiter edits
		if (this.onInlineBreakingEdits(selection)) {
			return true
		}

		return false
	}

	// ============================ INLINE DELIMITER EDGE HANDLING ===================================

	/**
	 * Check if cursor is at the edge of activeInline.
	 * Detects cursor in adjacent text node or inside focus mark spans at their edges.
	 *
	 * @returns Object with position info, or null if not at edge
	 *   - position: 'before' | 'after' - relative to the target span
	 *   - target: 'open' | 'close' - which span the cursor is at
	 *   - caretInSpan: true if caret is inside the span, false if in adjacent content
	 */
	private isAtInlineMarkEdge(selection: Selection): {
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
	 * Handle typing delimiter characters at the edges of focus mark spans.
	 * Intercepts input to upgrade delimiters (e.g., * → ** for italic → bold).
	 *
	 * @param selection - Current selection
	 * @param typedChar - The character being typed
	 * @returns true if handled (caller should preventDefault), false otherwise
	 */
	public handleInlineMarkEdges(selection: Selection, typedChar: string): boolean {
		const edge = this.isAtInlineMarkEdge(selection)
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
			setCaretAt(startSpan.nextSibling as Text, typedChar.length)
			return true
		}

		if (!validDelimiter) return false

		// Insert into span: prepend for 'before', append for 'after'
		if (position === 'before') {
			targetSpan.textContent = typedChar + (targetSpan.textContent || '')
			setCaretAt(targetSpan, typedChar.length)
		} else {
			targetSpan.textContent = (targetSpan.textContent || '') + typedChar
			setCaretAtEnd(targetSpan, selection)
		}

		return this.onInlineMarkChange(selection)
	}

	// ============================ BLOCK HANDLING ===================================

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
	private isAtBlockMarkEdge(selection: Selection): {
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
	 * Handle typing characters in block focus mark spans.
	 * Intercepts input to handle delimiter modifications (e.g., # → ## for h1 → h2).
	 * Also handles escaping out of the span when typing non-delimiter characters.
	 *
	 * @param selection - Current selection
	 * @param typedChar - The character being typed
	 * @returns true if handled (caller should preventDefault), false otherwise
	 */
	public handleBlockMarkEdges(selection: Selection, typedChar: string): boolean {
		const edge = this.isAtBlockMarkEdge(selection)
		if (!edge) return false

		const { position, caretInSpan, target } = edge
		const [prefixSpan] = this.blockSpanRefs

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
				contentNode && contentNode.nodeName === 'BR' && contentNode.remove() // remove placeholder BR
				const textNode = document.createTextNode(typedChar)
				prefixSpan.after(textNode)
			}
			// Move caret after the typed character
			setCaretAt(prefixSpan.nextSibling as Text, typedChar.length)
			return true
		}

		if (!validDelimiter) return false

		// Insert into span: prepend for 'before', append for 'after'
		if (position === 'before') {
			// browser will handle edit
			if (caretInSpan) return false
			// next code should not be reached for block spans
			prefixSpan.textContent = typedChar + (prefixSpan.textContent || '')
			setCaretAt(prefixSpan, typedChar.length)
		} else {
			prefixSpan.textContent = (prefixSpan.textContent || '') + typedChar
			setCaretAtEnd(prefixSpan, selection)
		}

		// After modifying the span, trigger block unwrap/reparse
		return this.handleFocusedBlock(selection)
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

		// Check if span was disconnected or content changed
		const newDelimiter = prefixSpan.textContent || ''
		const spanChanged = !prefixSpan.isConnected || newDelimiter !== this.activeBlockDelimiter

		if (!spanChanged) return false

		if (!isSupportedBlockDelimiter(newDelimiter)) {
			// flatten, no need to run unwrapAndReparse
			const offset = calculateCursorOffset(this.activeBlock, selection)
			prefixSpan.replaceWith(document.createTextNode(newDelimiter))
			const p = document.createElement('p')
			while (this.activeBlock.firstChild) p.appendChild(this.activeBlock.firstChild)
			this.activeBlock.replaceWith(p)
			setCaretAt(p, offset)
			this.onRefocus(selection, this.editableRef!)
			return true
		}

		this.unwrapAndReparseBlock(selection)
		this.onRefocus(selection, this.editableRef!)

		return true
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
