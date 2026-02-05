import {
	// inlineMdToDom,
	markdownToHtml,
	markdownToDomFragment,
	htmlToMarkdown,
	htmlBlockToMarkdown,
	domFragmentToMarkdown
} from '$lib/core/transforms/ast-utils'
import { findFirstMarkdownMatch } from '$lib/core/utils/inline-patterns'
import { isBlockPattern, isListPattern } from '$lib/core/utils/block-patterns'
import {
	preserveOneChild,
	isInlineFormattedElement,
	insertAfter,
	getMainParentBlock,
	shouldAllowListTransform,
	handleEnterKey,
	handleBackspaceKey,
	handleTabKey,
	handleShiftTabKey,
	hasSemanticTags,
	processMarkdownInTextNodes,
	endsWithValidDelimiter,
	isEditorEmpty
} from '../core/utils/dom'
import { getDomRangeFromContentOffsets } from '../core/dom'
import { setCaretAtEnd } from '../core/utils/selection'
import { EditorHistory } from '../core/history'
import { FocusMarkManager } from '../core/utils/focus-mark-manager'
import { FOCUS_MARK_CLASS } from '../core/focus/utils'
import { findAndTransform, type TransformResult } from '$lib/core/transforms/transform'

// handle, enter on list, manually entering md syntax
// reason for observer reinteg. node level tree updates,
// focused node can display respective md sntax!

export class RichEditorState {
	rawMd = $state('')
	html = $state('')
	isDirty = $state(false)
	editableRef: HTMLDivElement | undefined = $state()
	lastSyncedAt = Date.now()
	private syncTimer: ReturnType<typeof setTimeout> | null = null
	marks: Array<Element | Node> | null = $state(null) // only a state for debugging with $inspect
	private history = new EditorHistory({ debug: false })
	private focusMarkManager = new FocusMarkManager()
	private hasInitialHistoryEntry = false

	constructor(markdown: string) {
		this.rawMd = markdown
		this.html = markdownToHtml(markdown)

		// Debug: Track marks state changes
		// $inspect(this.marks).with((type, marks) => {
		// 	console.log(`[MARKS ${type.toUpperCase()}]`, marks)
		// 	if (marks && marks.length > 0) {
		// 		console.log('  Elements:', marks.map(m => m.nodeName).join(' > '))
		// 	}
		// })

		$effect(() => {
			if (!this.editableRef) return

			// ciritical backup override if style missing
			this.editableRef.style.whiteSpace = 'break-spaces'

			this.editableRef.addEventListener('focus', this.onFocus)
			this.editableRef.addEventListener('blur', this.onBlur)
			this.editableRef.addEventListener('input', this.onInput)
			this.editableRef.addEventListener('paste', this.onPaste)
			this.editableRef.addEventListener('keydown', this.onKeydown)
			this.editableRef.addEventListener('beforeinput', this.onBeforeInput)
			document.addEventListener('selectionchange', this.onSelectionChange)
			return () => {
				this.editableRef?.removeEventListener('focus', this.onFocus)
				this.editableRef?.removeEventListener('blur', this.onBlur)
				this.editableRef?.removeEventListener('paste', this.onPaste)
				this.editableRef?.removeEventListener('input', this.onInput)
				this.editableRef?.removeEventListener('keydown', this.onKeydown)
				this.editableRef?.removeEventListener('beforeinput', this.onBeforeInput)
				document.removeEventListener('selectionchange', this.onSelectionChange)
			}
		})
	}

	private onPaste = (e: ClipboardEvent) => {
		e.preventDefault()
		this.isDirty = true

		// Save state BEFORE paste operation
		if (this.editableRef) {
			this.history.breakCoalescing(this.editableRef)
		}

		// Check for rich text (HTML) in clipboard
		const html = e.clipboardData?.getData('text/html')
		const text = e.clipboardData?.getData('text/plain') || ''

		// Convert HTML to markdown only if it has semantic tags (not just styled text)
		let sanitizedText: string
		if (html && html.trim() && hasSemanticTags(html)) {
			// HTML has semantic formatting tags (Google Docs, Word, etc.) - convert to markdown
			sanitizedText = htmlToMarkdown(html).trimStart()
		} else {
			// HTML is just styled text (VS Code syntax highlighting) or no HTML - use plain text
			sanitizedText = text.trimStart()
		}

		// serialze and transform
		const { fragment, isInline } = markdownToDomFragment(sanitizedText)

		// Process any embedded markdown in text nodes (e.g., <strong>**code**</strong>)
		processMarkdownInTextNodes(fragment)

		let insertables: Node | Element | DocumentFragment = fragment
		const lastInsertable = fragment.lastChild

		// get caret and selection props
		const selection = window.getSelection()
		if (!selection || !selection.anchorNode) return alert('void paste')

		const range = selection.getRangeAt(0)

		// empty nodes that will not be properly removed by range.deleteContents
		const deletables: ChildNode[] = []
		this.editableRef?.childNodes.forEach(child => {
			if (range.intersectsNode(child)) deletables.push(child)
		})

		range.deleteContents()
		deletables.forEach(d => d.textContent == '' && d.remove())

		// if inline AND the anchorNode == editableRef, wrap in P first
		if (isInline && this.editableRef === selection.anchorNode) {
			const temp = document.createElement('p')
			temp.append(...fragment.childNodes)
			insertables = temp
		}

		// if block AND the anchor is !== editableRef, merge first block
		else if (!isInline && this.editableRef !== selection.anchorNode) {
			const firstP = Array.from(fragment.firstChild?.childNodes || [])
			fragment.firstChild?.remove()
			;(fragment as DocumentFragment).prepend(...firstP)
		}

		range.insertNode(insertables)
		if (!lastInsertable) return
		setCaretAtEnd(lastInsertable, selection)

		// Prevent FocusMarks from appearing on just-pasted formatted elements
		this.focusMarkManager.skipNextFocusMarks = true

		// Save state AFTER paste completes
		if (this.editableRef) {
			this.history.push(this.editableRef)
		}
	}

