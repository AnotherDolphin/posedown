import { markdownToDomFragment } from '../transforms/ast-utils'
import { isBlockTagName } from './block-marks'
import { findFirstMarkdownMatch } from './inline-patterns'
import {
	handleEnterInListItem,
	handleBackspaceInListItem,
	handleTabInListItem,
	handleShiftTabInListItem
} from './list-handler'
import { setCaretAfter, setCaretAfterExit, escapeCaretStyle, setCaretAtEnd } from './selection'

/**
 * Type guard to check if a node is an Element node
 */
const isElement = (n: Node): n is Element => n.nodeType === Node.ELEMENT_NODE

/**
 * @deprecated Not used in the codebase
 * Derives a child node ID from its parent's data-token-id attribute
 * Used for text nodes that can't have attributes but need IDs for hast mapping
 * @param node - The child node to derive an ID for
 * @returns The derived ID string or null if parent has no token ID
 */
export const deriveChildNodeId = (node: Node): string | null => {
	const parent = node.parentNode
	if (!parent || !isElement(parent)) return null
	const parentTokenId = parent.getAttribute('data-token-id')
	if (!parentTokenId) return null
	const childIdx = Array.from(parent.childNodes).indexOf(node as ChildNode)
	return `${parentTokenId}.${childIdx}`
}

/**
 * Inline formatted element tag names that have markdown syntax equivalents
 * Only includes markdown-supported tags:
 * - STRONG (**text**), EM (*text*), CODE (`code`), S/DEL (~~text~~)
 * - Excludes U (underline) which is HTML-only, not standard markdown
 */
export const INLINE_FORMATTED_TAGS = ['STRONG', 'EM', 'CODE', 'S', 'DEL'] as const
export const isStyledTagName = (tagName: string): tagName is (typeof INLINE_FORMATTED_TAGS)[number] => {
	return (INLINE_FORMATTED_TAGS as readonly string[]).includes(tagName)
}

/**
 * Block formatted element tag names that have visible markdown prefix marks
 * Subset of BLOCK_TAG_NAMES - only elements with markdown delimiters to display:
 * - H1-H6 (have # marks), BLOCKQUOTE (has >), LI (has - or 1.)
 * - Excluded: P (no marks to show), PRE (code blocks handled separately), UL/OL (containers, LI has the mark)
 */
export const BLOCK_FORMATTED_TAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI'] as const

/**
 * Prevents the contentEditable from becoming empty or having a non-P block as the only element
 * When deleting would leave an empty non-P block, replaces it with <p><br></p> instead
 * @param editable contentEditable element reference
 * @param e optional event reference for preventDefault (if called from keydown)
 */
export const preserveOneChild = (editable: HTMLElement | undefined, e?: KeyboardEvent) => {
	if (!editable || editable.children.length !== 1) return

	const child = editable.children[0] as HTMLElement
	const isEmpty = child.innerText.trim().length === 0
	const isBlockElement = isBlockTagName(child.tagName)

	if (isBlockElement && isEmpty) {
		// Only prevent default if event is provided (keydown scenario)
		// If called from onInput, event will be undefined
		if (e) e.preventDefault()

		// If it's already a P, just ensure it has a br
		if (child.tagName === 'P') {
			if (!child.querySelector('br')) child.appendChild(document.createElement('br'))
		} else {
			// Replace any other block element (H1-H6, etc.) with a P
			const newP = document.createElement('p')
			newP.appendChild(document.createElement('br'))
			child.replaceWith(newP)

			// Move cursor to the new paragraph
			const selection = window.getSelection()
			if (selection) {
				selection.collapse(newP, 0)
			}
		}
	}
}

/**
 * Finds the first ancestor element that is a styled element (bold, italic, etc.)
 * @param node - Starting node to search from
 * @param boundary - Optional boundary element to stop searching at (e.g., contentEditable root)
 * @returns The first styled ancestor or null if none found
 */
const getStyledAncestor = (node: Node, boundary?: Element): Element | null => {
	let current: Node | null = node
	while (current && current !== boundary) {
		if (current.nodeType === Node.ELEMENT_NODE) {
			const element = current as Element
			if (INLINE_FORMATTED_TAGS.includes(element.tagName as any)) {
				return element
			}
		}
		current = current.parentNode
	}
	return null
}

