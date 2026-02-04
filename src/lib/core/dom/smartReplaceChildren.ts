import { FOCUS_MARK_CLASS } from '../focus/utils'
import { setCaretAtEnd } from '../utils/selection'
import { getDomRangeFromContentOffsets } from './util'

/**
 * Reconcile and replace a parent's child nodes from a new fragment while
 * attempting to preserve the user's caret position logically.
 *
 * The function compares `parent`'s current children to the children in
 * `newFragment` and:
 *  - removes extra old nodes,
 *  - appends extra new nodes,
 *  - replaces nodes that differ,
 *  - preserves identical nodes (so references/event listeners stay intact),
 *  - and attempts to restore the Selection to the equivalent text offset
 *    in the newly inserted content.
 *
 * If `patternMatch` is provided, the caret offset will be adjusted to ignore
 * delimiter characters (useful when converting markdown delimiters into
 * formatting nodes).
 *
 * @param parent - Block-level element whose children will be reconciled and updated.
 * @param newFragment - DocumentFragment or Node providing new child nodes
 * @param selection - Current Selection used to restore caret position
 * @param patternMatch - Optional `{ start, end, delimiterLength }` describing a
 *                       matched pattern in the block so caret offsets can be adjusted;
 * @returns void
 *
 * @remarks
 * - This function mutates the DOM and may move/remove nodes and change the selection.
 * - If the selection's anchor is not a descendant of `parent`, caret restoration is skipped.
 * - If precise caret restoration fails, it falls back to placing the caret at the end.
 */
export const smartReplaceChildren = (
	parent: HTMLElement,
	newFragment: DocumentFragment | Node,
	selection: Selection,
	patternMatch?: { start: number; end: number; delimiterLength: number } | null
) => {
	const oldNodes = Array.from(parent.childNodes)
	const newNodes = Array.from(newFragment.childNodes)

	const anchorNode = selection.anchorNode
	let caretRestored = false
	let caretFound = false
	let offsetToCaret = Infinity
	let delimiterOffsetDiff = 0

	// Calculate text offset from parent start to caret position
	if (anchorNode && parent.contains(anchorNode)) {
		const range = document.createRange()
		range.setStart(parent, 0)
		range.setEnd(anchorNode, selection.anchorOffset)
		offsetToCaret = range.toString().length
	}

	// Calculate removed delimiter offset if pattern matched
	if (patternMatch && anchorNode && parent.contains(anchorNode)) {
    
		if (offsetToCaret >= patternMatch.end) {
			// Cursor AFTER pattern → subtract both opening & closing delimiters
			delimiterOffsetDiff = patternMatch.delimiterLength * 2
		} else if (offsetToCaret >= patternMatch.end - patternMatch.delimiterLength) {
			// cursor INSIDE end delimiter (e.g. *|*)
      // todo
      delimiterOffsetDiff = patternMatch.delimiterLength + (patternMatch.end - offsetToCaret)
		} else if (offsetToCaret >= patternMatch.start + patternMatch.delimiterLength) {
			// Cursor INSIDE pattern (after opening delimiter, before closing) → subtract opening only
			delimiterOffsetDiff = patternMatch.delimiterLength
		} else if (offsetToCaret >= patternMatch.start) {
      // cursor INSIDE open delimiter
      // todo
      delimiterOffsetDiff = (offsetToCaret - patternMatch.start)
		}
		// If cursor is BEFORE pattern start → no adjustment needed
		offsetToCaret -= delimiterOffsetDiff
	}

	const maxLength = Math.max(oldNodes.length, newNodes.length)

	for (let i = 0; i < maxLength; i++) {
		const oldNode = oldNodes[i]
		const newNode = newNodes[i]

		// Case A: End of new list (New content is shorter) -> Remove old remaining
		if (!newNode) {
			if (oldNode) oldNode.remove()
			continue
		}

		// Case B: End of old list (New content is longer) -> Append new
		if (!oldNode) {
			parent.appendChild(newNode)

			// Check if cursor should be in this node
			if (caretFound && !caretRestored) {
				const nodeLength = newNode.textContent?.length || 0
				if (offsetToCaret <= nodeLength) {
					// Place cursor at specific offset
					const range = getDomRangeFromContentOffsets(newNode, offsetToCaret)
					selection.removeAllRanges()
					selection.addRange(range)
					caretRestored = true
				} else {
					// Cursor is beyond this node
					offsetToCaret -= nodeLength
				}
			} else if (!caretRestored && i === newNodes.length - 1) {
				// Last node fallback
				setCaretAtEnd(newNode, selection)
				caretRestored = true
			}
			continue
		}

		// Case C: Nodes are Identical -> Do Nothing (Preserve Ref & Cursor)
		if (oldNode.isEqualNode(newNode)) {
			// Check if cursor was here. If so, it's already safe because we didn't touch the node!
			if (anchorNode && (oldNode === anchorNode || oldNode.contains(anchorNode))) {
				caretRestored = true
			}
			offsetToCaret -= oldNode.textContent?.length || 0
			continue
		}

		// Case D: Nodes are Different -> Replace
		// 1. Check if cursor was inside the old node before we destroy it
		const hadCursor = anchorNode && (oldNode === anchorNode || oldNode.contains(anchorNode))

		// 2. If cursor was here, start tracking it
		if (hadCursor) caretFound = true

		// Preserve focus marks if transforming to restore cursor position
		const hasFocusSpans = [oldNode.firstChild, oldNode.lastChild].every(
			n => n?.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).className === FOCUS_MARK_CLASS
		)

		if (hadCursor && hasFocusSpans && newNode.nodeType === Node.ELEMENT_NODE) {
			const openingSpan = oldNode.firstChild as HTMLElement
			const closingSpan = oldNode.lastChild as HTMLElement

			;(newNode as HTMLElement).prepend(openingSpan)
			newNode.appendChild(closingSpan)

			// Add back the delimiter offset that was subtracted earlier
			offsetToCaret += delimiterOffsetDiff
		}

		// 3. Swap
		parent.replaceChild(newNode, oldNode)

		// 4. Restore caret
		if (caretFound && !caretRestored) {
			const nodeLength = newNode.textContent?.length || 0
			if (offsetToCaret <= nodeLength) {
				// Cursor should be in THIS node at specific offset
				// Use getRangeFromBlockOffsets to find the correct text node
				// (newNode may have nested elements, cursor isn't always in first text node)
				const range = getDomRangeFromContentOffsets(newNode, offsetToCaret)
				selection.removeAllRanges()
				selection.addRange(range)
				caretRestored = true
			} else {
				// Cursor is beyond this node - continue tracking
				offsetToCaret -= nodeLength
			}
		}
	}

	// Fallback: If cursor was somehow lost (e.g. structure changed drastically),
	// put it at the end of the block.
	if (!caretRestored) {
		const last = parent.lastChild || parent
		setCaretAtEnd(last, selection)
	}
}
