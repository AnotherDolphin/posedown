import {
	setCaretAtEnd,
	getMainParentBlock,
	findFirstMdMatch,
	isBlockPattern,
	calculateCleanCursorOffset,
	findFirstMarkdownMatch
} from '../utils'
import { smartReplaceChildren } from '../dom'
import { FOCUS_MARK_CLASS, BLOCK_FOCUS_MARK_CLASS } from '../focus/utils'
import { domToMarkdown, markdownToDomFragment } from './ast-utils'

// this file should never import from files that import it (eg. richEditorState.svelte.ts)

export type TransformResult = {
	/** Block caret offset (clean, excluding focus marks) - only set for block transforms */
	caretOffset?: number
	/** Reference to the new block element - only set for block transforms */
	newBlock?: Element
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
	const cleanBlock = block.cloneNode(true) as HTMLElement
	cleanBlock.querySelectorAll('.' + FOCUS_MARK_CLASS).forEach(mark => mark.remove())
	cleanBlock.normalize() // Merge fragmented text nodes

	// Check for block patterns, with special handling for list patterns inside LIs
	const hasBlockPattern = isBlockPattern(cleanBlock.innerText, node)
	const hasInlinePattern = findFirstMdMatch(cleanBlock.textContent || '')
	// const hasInlinePattern = findFirstMarkdownMatch(cleanBlock.textContent || '')
	if (!hasBlockPattern && !hasInlinePattern) return null

	const contentInMd = domToMarkdown(cleanBlock)

	// NOTE: When user edits a focus mark span (e.g., changes ** to *),
	// this will parse invalid markdown (e.g., "*text**") and automatically
	// unwrap the formatting. No special "unwrap" logic needed!

	// Parse back to DOM
	const { fragment, isInline } = markdownToDomFragment(contentInMd)
	if (isOnlyWhiteSpaceDifference(block, fragment)) return null

	const lastNodeInFragment = fragment.lastChild
	if (!fragment || !lastNodeInFragment) return null

	// Swap DOM and restore cursor using smartReplaceChildren
	if (isInline) {
		// Preserve block focus span across inline replacement.
		// Without this, smartReplaceChildren destroys the span, leaving focusMarkManager
		// state stale (blockSpanRefs[0] disconnected), which triggers unwrapAndReparseBlock
		// on next input and incorrectly converts the block to a <p>.
		const blockFocusSpan = block.firstElementChild?.classList?.contains(BLOCK_FOCUS_MARK_CLASS)
			? block.firstElementChild : null
		if (blockFocusSpan) blockFocusSpan.remove()

		// Pass pattern match info for accurate cursor positioning
		smartReplaceChildren(block, fragment, selection, hasInlinePattern)

		if (blockFocusSpan) block.prepend(blockFocusSpan)

		return {}
	} else {
		const caretOffset = calculateCleanCursorOffset(block, selection)
		const newBlock = fragment.firstChild as Element
		block.replaceWith(fragment)
		return { caretOffset, newBlock }
	}
}

const isOnlyWhiteSpaceDifference = (element: Node, fragment: Node | DocumentFragment) => {
	const oldContent = element instanceof HTMLElement ? element.innerHTML : element.textContent
	// Extract content from fragment
	let newContent: string | null
	if (fragment instanceof DocumentFragment) {
		const tempDiv = document.createElement('div')
		tempDiv.appendChild(fragment.cloneNode(true))
		newContent = tempDiv.innerHTML
	} else if (fragment instanceof HTMLElement) {
		newContent = fragment.innerHTML
	} else {
		newContent = fragment.textContent
	}

	// Compare after normalizing whitespace
	const normalizeWhitespace = (str: string | null) => {
		return str?.replace(/\s+/g, ' ').trim() || ''
	}

	return normalizeWhitespace(oldContent) === normalizeWhitespace(newContent)
}