	// inline markdown detection, transformation, and post-render cursor pos
	private onInput = async (e: Event) => {
		this.isDirty = true
		const selection = window.getSelection()
		if (!selection || !selection.anchorNode || !this.editableRef) return false

		// Handle both block and inline focus mark changes
		if (this.focusMarkManager.onEdit(selection)) {
			this.history.push(this.editableRef)
			return
		}

		// =========================== NORMAL FLOW MD PATTERN DETECTION & TRANSFORMATION ===========================

		// future: optimize to only check current node for new marks instead of checking whole block
		const transformResult = findAndTransform(this.editableRef)
		if (transformResult) {
			const { caretOffset, newBlock } = transformResult
			if (newBlock && caretOffset !== undefined) {
				setCaretAtEnd(newBlock, selection) // temporary for correct focus .update call
				this.focusMarkManager.onRefocus(selection, this.editableRef)
				const range = getDomRangeFromContentOffsets(newBlock, caretOffset, caretOffset)
				selection.removeAllRanges()
				selection.addRange(range)
			}

			// Prevent FocusMarks from appearing on the just-transformed element
			// They should only appear when user navigates BACK to an existing element
			this.focusMarkManager.skipNextFocusMarks = true
			this.history.push(this.editableRef)
			return
		}

		this.history.pushCoalesced(this.editableRef)
	}

	// Handles all text input: edge delimiters, marks escape, and history coalescing
	private onBeforeInput = (e: InputEvent) => {
		if (e.inputType !== 'insertText' || !e.data || !this.editableRef) return

		const selection = window.getSelection()
		if (!selection?.anchorNode) return

		// 1. Edge delimiter handling and escape behavior

		// 1a. Block delimiter upgrade/escape (e.g., typing # at edge of # to make ##, or escaping to content)
		if (this.focusMarkManager.handleBlockMarkEdges(selection, e.data)) {
			e.preventDefault()
			this.history.push(this.editableRef)
			return
		}

		// 1b. Inline delimiter upgrade (e.g., typing * at edge of *italic* to make **bold**)
		if (this.focusMarkManager.handleInlineMarkEdges(selection, e.data)) {
			e.preventDefault()
			this.history.push(this.editableRef)
			return
		}

		// 2. Marks escape - exit styled element when typing at end
		if (this.applyMarks(selection, e.data)) {
			e.preventDefault()
			return
		}

		// 3. History coalescing - break before potential transformation
		const anchorNode = selection.anchorNode
		if (anchorNode.nodeType !== Node.TEXT_NODE) return

		const textContent = anchorNode.textContent || ''
		const cursorPos = selection.anchorOffset

		const afterInsert =
			cursorPos === textContent.length
				? textContent + e.data
				: textContent.substring(0, cursorPos) + e.data + textContent.substring(cursorPos)

		if (endsWithValidDelimiter(afterInsert)) {
			this.history.breakCoalescing(this.editableRef)
		}
	}

	/**
	 * Apply marks escape - insert character outside styled element when cursor is at end.
	 * This allows typing to "exit" formatting (e.g., typing after bold text stays unbolded).
	 *
	 * @returns true if handled, false otherwise
	 */
	private applyMarks(selection: Selection, typedChar: string): boolean {
		if (!this.marks || this.marks.length === 0) return false

		// Insert character outside the outermost styled element
		const textNode = document.createTextNode(typedChar)
		const outermostEl = this.marks[this.marks.length - 1]

		const range = selection.getRangeAt(0)
		range.deleteContents()

		insertAfter(textNode, outermostEl)

		// Clean up empty nodes left behind
		if (outermostEl?.textContent?.trim() === '' && outermostEl instanceof Element) {
			outermostEl.remove()
		}

		setCaretAtEnd(textNode, selection)

		// Trigger input handler to save state and handle md patterns
		this.onInput(new Event('input'))
		this.marks = null

		return true
	}

