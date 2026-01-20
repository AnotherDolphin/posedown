export const getFirstTextNode = (node: Node): Text | null => {
	if (node.nodeType === Node.TEXT_NODE) return node as Text
	for (let i = 0; i < node.childNodes.length; i++) {
		const textNode = getFirstTextNode(node.childNodes[i])
		if (textNode) return textNode
	}
	return null
}

/**
 * Creates a DOM Range based on global offsets within a block element.
 * This decouples pattern detection (string-based) from DOM structure (node-based).

 * @param element - The node to traverse
 * @param startOffset - Global character offset for range start (0-indexed)
 * @param endOffset - Global character offset for range end (defaults to startOffset for collapsed range)
 * @returns A DOM Range object positioned at the specified offsets
 *
 */
export const getDomRangeFromContentOffsets = (
	element: Node,
	startOffset: number,
	endOffset: number = startOffset
): Range => {
	const range = document.createRange()
	let currentGlobalOffset = 0
	let startFound = false
	let endFound = false

	const traverse = (node: Node) => {
		if (startFound && endFound) return

		if (node.nodeType === Node.TEXT_NODE) {
			const nodeLength = node.textContent?.length || 0
			const nextGlobalOffset = currentGlobalOffset + nodeLength

			// Determine Start (use <= to handle cursor at end of text node; was < )
			if (!startFound && startOffset >= currentGlobalOffset && startOffset <= nextGlobalOffset) {
				range.setStart(node, startOffset - currentGlobalOffset)
				startFound = true
			}

			// Determine End
			// We use <= here because the end offset can be exactly at the end of a node
			if (!endFound && endOffset >= currentGlobalOffset && endOffset <= nextGlobalOffset) {
				range.setEnd(node, endOffset - currentGlobalOffset)
				endFound = true
			}

			currentGlobalOffset = nextGlobalOffset
		} else {
			// Recursively traverse element children
			for (let i = 0; i < node.childNodes.length; i++) {
				traverse(node.childNodes[i])
			}
		}
	}

	traverse(element)

	// Fallback: If indices were out of bounds (shouldn't happen with valid matches), collapse to end
	if (!startFound) range.setStart(element, 0)
	if (!endFound) range.setEnd(element, element.childNodes.length)

	return range
}
