import {
	setCaretAtEnd,
	getMainParentBlock,
	isBlockPattern,
	calculateCleanCursorOffset,
	findFirstMdMatch
} from '../utils'
import { smartReplaceChildren } from '../dom'
import {
	FOCUS_MARK_CLASS,
	BLOCK_FOCUS_MARK_CLASS,
	getSpanlessClone,
	removeFocusMarkSpans
} from '../focus/utils'
import { domToMarkdown, markdownToDomFragment } from './ast-utils'
import { hasFormattedNodeChanges } from './checkers'

// this file should never import from files that import it (eg. richEditorState.svelte.ts)

export type TransformResult = {
	/** Block caret offset (clean, excluding focus marks) - only set for block transforms */
	caretOffset: number
	/** Reference to the new block element - only set for block transforms */
	block?: Element
} | null

export const findAndTransform = (editableRef: HTMLElement): TransformResult => {
	const selection = window.getSelection()
	if (!selection || !selection.anchorNode || !editableRef) return null

	// was made because ctrl+a back/del preserves the node type of the first block element (eg. keeps a top header)
	// also, a side effect of code is that emptying a single child automatically makes it a P (even w/o ctrl+a)
	// Guard clause: ensure editor always has at least <p><br></p>
	// if (isEditorEmpty(editableRef)) {
	// 	preserveOneChild(editableRef)
	// 	history.push(editableRef)
	// 	return
	// }
	const node = selection.anchorNode

	// issue: detect if anchor node is editableRef i.e. multiple nodes werer selected
	// instead of the 'block' getting replaced, we want to replace all selected blocks

	let block = getMainParentBlock(node, editableRef)
	if (!block) return null

	// Strip .pd-focus-mark spans before pattern detection and markdown conversion.
	// This prevents focus mark spans from rematching as markdown syntax.
	const spanlessBlockClone = getSpanlessClone(block)

	// Check for block patterns, with special handling for list patterns inside LIs
	const hasBlockPattern = isBlockPattern(spanlessBlockClone.innerText, node)
	const hasInlinePattern = findFirstMdMatch(spanlessBlockClone.textContent || '')
	// const hasInlinePattern = findFirstMarkdownMatch(spanlessBlockClone.textContent || '')

	const contentInMd = domToMarkdown(spanlessBlockClone)

	// NOTE: When user edits a focus mark span (e.g., changes ** to *),
	// this will parse invalid markdown (e.g., "*text**") and automatically
	// unwrap the formatting. No special "unwrap" logic needed!

	// Parse back to DOM
	const { fragment, isInline } = markdownToDomFragment(contentInMd)
	const outdated = hasFormattedNodeChanges(spanlessBlockClone, fragment)

	// debugger
	if (outdated && !hasBlockPattern && !hasInlinePattern) {
		// issue#86.2: breaking change / existing delimiters (inc. folded spans) WOULD rematch differently
		console.log('breaking change')
		// both input updates don't work with caret restore properly:
		// *sdf |*sdf*
		// *sdf|* sdf*
		// sol: unfold ALL delimiter spans, get caret node and pos, fold spans, 
		// refocus to reveal appropriate focus span, restore caret based on node and offset
		
	}

	// const fragmentHtml = Array.from(fragment.childNodes)
	// 	.map(n => (n as HTMLElement).outerHTML || n.textContent)
	// 	.join('')
	// const blockHtml = spanlessBlockClone.innerHTML
	// const changed = blockHtml !== fragmentHtml
	// console.log(
	// 	`[transform] ${changed ? '⚡ DIFF' : '✓ SAME'}\n  block:    ${blockHtml}\n  fragment: ${fragmentHtml}`
	// )
	// console.log('chaged', hasFormattedNodeChanges(spanlessBlockClone, fragment))

	// if (!hasFormattedNodeChanges(block, fragment)) {
	// 	return null
	// }
	if (!hasBlockPattern && !hasInlinePattern && !outdated) return null

	const lastNodeInFragment = fragment.lastChild
	if (!fragment || !lastNodeInFragment) return null

	const caretOffset = calculateCleanCursorOffset(block, selection)

	// Swap DOM and restore cursor using smartReplaceChildren
	if (isInline) {
		// Preserve block focus span across inline replacement.
		// Without this, smartReplaceChildren destroys the span, leaving focusMarkManager
		// state stale (blockSpanRefs[0] disconnected), which triggers unwrapAndReparseBlock
		// on next input and incorrectly converts the block to a <p>.
		const blockFocusSpan = block.firstElementChild?.classList?.contains(BLOCK_FOCUS_MARK_CLASS)
			? block.firstElementChild
			: null
		if (blockFocusSpan) blockFocusSpan.remove()

		// ISSUE+2 fix
		// Strip inline focus spans so offsetToCaret is in the same coordinate space as patternMatch.
		// patternMatch was found from the spanless clone; block focus span already removed above.
		removeFocusMarkSpans(block)
		smartReplaceChildren(block, fragment, selection, hasInlinePattern)
		// console.log(hasInlinePattern, caretOffset)

		if (blockFocusSpan) block.prepend(blockFocusSpan)

		// issue#86 fix: return original caret offset to allow onInput to restore to exact pos after focus/reinject spans
		return { caretOffset, block }
	} else {
		const newBlock = fragment.firstChild as Element
		block.replaceWith(fragment)
		setCaretAtEnd(newBlock, selection) // temporary for correct focus .update call
		return { caretOffset, block: newBlock }
	}
}