/**
 * Heuristic: determine whether the current Backspace action will remove
 * all the text content of a styled element.
 * Covers these cases:
 * - selection explicitly covers the styled element's contents
 * - caret collapsed and only 1 char remains
 * - ctrl/meta+Backspace at end of a single-word styled element
 */
const willBackspaceRemoveAllStyledText = (
	selection: Selection,
	styledElement: Element,
	e: KeyboardEvent
): boolean => {
	if (selection.rangeCount === 0) return false

	const range = selection.getRangeAt(0)

	// If there's an explicit selection, check if it covers the styled element.
	if (!selection.isCollapsed) {
		const styledRange = document.createRange()
		styledRange.selectNodeContents(styledElement)

		try {
			if (
				range.compareBoundaryPoints(Range.START_TO_START, styledRange) <= 0 &&
				range.compareBoundaryPoints(Range.END_TO_END, styledRange) >= 0
			) {
				return true
			}
		} catch (err) {
			// If compareBoundaryPoints throws for odd ranges, fall through to string check
		}

		// As a fallback, compare selected text with styled text
		const selText = range.toString() || ''
		const styledText = styledElement.textContent || ''
		if (selText.length > 0 && selText === styledText) return true

		return false
	}

	// Collapsed selection (caret). If only one char remains, Backspace will remove it.
	const styledText = styledElement.textContent || ''
	if (styledText.length === 0) return false
	if (styledText.length === 1) return true

	// Handle ctrl/meta+Backspace: if caret is at the end of a single-word styled element,
	// deleting the previous word will remove the whole element.
	if (e.ctrlKey || e.metaKey) {
		const anchorNode = selection.anchorNode
		if (!anchorNode) return false

		const r = document.createRange()
		try {
			r.setStart(styledElement, 0)
			r.setEnd(anchorNode, selection.anchorOffset)
		} catch (err) {
			return false
		}

		const caretOffset = r.toString().length
		// single-word heuristic: no spaces inside and caret at end
		if (caretOffset === styledText.length && styledText.trim().indexOf(' ') === -1) {
			return true
		}
	}

	return false
}

/**
 * Insert a node after another
 * @param target
 * @param newSibling to be inserted
 */
export const insertAfter = (newSibling: Node, target: Node) => {
	if (target.nextSibling) {
		target.parentNode?.insertBefore(newSibling, target.nextSibling)
	} else {
		target.parentNode?.appendChild(newSibling)
	}
}

/**
 * Finds the closest ancestor element matching a tag name
 * @param node - Starting node
 * @param tagName - Tag name to search for (e.g., 'LI', 'UL', 'P')
 * @param boundary - Boundary element to stop searching at
 * @returns The closest matching ancestor or null
 */
export const getAncestorByTag = <T extends HTMLElement = HTMLElement>(
	node: Node,
	tagName: string,
	boundary: Element
): T | null => {
	let current: Node | null = node
	while (current && current !== boundary) {
		if (current.nodeType === Node.ELEMENT_NODE && (current as Element).tagName === tagName) {
			return current as T
		}
		current = current.parentNode
	}
	return null
}

export const getMainParentBlock = (node: Node, boundry: Element): HTMLElement | null => {
	if (node === boundry) {
		// issue: this means that the editable div itself is being anchored!
		// this happens when operating over multiple blocks (like select all + paste)
	}
	let parent: Node | null = node
	while (parent && parent.parentNode !== boundry) parent = parent.parentNode
	return parent as HTMLElement
}

/**
 * Check if list pattern transformation should be allowed in a list item
 * Prevents ghost nesting (single empty LI) and inline transformations
 * @param listItem - The list item to check
 * @param textContent - The text content to check against pattern
 * @returns true if transformation should be allowed
 */
