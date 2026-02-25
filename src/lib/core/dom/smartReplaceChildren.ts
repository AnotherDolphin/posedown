import { FOCUS_MARK_CLASS } from '../focus/utils'
import { setCaretAtEnd, setCaretAt } from '../utils/selection'
import type { MatchResult } from '../utils'

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
	patternMatch?: MatchResult | null
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

	// Store raw offset before delimiter subtraction (used later to guard add-back in Case D)
	let rawOffsetToCaret = offsetToCaret

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
			
			// ISSUE+3: should NOT preserve outdated/repurposed spans
			// must only move spans that are in total non-conflict with the new pattern
			// new patterns may not have focus mark spans active for either ends
			// if it matches with a pre-existing delimiter inside an outdated span
			// FIX: Only migrate spans if the old node's full text matches the pattern's full text —
			// this confirms these are exactly the spans for this match (not a same-delimiter node elsewhere)
			const spansAreTheMatch = patternMatch && oldNode.textContent === patternMatch.text

			if (spansAreTheMatch) {
				;(newNode as HTMLElement).prepend(openingSpan)
				newNode.appendChild(closingSpan)
			
			// ISSUE+1 fix
			// Only add back the delimiter offset if this node IS the pattern-match node —
			// i.e. the caret's original (pre-subtraction) position was within the matched range.
			// Without this guard, an adjacent focused node (not the new match) would incorrectly
			// shift the caret by delimiterOffsetDiff.
			// Nested inside spansAreTheMatch: offset only compensates for spans actually being re-injected.
				// If spans were stale and skipped, no delimiter text is added → no offset correction needed.
				if (rawOffsetToCaret >= patternMatch.start && rawOffsetToCaret <= patternMatch.end) {
				offsetToCaret += delimiterOffsetDiff
}
			} else {
				// Spans are stale — not migrated to newNode. The raw offsetToCaret was measured from
				// the live DOM which included the old spans' delimiter text in its character count.
				// Since those spans are ejected and won't exist in the new node, we must subtract
				// oldSpanTotal to remove their contribution from the offset.
				// However, delimiterOffsetDiff was already subtracted earlier (accounting for the new
				// pattern's delimiter removal). That subtraction may overlap the same chars, so
				// we add it back here to avoid double-counting: net = oldSpanTotal - delimiterOffsetDiff.
				const oldSpanTotal =
					(openingSpan.textContent?.length || 0) + (closingSpan.textContent?.length || 0)
				offsetToCaret -= oldSpanTotal - delimiterOffsetDiff
			}
		}

		parent.replaceChild(newNode, oldNode)

		// IF newNode.length >= offsetToCaret
		if (!caretFound) {
			const newLen = newNode.textContent?.length || 0
			if (offsetToCaret >= 0 && offsetToCaret <= newLen) {
				// New node is longer than old and now contains the caret position
				caretFound = true
				caretRestored = tryRestoreCaret(newNode)
			} else {
				offsetToCaret -= newLen
			}
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
