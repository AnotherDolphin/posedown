/**
 * List-specific keyboard handlers
 * Called by general keyboard handlers in dom.ts
 */

/**
 * Handles Backspace key press within a list item
 * - If list item is empty: converts list item to paragraph
 * - Otherwise: allows default backspace behavior
 * @param selection - Current selection
 * @param listItem - The current list item element
 * @returns true if handled
 */
export const handleBackspaceInListItem = (
	selection: Selection,
	listItem: HTMLLIElement
): boolean => {
	const isEmpty = listItem.textContent?.trim() === ''

	// Only handle backspace in empty list items
	if (isEmpty) {
		// Convert the list item to a paragraph (similar to Enter key behavior)
		const parentList = listItem.parentElement // <ul> or <ol>
		if (!parentList) return false

		const newP = document.createElement('p')
		newP.appendChild(document.createElement('br'))

		// Insert the new paragraph after the list (same as Enter behavior)
		parentList.after(newP)

		// Remove the empty list item
		listItem.remove()

		// If the list is now empty, remove it too
		if (parentList.children.length === 0) {
			parentList.remove()
		}

		selection.collapse(newP, 0)
		return true
	}

	return false
}

/**
 * Handles Enter key press within a list item
 * - If list item is empty: exits the list and creates a new paragraph
 * - If list item has content: creates a new list item
 * @param selection - Current selection
 * @param listItem - The current list item element
 * @returns true if handled
 */
export const handleEnterInListItem = (
	selection: Selection,
	listItem: HTMLLIElement
): boolean => {
	const range = selection.getRangeAt(0)
	const isEmpty = listItem.textContent?.trim() === ''

	if (isEmpty) {
		const parentList = listItem.parentElement // <ul> or <ol>
		if (!parentList) return false

		// Check if there are list items after this one
		const itemsAfter: HTMLLIElement[] = []
		let sibling = listItem.nextElementSibling
		while (sibling) {
			if (sibling.tagName === 'LI') {
				itemsAfter.push(sibling as HTMLLIElement)
			}
			sibling = sibling.nextElementSibling
		}

		// Remove the empty list item
		listItem.remove()

		// Create the paragraph
		const newP = document.createElement('p')
		newP.appendChild(document.createElement('br'))

		if (itemsAfter.length > 0) {
			// Break the list: create a new list for items after the empty one
			const newList = document.createElement(parentList.tagName.toLowerCase()) as HTMLUListElement | HTMLOListElement

			// Move all items after to the new list
			itemsAfter.forEach(item => {
				newList.appendChild(item)
			})

			// Insert P and new list after the original list
			parentList.after(newP)
			newP.after(newList)
		} else {
			// No items after: just add P after the list
			parentList.after(newP)

			// If the list is now empty, remove it
			if (parentList.children.length === 0) {
				parentList.remove()
			}
		}

		selection.collapse(newP, 0)
		return true
	}

	// Create a new list item with content after cursor
	const afterRange = range.cloneRange()
	afterRange.selectNodeContents(listItem)
	afterRange.setStart(range.endContainer, range.endOffset)
	const contentToMove = afterRange.extractContents()

	const newLi = document.createElement('li')
	if (contentToMove.textContent?.trim()) {
		newLi.appendChild(contentToMove)
	} else {
		newLi.appendChild(document.createElement('br'))
	}

	listItem.after(newLi)
	selection.collapse(newLi, 0)

	return true
}

/** genai
 * Handles Tab key press within a list item
 * Creates nested list by indenting current item under previous sibling
 * @param selection - Current selection
 * @param listItem - The current list item element
 * @returns true if handled
 */
export const handleTabInListItem = (
	selection: Selection,
	listItem: HTMLLIElement
): boolean => {
	// Find previous sibling list item
	const prevSibling = listItem.previousElementSibling
	if (!prevSibling || prevSibling.tagName !== 'LI') {
		// No previous sibling to nest under - do nothing
		return false
	}

	const parentList = listItem.parentElement
	if (!parentList) return false

	// Save cursor position before moving
	const anchorNode = selection.anchorNode
	const anchorOffset = selection.anchorOffset

	// Get list type from parent (UL or OL)
	const listType = parentList.tagName.toLowerCase() as 'ul' | 'ol'

	// Check if previous sibling already has a nested list
	let nestedList = Array.from(prevSibling.children).find(
		child => child.tagName === 'UL' || child.tagName === 'OL'
	) as HTMLUListElement | HTMLOListElement | undefined

	// Create nested list if it doesn't exist
	if (!nestedList) {
		nestedList = document.createElement(listType)
		prevSibling.appendChild(nestedList)
	}

	// Move current item into nested list
	nestedList.appendChild(listItem)

	// Restore cursor position (the node references are still valid after moving)
	if (anchorNode && listItem.contains(anchorNode)) {
		selection.collapse(anchorNode, anchorOffset)
	} else {
		// Fallback: place cursor at start if original position is lost
		selection.collapse(listItem, 0)
	}

	return true
}

/**
 * Handles Shift+Tab key press within a list item
 * Unindents nested list item, or exits list if at root level
 * @param selection - Current selection
 * @param listItem - The current list item element
 * @returns true if handled
 */
export const handleShiftTabInListItem = (
	selection: Selection,
	listItem: HTMLLIElement
): boolean => {
	const parentList = listItem.parentElement // <ul> or <ol>
	if (!parentList) return false

	// Save cursor position before moving
	const anchorNode = selection.anchorNode
	const anchorOffset = selection.anchorOffset

	// Check if this is a nested list (parent list is inside another LI)
	const parentListItem = parentList.parentElement
	const isNested = parentListItem?.tagName === 'LI'

	if (isNested) {
		// UNINDENT: Move item to grandparent list (after parent LI)
		const grandparentList = parentListItem.parentElement
		if (!grandparentList) return false

		// Insert current item after the parent LI in grandparent list
		parentListItem.after(listItem)

		// Clean up: remove parent list if now empty
		if (parentList.children.length === 0) {
			parentList.remove()
		}

		// Restore cursor position
		if (anchorNode && listItem.contains(anchorNode)) {
			selection.collapse(anchorNode, anchorOffset)
		} else {
			// Fallback: place cursor at start if original position is lost
			selection.collapse(listItem, 0)
		}
		return true
	}

	// EXIT LIST: At root level, convert to paragraph
	const newP = document.createElement('p')

	// Move all content from LI to P (but skip nested lists)
	const childrenToMove: Node[] = []
	for (const child of Array.from(listItem.childNodes)) {
		const element = child as HTMLElement
		if (element.tagName !== 'UL' && element.tagName !== 'OL') {
			childrenToMove.push(child)
		}
	}

	childrenToMove.forEach(child => newP.appendChild(child))

	// If paragraph is empty, add BR to maintain height
	if (!newP.textContent?.trim()) {
		newP.appendChild(document.createElement('br'))
	}

	// Insert paragraph after the list
	parentList.after(newP)

	// Remove the list item
	listItem.remove()

	// If the list is now empty, remove it
	if (parentList.children.length === 0) {
		parentList.remove()
	}

	// Restore cursor position in the new paragraph
	if (anchorNode && newP.contains(anchorNode)) {
		selection.collapse(anchorNode, anchorOffset)
	} else {
		// Fallback: place cursor at start if original position is lost
		selection.collapse(newP, 0)
	}

	return true
}