export const shouldAllowListTransform = (listItem: HTMLLIElement, textContent: string): boolean => {
	const liText = textContent.trim()

	// Check if LI only contains the list pattern (e.g., "- " or "1. ")
	const isOnlyListPattern = /^[-*+]\s*$|^\d+\.\s*$/.test(liText)

	// Check for siblings with actual content
	const parentList = listItem.parentElement
	const hasSiblingsWithContent = parentList && Array.from(parentList.children).some(
		(li) => li !== listItem && li.textContent?.trim()
	)

	// Allow only if: contains only pattern AND has siblings with content
	return isOnlyListPattern && Boolean(hasSiblingsWithContent)
}

/**
 * Handles Enter key press to ensure new blocks are always <p> elements
 * Prevents browser from creating <div> elements in contentEditable
 * Also overrides Shift+Enter in headers to behave like normal Enter
 * Special handling for list items to create new <li> or exit lists
 * @param editable - contentEditable element reference
 * @param e - keyboard event
 */
export const handleEnterKey = (editable: HTMLElement, e: KeyboardEvent): boolean => {
	const selection = window.getSelection()
	if (!selection || !selection.anchorNode) return false

	// Check if we're in a list item
	const listItem = getAncestorByTag<HTMLLIElement>(selection.anchorNode, 'LI', editable)
	if (listItem && !e.shiftKey) {
		e.preventDefault()
		return handleEnterInListItem(selection, listItem)
	}

	const currentBlock = getMainParentBlock(selection.anchorNode, editable)
	const isHeader = currentBlock && /^H[1-6]$/.test(currentBlock.tagName)

	// Override default behavior for Enter on any block, or Shift+Enter on a header.
	// Allow default behavior (line break) for Shift+Enter on non-header blocks.
	// reason: entering from a non-P element causes DIV nodes by default
	if (!currentBlock || (!isHeader && e.shiftKey)) {
		return false
	}

	e.preventDefault()

	const range = selection.getRangeAt(0)

	// Extract content that will be moved to the new paragraph
	const afterRange = range.cloneRange()
	afterRange.selectNodeContents(currentBlock)
	afterRange.setStart(range.endContainer, range.endOffset)
	const contentToMove = afterRange.extractContents()

	// FIX: If currentBlock is now empty after extraction, add BR to preserve it
	if (!currentBlock.textContent?.trim()) {
		currentBlock.innerHTML = '<br>'
	}

	// Create the new paragraph and add content or a <br>
	const newP = document.createElement('p')
	if (contentToMove.textContent?.trim()) {
		newP.appendChild(contentToMove)
	} else {
		newP.appendChild(document.createElement('br'))
	}

	// Insert the new paragraph and move the cursor
	currentBlock.after(newP)
	selection.collapse(newP, 0)

	return true
}

/**
 * Checks if the editor is effectively empty (no content or only empty blocks)
 */
export function isEditorEmpty(editor: HTMLElement): boolean {
	const text = editor.textContent?.trim()

	// Completely empty - no text and no children
	if (!text && editor.children.length === 0) return true

	// Only empty blocks (like <h1><br></h1> or <p></p>)
	if (!text && editor.children.length === 1) {
		const child = editor.children[0]
		return child.textContent?.trim() === ''
	}

	return false
}

/**
 * Handles Backspace key press for list items
 * Allows escaping from lists by backspacing in empty list items
 * @param editable - contentEditable element reference
 * @param e - keyboard event
 * @returns true if handled, false otherwise
 */
export const handleBackspaceKey = (editable: HTMLElement, e: KeyboardEvent): boolean => {
	const selection = window.getSelection()
	if (!selection || !selection.anchorNode) return false

	// handle if we're in a list item
	const listItem = getAncestorByTag<HTMLLIElement>(selection.anchorNode, 'LI', editable)
	if (listItem) {
		const handled = handleBackspaceInListItem(selection, listItem)
		if (handled) {
			e.preventDefault()
		}
		return handled
	}

	// escape style persistence if backspacing would remove all text in a styled element
	const styledElement = getStyledAncestor(selection.anchorNode, editable)
	if (styledElement) {
		const willRemoveAll = willBackspaceRemoveAllStyledText(selection, styledElement, e)
		if (willRemoveAll) {
			console.log('emptied')
			escapeCaretStyle(styledElement, selection, editable) // issue: doesn't work with LI element
		}
		// return true?
	}

	return false
}

