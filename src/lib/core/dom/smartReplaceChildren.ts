import { FOCUS_MARK_CLASS } from '../focus/utils'
import { setCaretAtEnd, setCaretAt } from '../utils/selection'

/**
 * Reconciles a parent element's children against a new fragment,
 * preserving the caret at its equivalent text offset in the new content.
 *
 * When `patternMatch` is provided, the caret offset is adjusted to
 * account for removed delimiter characters (e.g. `**` → `<strong>`).
 *
 * Focus mark spans present on replaced nodes are migrated onto their
 * new replacements so the focus bookmark survives the reconciliation;
 * even if no `patternMatch` was provided
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
      delimiterOffsetDiff = patternMatch.delimiterLength + (patternMatch.end - offsetToCaret)
		} else if (offsetToCaret >= patternMatch.start + patternMatch.delimiterLength) {
			// Cursor INSIDE pattern (after opening delimiter, before closing) → subtract opening only
			delimiterOffsetDiff = patternMatch.delimiterLength
		} else if (offsetToCaret >= patternMatch.start) {
      // cursor INSIDE open delimiter
      delimiterOffsetDiff = (offsetToCaret - patternMatch.start)
		}
		// If cursor is BEFORE pattern start → no adjustment needed
		offsetToCaret -= delimiterOffsetDiff
	}

	// Try to place caret at offsetToCaret within node, or subtract node's length and continue
	const tryRestoreCaret = (node: Node): boolean => {
		const nodeLength = node.textContent?.length || 0
		if (offsetToCaret >= 0 && offsetToCaret <= nodeLength) {
			setCaretAt(node, offsetToCaret)
			return true
		}
		offsetToCaret -= nodeLength
		return false
	}

	const maxLength = Math.max(oldNodes.length, newNodes.length)

	for (let i = 0; i < maxLength; i++) {
		const oldNode = oldNodes[i]
		const newNode = newNodes[i]

		// Detect caret in old node before any mutation
		const caretInOldNode = !caretFound && anchorNode &&
			oldNode && (oldNode === anchorNode || oldNode.contains(anchorNode))
		if (caretInOldNode) caretFound = true

		// Case A: End of new list (New content is shorter) -> Remove old remaining
		if (!newNode) {
			if (oldNode) oldNode.remove()
			continue
		}

		// Case B: End of old list (New content is longer) -> Append new
		if (!oldNode) {
			parent.appendChild(newNode)

			if (caretFound && !caretRestored) {
				caretRestored = tryRestoreCaret(newNode)
			} else if (!caretRestored && i === newNodes.length - 1) {
				setCaretAtEnd(newNode, selection)
				caretRestored = true
			}
			continue
		}

		// Case C: Nodes are Identical -> Do Nothing (Preserve Ref & Cursor)
		if (oldNode.isEqualNode(newNode)) {
			if (caretInOldNode) {
				caretRestored = true // caret in untouched node — already safe
			} else if (caretFound && !caretRestored) {
				// issue#77: remaining offset from a replaced node may fall within
				// a subsequent identical node due to old/new array index misalignment
				caretRestored = tryRestoreCaret(oldNode)
			} else {
				offsetToCaret -= oldNode.textContent?.length || 0
			}
			continue
		}

		// Case D: Nodes are Different -> Replace

		// Preserve focus mark spans from old node onto the new replacement
		const hasFocusSpans = [oldNode.firstChild, oldNode.lastChild].every(
			n => n?.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).className === FOCUS_MARK_CLASS
		)

		if (caretInOldNode && hasFocusSpans && newNode.nodeType === Node.ELEMENT_NODE) {
			const openingSpan = oldNode.firstChild as HTMLElement
			const closingSpan = oldNode.lastChild as HTMLElement

			;(newNode as HTMLElement).prepend(openingSpan)
			newNode.appendChild(closingSpan)

			// Add back the delimiter offset that was subtracted earlier
			offsetToCaret += delimiterOffsetDiff
		}

		parent.replaceChild(newNode, oldNode)

		if (!caretFound) {
			offsetToCaret -= newNode.textContent?.length || 0
		} else if (!caretRestored) {
			caretRestored = tryRestoreCaret(newNode)
		}
	}

	// Fallback: If cursor was somehow lost (e.g. structure changed drastically),
	// put it at the end of the block.
	if (!caretRestored) {
		const last = parent.lastChild || parent
		setCaretAtEnd(last, selection)
	}
}
