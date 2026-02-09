import { getMainParentBlock, insertAfter } from './dom'
import { getDomRangeFromContentOffsets } from '../dom/util'

/**
 * Container elements that don't directly hold text content
 * Cursor should be placed inside their last editable child instead
 */
const CONTAINER_ONLY_TAGS = ['UL', 'OL'] as const

/**
 * Recursively finds the last editable descendant of a node
 * For container-only elements (UL, OL), descends into last child
 * @param node - The node to search from
 * @returns The last editable descendant
 */
function getLastTextDescendant(node: Node): Node {
	// If it's an element and a container-only tag, recurse into last child
	if (
		node.nodeType === Node.ELEMENT_NODE
		// &&
		// CONTAINER_ONLY_TAGS.includes((node as Element).tagName as any)
	) {
		const lastChild = node.lastChild
		if (lastChild) {
			return getLastTextDescendant(lastChild)
		}
	}
	return node
}

/**
 * Positions the cursor at the end of a node's content; in the last text node descendant.
 * Preffered even for exit cases because it allows onSelectionChange to properly set correct marks
 * Handles both nodes with children and empty nodes automatically.
 * @param node - The node to position cursor at end of
 * @param selection - selection object
 * @returns true if successful, false if failed
 */
export function setCaretAtEnd(node: Node, selection: Selection) {
	// Find the actual editable location (descends into containers like UL/OL)
	const targetNode = getLastTextDescendant(node)

	const newRange = document.createRange()

	// If the node has children, select its contents and collapse to end
	if (targetNode.childNodes.length > 0) {
		newRange.selectNodeContents(targetNode)
		newRange.collapse(false)
	} else {
		// For empty elements, place cursor after the node
		// newRange.setStartAfter(targetNode)
		// newRange.collapse(true)
		// set caret inside the empty node at the end
		newRange.setStart(targetNode, targetNode.textContent?.length || 0)
		// newRange.collapse(true)

		// newRange.collapse(false)
	}

	selection.removeAllRanges()
	selection.addRange(newRange)
}

/**
 * @deprecated using setCaretAtEnd instead to allow onSelectionChange to set marks properly
 * Positions cursor immediately after a node.
 * Creates an exit text node to ensure proper cursor positioning
 * outside inline elements (bold, italic, etc.).
 *
 * @param node - The node to position cursor after
 * @param selection - Optional selection object (defaults to window.getSelection())
 * @returns The created exit text node, or null if failed
 */
export function setCaretAfterExit(node: Node, selection: Selection): Text | null {
	// Create exit text node to position cursor outside inline elements
	const exitTextNode = document.createTextNode('')
	insertAfter(exitTextNode, node)

	const newRange = document.createRange()
	newRange.setStart(exitTextNode, 0)
	newRange.collapse(true)

	selection.removeAllRanges()
	selection.addRange(newRange)

	return exitTextNode
}

/**
 * Sets cursor position directly after a node without creating exit nodes.
 * Used when you want cursor immediately after an element without intermediary text.
 *
 * @deprecated setCaretAtEnd is safer
 * @param node - The node to position cursor after
 * @param selection - Optional selection object (defaults to window.getSelection())
 * @returns true if successful, false if failed
 */
export function setCaretAfter(node: Node, selection: Selection) {
	// Reuse existing range if available, otherwise create new one
	const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : document.createRange()
	range.setStartAfter(node)
	range.collapse(true)

	// Only update selection if we created a new range // this makes all tests pass
	// if (selection.rangeCount === 0) {
	// 	selection.addRange(range)
	// }
	selection.removeAllRanges()
	selection.addRange(range)
}

/**
 * escapes caret "style persistence" madness
 */
export async function escapeCaretStyle(
	node: Node,
	selection: Selection,
	editable: HTMLElement
): Promise<Text | null> {
	const exitTextNode = document.createTextNode('\u200C')
	insertAfter(exitTextNode, node)

	let newRange = document.createRange()
	// newRange.setStart(exitTextNode.parentNode || document, 0)

	await new Promise(resolve => setTimeout(resolve, 0)) // this makes it work; node removed (backspace) by event loop first to stop style persistence

	newRange.setStart(exitTextNode, 1)
	exitTextNode.textContent = ''
	newRange.collapse(true)

	// save block from collapsing; dafault <br> insertion doesn't work here because of inserted text node
	const isEmptyBlock = getMainParentBlock(exitTextNode, editable)?.textContent
	if (isEmptyBlock == '') exitTextNode.replaceWith(document.createElement('br'))

	selection.removeAllRanges()
	selection.addRange(newRange)

	return exitTextNode
}

/**
 * Sets the caret at a specific offset within a target node.
 * Handles both text nodes and element nodes by converting content offset to proper DOM position.
 *
 * @param targetNode - The node to position the caret in
 * @param offset - The character offset within the node's text content
 * @param selection - The selection object to update
 */
export function setCaretAt(targetNode: Node | HTMLElement, offset: number): void {
	const range = getDomRangeFromContentOffsets(targetNode, offset)
	range.collapse(true)
	const sel = window.getSelection()
	sel?.removeAllRanges()
	sel?.addRange(range)
}
