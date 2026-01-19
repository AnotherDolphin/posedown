import { setCaretAtEnd } from '../utils/selection'
import { getFirstTextNode, getRangeFromBlockOffsets } from './util'

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
	let anchorOffset = selection.anchorOffset // issue#77: works for normal flow

	// Calculate delimiter offset if pattern matched
	if (patternMatch && anchorNode && parent.contains(anchorNode)) {
		// Get cursor's text offset in the block
		const range = document.createRange()
		range.setStart(parent, 0)
		range.setEnd(anchorNode, selection.anchorOffset)
		const cursorOffset = range.toString().length
		// debugger
		// anchorOffset = cursorOffset // issue#77: works for patterns inside activeElement, but not span edit, nor normal flow
		// console.log(range, anchorOffset)

		// Calculate how many delimiter chars to subtract based on cursor position
		// Pattern delimiters: opening + closing = 2 * delimiterLength
		if (cursorOffset >= patternMatch.end) {
			// ISSUE#1: IF CARET INSIDE FOCUS MARK, IT CAN EUQUAL 1 OR 2 AND END UP NEGATIVE
			// Cursor AT or AFTER pattern → subtract both opening & closing delimiters
			anchorOffset -= patternMatch.delimiterLength * 2
		} else if (cursorOffset >= patternMatch.start + patternMatch.delimiterLength) {
			// Cursor INSIDE pattern (after opening delimiter) → subtract opening only
			anchorOffset -= patternMatch.delimiterLength
		}
		// If cursor is BEFORE pattern start → no adjustment needed
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
				if (anchorOffset <= nodeLength) {
					// Place cursor at specific offset
					// ISSUE#2: not neccessarily "first text node" -- must correct to getRangeFromBlockOffsets like below
					const textNode = getFirstTextNode(newNode)
					if (textNode) {
						selection.collapse(textNode, anchorOffset)
						caretRestored = true
					}
				} else {
					// Cursor is beyond this node
					anchorOffset -= nodeLength
				}
			} else if (!caretRestored && i === newNodes.length - 1) {
				// Last node fallback
				setCaretAtEnd(newNode, selection)
				caretRestored = true
			}
			continue
		}

		// Case C: Nodes are Identical -> Do Nothing (Preserve Ref & Cursor)
		// isEqualNode checks attributes, tag name, and text content (recursively)
		if (oldNode.isEqualNode(newNode)) {
			// Check if cursor was here. If so, it's already safe because we didn't touch the node!
			if (anchorNode && (oldNode === anchorNode || oldNode.contains(anchorNode))) {
				caretRestored = true
			}
			continue
		}

		// Case D: Nodes are Different -> Replace
		// 1. Check if cursor was inside the old node before we destroy it
		const hadCursor = anchorNode && (oldNode === anchorNode || oldNode.contains(anchorNode))

		// 2. If cursor was here, start tracking it
		if (hadCursor) caretFound = true

		// 3. Swap
		parent.replaceChild(newNode, oldNode)

		// 4. Restore Cursor with specific offset (if we're tracking it)
		if (caretFound && !caretRestored) {
			const nodeLength = newNode.textContent?.length || 0
			if (anchorOffset <= nodeLength) {
				// Cursor should be in THIS node at specific offset
				// Use getRangeFromBlockOffsets to find the correct text node
				// (newNode may have nested elements, cursor isn't always in first text node)
				const range = getRangeFromBlockOffsets(newNode, anchorOffset, anchorOffset)
				selection.removeAllRanges()
				selection.addRange(range)
				caretRestored = true
			} else {
				// Cursor is beyond this node - continue tracking
				anchorOffset -= nodeLength
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