/**
 * Handles Tab key press
 * - In list items: indents item (creates nested list under previous sibling)
 * - Outside lists: prevent default (no tab navigation in editor)
 * @param editable - contentEditable element reference
 * @param e - keyboard event
 * @returns true if handled, false otherwise
 */
export const handleTabKey = (editable: HTMLElement, e: KeyboardEvent): boolean => {
	const selection = window.getSelection()
	if (!selection || !selection.anchorNode) return false

	// Check if we're in a list item
	const listItem = getAncestorByTag<HTMLLIElement>(selection.anchorNode, 'LI', editable)

	if (listItem) {
		// Handle Tab in list item (indent/nest)
		return handleTabInListItem(selection, listItem)
	}

	// Not in list - prevent tab navigation but don't insert tab character
	return false
}

/**
 * Handles Shift+Tab key press
 * - In nested list items: unindents to parent level
 * - In root list items: exits list (converts to paragraph)
 * - Outside lists: no action
 * @param editable - contentEditable element reference
 * @param e - keyboard event
 * @returns true if handled, false otherwise
 */
export const handleShiftTabKey = (editable: HTMLElement, e: KeyboardEvent): boolean => {
	const selection = window.getSelection()
	if (!selection || !selection.anchorNode) return false

	// Check if we're in a list item
	const listItem = getAncestorByTag<HTMLLIElement>(selection.anchorNode, 'LI', editable)

	if (listItem) {
		// Handle Shift+Tab in list item (unindent or exit)
		return handleShiftTabInListItem(selection, listItem)
	}

	// Not in list - no special behavior
	return false
}

/**
 * Check if HTML contains semantic formatting tags (as opposed to just styled divs/spans).
 * This helps distinguish between rich text (Google Docs, Word) and syntax-highlighted code (VS Code).
 */
export function hasSemanticTags(html: string): boolean {
	const semanticTags = [
		'<strong',
		'<b>', // bold
		'<em>',
		'<i>', // italic
		'<code>', // inline code
		'<pre>', // code blocks
		'<h1>',
		'<h2>',
		'<h3>', // headings
		'<h4>',
		'<h5>',
		'<h6>',
		'<ul>',
		'<ol>',
		'<li>', // lists
		'<blockquote>', // quotes
		'<a ', // links
		'<del>',
		'<s>', // strikethrough
		'<u>', // underline
		'<mark>', // highlight
		'<sub>',
		'<sup>', // subscript/superscript
		'<p>' // paragraphs (from rich editors)
	]

	const lowerHtml = html.toLowerCase()
	return semanticTags.some(tag => lowerHtml.includes(tag))
}

/** todo: revisit
 * Process markdown patterns found in text nodes within a DOM fragment.
 * This handles mixed content like: <strong>**code**</strong> (bold HTML with markdown inside).
 * Recursively processes text nodes to transform embedded markdown syntax.
 */
export function processMarkdownInTextNodes(node: Node): void {
	// Collect all text nodes first (to avoid modifying while iterating)
	const textNodes: Text[] = []
	const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)

	let currentNode: Node | null
	while ((currentNode = walker.nextNode())) {
		if (currentNode.nodeType === Node.TEXT_NODE) {
			textNodes.push(currentNode as Text)
		}
	}

	// Process each text node for markdown patterns
	textNodes.forEach(textNode => {
		const text = textNode.textContent || ''
		const match = findFirstMarkdownMatch(text)

		if (match && textNode.parentNode) {
			// Found markdown - transform it
			const { fragment } = markdownToDomFragment(match.text)
			const parent = textNode.parentNode

			// Split text node: [before] [markdown] [after]
			const before = text.slice(0, match.start)
			const after = text.slice(match.end)

			// Insert parts in order
			if (before) {
				parent.insertBefore(document.createTextNode(before), textNode)
			}
			parent.insertBefore(fragment, textNode)
			if (after) {
				const afterNode = document.createTextNode(after)
				parent.insertBefore(afterNode, textNode)
				// Recursively process the "after" text for more markdown
				processMarkdownInTextNodes(afterNode)
			}

			// Remove original text node
			parent.removeChild(textNode)
		}
	})
}