	// this.marks instruction handler
	private onKeydown = (e: KeyboardEvent) => {
		// Early return if no editable reference
		if (!this.editableRef) return

		// Handle undo/redo FIRST (before other handlers)
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
			e.preventDefault()
			this.history.breakCoalescing(this.editableRef)
			this.history.undo(this.editableRef)
			this.focusMarkManager.skipNextFocusMarks = true // Don't show marks on restored content
			this.isDirty = true
			return
		}
		if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
			e.preventDefault()
			this.history.redo(this.editableRef)
			this.focusMarkManager.skipNextFocusMarks = true // Don't show marks on restored content
			this.isDirty = true
			return
		}

		// Handle Enter key
		if (e.key === 'Enter') {
			// Save state BEFORE Enter creates a block
			this.history.breakCoalescing(this.editableRef)

			if (handleEnterKey(this.editableRef, e)) {
				// Save state AFTER Enter creates a block
				this.history.push(this.editableRef)
				this.isDirty = true
				return
			}
		}

		// Handle Backspace key
		if (e.key === 'Backspace') {
			// Save state BEFORE Backspace potentially modifies structure
			this.history.breakCoalescing(this.editableRef)

			// Handle list-specific backspace behavior
			if (handleBackspaceKey(this.editableRef, e)) {
				// Save state AFTER Backspace modifies list structure
				this.history.push(this.editableRef)
				this.isDirty = true
				return
			}

			preserveOneChild(this.editableRef, e)
		}

		// Handle Delete key
		if (e.key === 'Delete') {
			// Save state BEFORE Delete potentially modifies structure
			this.history.breakCoalescing(this.editableRef)

			// Prevent editor from becoming empty or having non-P as only child
			preserveOneChild(this.editableRef, e)
		}

		// Handle Tab key
		if (e.key === 'Tab' && this.editableRef) {
			e.preventDefault()
			this.history.breakCoalescing(this.editableRef)

			if (e.shiftKey) {
				// Shift+Tab: unindent list item or exit list
				if (handleShiftTabKey(this.editableRef, e)) {
					this.history.push(this.editableRef)
					this.isDirty = true
					return
				}
			} else {
				// Tab: indent list item
				if (handleTabKey(this.editableRef, e)) {
					this.history.push(this.editableRef)
					this.isDirty = true
					return
				}
			}
		}

		// Break coalescing on arrow key navigation
		if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
			this.history.breakCoalescing(this.editableRef)
		}

		// Note: Marks escape (typing to exit styled elements) is now handled in onBeforeInput
	}

	// Handle selection changes for both FocusMarks and exit-styled-element tracking
	private onSelectionChange = (e: Event) => {
		const selection = window.getSelection()
		if (!selection || !selection.anchorNode) return
		if (!this.editableRef?.contains(selection.anchorNode)) return

		// ===== FocusMarks: Show markdown delimiters when cursor enters formatted elements =====
		// This injects/ejects .pd-focus-mark spans dynamically based on cursor position
		// Note: skipNextFocusMarks is handled inside update() - only affects inline marks
		this.focusMarkManager.onRefocus(selection, this.editableRef)

		// ===== Exit Marks: Track styled elements where caret is at END (for exit-on-type) =====
		// This is a SEPARATE feature from FocusMarks - allows typing to exit styled elements
		if (this.marks !== null) this.marks = null // clear on displacement

		let node = selection.anchorNode

		if (node.nodeType !== Node.TEXT_NODE || selection.anchorOffset !== node.textContent?.length) {
			return
		}

		// Find and mark the outermost parent ending at caret (to be exited on keydown)
		let parent = node.parentNode
		while (parent && node == parent.lastChild) {
			// now detects further nesting to fix focus mark span issues
			if (isInlineFormattedElement(parent.nodeName))
				this.marks = this.marks ? [...this.marks, parent] : [parent]
			node = parent
			parent = node.parentNode
		}
	}

	// ==================================================

	private onFocus = () => {
		// Save initial state on first focus so undo returns to correct caret position
		// Use setTimeout(0) to run after mouseup finalizes caret position
		if (!this.hasInitialHistoryEntry && this.editableRef) {
			setTimeout(() => {
				if (this.editableRef && !this.hasInitialHistoryEntry) {
					this.history.push(this.editableRef)
					this.hasInitialHistoryEntry = true
				}
			}, 0)
		}
	}

	private onBlur = () => {
		this.focusMarkManager.unfocus()
		if (this.isDirty) this.syncToTrees()
	}

	private scheduleDebouncedSync() {
		if (this.syncTimer) {
			clearTimeout(this.syncTimer)
		}
		this.syncTimer = setTimeout(() => this.syncToTrees(), 500)
	}

	// Public method to manually trigger sync (e.g., before save, or Ctrl+Shift+F)
	syncToTrees() {
		// Cancel any pending debounced sync
		if (this.syncTimer) {
			clearTimeout(this.syncTimer)
			this.syncTimer = null
		}

		if (!this.editableRef) return
		const markdown = htmlToMarkdown(this.editableRef.innerHTML)
		this.rawMd = markdown
		this.isDirty = false
		this.lastSyncedAt = Date.now()
	}
}
