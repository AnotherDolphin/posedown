import {
	smartReplaceChildren,
	setCaretAtEnd,
	getMainParentBlock,
	findFirstMarkdownMatch,
	isBlockPattern
} from '../utils'
import { FOCUS_MARK_CLASS } from '../utils/focus-mark-manager'
import { htmlBlockToMarkdown, markdownToDomFragment } from './ast-utils'

// this file should never import from files that import it (eg. richEditorState.svelte.ts)

export const findAndTransform = (
	editableRef: HTMLElement // cleanBlock: HTMLElement,
	// block: HTMLElement,
) // selection: Selection,
// hasInlinePattern: { start: number; end: number; text: string; patternName: string; delimiterLength: number } | null
: boolean => {
	const selection = window.getSelection()
	if (!selection || !selection.anchorNode || !editableRef) return false

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
	if (!block) return false

	// Strip .pd-focus-mark spans before pattern detection and markdown conversion.
	// This prevents focus mark spans from rematching as markdown syntax.
	const cleanBlock = block.cloneNode(true) as HTMLElement
	cleanBlock.querySelectorAll('.' + FOCUS_MARK_CLASS).forEach(mark => mark.remove())
	cleanBlock.normalize() // Merge fragmented text nodes

	// Check for block patterns, with special handling for list patterns inside LIs
	const hasBlockPattern = isBlockPattern(cleanBlock.innerText, node)
	const hasInlinePattern = findFirstMarkdownMatch(cleanBlock.textContent || '')

	if (!hasBlockPattern && !hasInlinePattern) return false

	const contentInMd = htmlBlockToMarkdown(cleanBlock)

	// NOTE: When user edits a focus mark span (e.g., changes ** to *),
	// this will parse invalid markdown (e.g., "*text**") and automatically
	// unwrap the formatting. No special "unwrap" logic needed!

	// Parse back to DOM
	const { fragment, isInline } = markdownToDomFragment(contentInMd)
	const lastNodeInFragment = fragment.lastChild
	if (!fragment || !lastNodeInFragment) return false

	// Swap DOM and restore cursor using smartReplaceChildren
	if (isInline) {
		// Pass pattern match info for accurate cursor positioning
		smartReplaceChildren(block, fragment, selection, hasInlinePattern)
	} else {
		block.replaceWith(fragment)
		setCaretAtEnd(lastNodeInFragment, selection) // issue#8: undo last transform => input pattern again => error range not found
	}

	return true
}
