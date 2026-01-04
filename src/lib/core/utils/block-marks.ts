import { markdownToHtml, stringifyMdastToMarkdown } from '../transforms/ast-utils'
import { defaultHandlers, toHast, type Handler } from 'mdast-util-to-hast'
import { getMainParentBlock, insertAfter } from './dom'

/**
 * Block-level HTML tag names
 */
const BLOCK_TAG_NAMES = [
	'P',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'BLOCKQUOTE',
	'PRE',
	'UL',
	'OL',
	'LI'
] as const
export const isBlockTagName = (tagName: string): tagName is (typeof BLOCK_TAG_NAMES)[number] => {
	return (BLOCK_TAG_NAMES as readonly string[]).includes(tagName)
}

// mdast to hast node handler for H
export const headingHandler: Handler = (state, node) => {
	// Call default handler
	const result = defaultHandlers.heading(state, node)

	// Get raw markdown and extract hash prefix
	const rawMd = stringifyMdastToMarkdown(node).trim()

	result.properties = {
		...result.properties,
		dataRawMd: rawMd
	}

	return result
}

/**
 * Ensure all empty block elements have a <br> for proper height in contenteditable
 * Handles headings, code blocks, blockquotes, list items, etc.
 */
export const ensureBlockHeight = (element: Element) => {
	// Check if this element is empty or only has whitespace
	const isEmpty = !element.textContent || element.textContent.trim() === ''

	if (isEmpty && isBlockTagName(element.tagName)) {
		// Special case: for PRE elements, add BR inside the CODE element
		if (element.tagName === 'PRE') {
			const codeEl = element.querySelector('code')
			if (codeEl && (!codeEl.textContent || codeEl.textContent.trim() === '')) {
				codeEl.innerHTML = '<br>'
			}
		} else if (element.children.length === 0) {
			// For other blocks, add BR directly if there are no children
			element.innerHTML = '<br>'
		}
	}

	// Recursively check children
	Array.from(element.children).forEach(child => ensureBlockHeight(child))
}

/**
 * @deprecated Not used in the codebase
 * @param referenceNode target node *p* or a child thereof
 * @param insertableBlocks whose first child *p* should be merged with *node*
 * @returns The last inserted element (for cursor positioning)
 */
export const mergeFirstParagraph = (
	boudry: HTMLElement,
	referenceNode: Node,
	insertableBlocks: DocumentFragment
) => {
	if (insertableBlocks.children.length < 1) return null
	debugger
	const nodesInFirstBlock = insertableBlocks.children[0].childNodes
	let lastNodeToInsert = nodesInFirstBlock[nodesInFirstBlock.length - 1]
	const nodesAsFragment = document.createDocumentFragment()
	nodesAsFragment.append(...nodesInFirstBlock)
	insertAfter(nodesAsFragment, referenceNode)

	if (insertableBlocks.children.length === 1) return lastNodeToInsert
	// how does this pass
	console.log(insertableBlocks.children.length === 1, insertableBlocks.children.length)
	const paragraphBlockRef = getMainParentBlock(referenceNode, boudry)
	const remainingFrag = document.createDocumentFragment()
	remainingFrag.append(...Array.from(insertableBlocks.childNodes).slice(1))
	insertAfter(remainingFrag, paragraphBlockRef!)

	// Return the last inserted block element
	return (insertableBlocks.lastChild as Element) || paragraphBlockRef
}
