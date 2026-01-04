import type { SerializedSelection } from './types'

/**
 * Converts a DOM node to a path of child indices relative to a root element.
 * Path is an array where each number represents the child index at that level.
 *
 * Example: [0, 2, 1] means root.childNodes[0].childNodes[2].childNodes[1]
 *
 * @param node - The node to get the path for
 * @param root - The root element to calculate path relative to
 * @returns Array of child indices, or empty array if node is not in root
 */
function getNodePath(node: Node, root: HTMLElement): number[] {
	const path: number[] = []
	let current: Node | null = node

	while (current && current !== root) {
		const parent: Node | null = current.parentNode
		if (!parent) break

		const index = Array.from(parent.childNodes).indexOf(current as ChildNode)
		if (index === -1) break // Node not found in parent (shouldn't happen)

		path.unshift(index)
		current = parent
	}

	return path
}

/**
 * Restores a node from a path of child indices.
 *
 * @param path - Array of child indices
 * @param root - The root element to traverse from
 * @returns The node at the path, or null if path is invalid
 */
function getNodeFromPath(path: number[], root: HTMLElement): Node | null {
	let node: Node = root

	for (let i = 0; i < path.length; i++) {
		const index = path[i]

		if (!node.childNodes || index >= node.childNodes.length) {
			console.error(`[Selection] Path invalid at step ${i}: requested index ${index} but only ${node.childNodes?.length || 0} children available`)
			return null // Path is invalid (DOM changed)
		}

		node = node.childNodes[index]
	}

	return node
}

/**
 * Serializes the current selection to a format that can be restored later.
 * Uses node paths instead of direct node references so it works after DOM changes.
 *
 * @param selection - The Selection object to serialize
 * @param root - The root element to calculate paths relative to
 * @returns Serialized selection, or null if selection is invalid
 */
export function serializeSelection(
	selection: Selection,
	root: HTMLElement
): SerializedSelection | null {
	if (!selection.anchorNode || !selection.focusNode) {
		return null
	}

	// Check that selection is within root
	if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) {
		return null
	}

	const serialized = {
		anchorPath: getNodePath(selection.anchorNode, root),
		anchorOffset: selection.anchorOffset,
		focusPath: getNodePath(selection.focusNode, root),
		focusOffset: selection.focusOffset,
		isCollapsed: selection.isCollapsed
	}

	return serialized
}

/**
 * Restores a selection from its serialized form.
 *
 * @param serialized - The serialized selection to restore
 * @param root - The root element to restore selection within
 * @returns true if restoration succeeded, false otherwise
 */
export function restoreSelection(serialized: SerializedSelection, root: HTMLElement): boolean {
	const selection = window.getSelection()
	if (!selection) {
		console.error('[Selection] No selection object available')
		return false
	}

	// Get nodes from paths
	const anchorNode = getNodeFromPath(serialized.anchorPath, root)
	const focusNode = getNodeFromPath(serialized.focusPath, root)

	if (!anchorNode || !focusNode) {
		console.error('[Selection] Cannot restore - invalid node paths')
		return false // Paths are invalid (DOM structure changed too much)
	}

	const anchorLength = getNodeLength(anchorNode)
	const focusLength = getNodeLength(focusNode)
	const clampedAnchorOffset = Math.min(serialized.anchorOffset, anchorLength)
	const clampedFocusOffset = Math.min(serialized.focusOffset, focusLength)

	try {
		// Clear existing selection
		selection.removeAllRanges()

		// Create new range
		const range = document.createRange()

		// Set range based on whether selection is collapsed
		if (serialized.isCollapsed) {
			// Cursor position (not a range)
			range.setStart(anchorNode, clampedAnchorOffset)
			range.collapse(true)
		} else {
			// Selection range
			range.setStart(anchorNode, clampedAnchorOffset)
			range.setEnd(focusNode, clampedFocusOffset)
		}

		selection.addRange(range)
		return true
	} catch (error) {
		// Range creation can fail if offsets are invalid
		console.error('[Selection] Failed to restore selection:', error)
		return false
	}
}

/**
 * Gets the length of a node for clamping offsets.
 * For text nodes, returns text length. For elements, returns child count.
 *
 * @param node - The node to get length for
 * @returns The length/child count of the node
 */
function getNodeLength(node: Node): number {
	if (node.nodeType === Node.TEXT_NODE) {
		return (node as Text).length
	}
	return node.childNodes.length
}