/** gemini
 * Creates a DOM Range based on global offsets within a block element.
 * This decouples pattern detection (string-based) from DOM structure (node-based).
 */
export const getRangeFromBlockOffsets = (
	block: Node,
	startOffset: number,
	endOffset: number
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

			// Determine Start
			if (!startFound && startOffset >= currentGlobalOffset && startOffset < nextGlobalOffset) {
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

	traverse(block)

	// Fallback: If indices were out of bounds (shouldn't happen with valid matches), collapse to end
	if (!startFound) range.setStart(block, 0)
	if (!endFound) range.setEnd(block, block.childNodes.length)

	return range
}

// Helper to compare and swap nodes while tracking the cursor's logical target
export const smartReplaceChildren = (
	parent: HTMLElement,
	newFragment: DocumentFragment | Node,
	selection: Selection
) => {
	const oldNodes = Array.from(parent.childNodes)
	const newNodes = Array.from(newFragment.childNodes)

	// We need to track if the cursor was in a node that got replaced
	const anchorNode = selection.anchorNode
	let cursorRestored = false
	let cursorFound = false
	let anchorOffset = selection.anchorOffset

	// 1. Iterate over the larger list (usually lists are similar length)
	const maxLength = Math.max(oldNodes.length, newNodes.length)

	for (let i = 0; i < maxLength; i++) {
		const oldNode = oldNodes[i]
		const newNode = newNodes[i]

		// Case A: End of new list (New content is shorter) -> Remove old remaining
		if (!newNode) {
			if (oldNode) oldNode.remove()
			continue
		}

		// Case B: End of old list (New content is longer) -> Append new
		if (!oldNode) {
			parent.appendChild(newNode)
			// If we haven't restored cursor and this is the last added node, put it here
			if (!cursorRestored && i === newNodes.length - 1) {
				setCaretAtEnd(newNode, selection)
				cursorRestored = true
			}
			continue
		}

		// Case C: Nodes are Identical -> Do Nothing (Preserve Ref & Cursor)
		// isEqualNode checks attributes, tag name, and text content (recursively)
		if (oldNode.isEqualNode(newNode)) {
			// Check if cursor was here. If so, it's already safe because we didn't touch the node!
			if (anchorNode && (oldNode === anchorNode || oldNode.contains(anchorNode))) {
				cursorRestored = true
			}
			continue
		}

		// Case D: Nodes are Different -> Replace
		// 1. Check if cursor was inside the old node before we destroy it
		const hadCursor = anchorNode && (oldNode === anchorNode || oldNode.contains(anchorNode))

		// 2. Swap
		parent.replaceChild(newNode, oldNode)

		// 3. Restore Cursor
		if (hadCursor || (cursorFound && !cursorRestored)) {
			// #issue: if a node was split into two, cursor goes to end of the first new node, not where it was logically (ex. typing at the end makes it jump to start of a new word)
			// Heuristic: Place cursor at the END of the NEW node.
			// This is perfect for "typing at the end" (creation).
			// It is acceptable for "editing in middle" (jumps to end of current word).
			console.log(newNode.textContent?.length, anchorOffset)
			// Adjust anchorOffset for next nodes if cursor was beyond this node
			if (anchorOffset > newNode.textContent?.length!) {
				cursorFound = true
				anchorOffset -= newNode.textContent?.length!
			} else {
				setCaretAtEnd(newNode, selection)
				cursorRestored = true
			}
		}
	}

	// Fallback: If cursor was somehow lost (e.g. structure changed drastically),
	// put it at the end of the block.
	if (!cursorRestored) {
		const last = parent.lastChild || parent
		setCaretAtEnd(last, selection)
	}
}

// ================================== deferred genai ==================================

export function endsWithValidDelimiter(text: string): boolean {
	// Symmetric delimiters (can be opener or closer)
	const symmetric = ['**', '*', '__', '_', '~~', '`', '==', '^', '~']

	// Block markers (need space)
	const blockWithSpace = ['# ', '## ', '### ', '- ', '+ ', '* ', '> ']

	// Ordered list: /\d+\. $/
	if (/\d+\. $/.test(text)) return true

	return [...symmetric, ...blockWithSpace].some(d => text.endsWith(d))
}
