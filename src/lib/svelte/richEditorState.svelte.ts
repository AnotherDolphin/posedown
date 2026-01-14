import {
	// inlineMdToDom,
	markdownToHtml,
	markdownToDomFragment,
	htmlToMarkdown,
	htmlBlockToMarkdown,
	domFragmentToMarkdown
} from '$lib/core/transforms/ast-utils'
import {
	findFirstMarkdownMatch,
	SUPPORTED_INLINE_DELIMITERS
} from '$lib/core/utils/inline-patterns'
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
	getRangeFromBlockOffsets,
	hasSemanticTags,
	processMarkdownInTextNodes,
	smartReplaceChildren,
	endsWithValidDelimiter,
	isEditorEmpty
} from '../core/utils/dom'
import {
	setCaretAtEnd,
	setCaretAfterExit,
	setCaretAfter,
	escapeCaretStyle
} from '../core/utils/selection'
import { EditorHistory } from '../core/history'
import { FOCUS_MARK_CLASS, FocusMarkManager } from '../core/utils/focus-mark-manager'
import { findAndTransform } from '$lib/core/transforms/transform'

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
	private skipNextFocusMarks = false // Prevents marks from appearing right after transformations

	constructor(markdown: string) {
		this.rawMd = markdown
		this.html = markdownToHtml(markdown)

		// Debug: Track marks state changes
		$inspect(this.marks).with((type, marks) => {
			console.log(`[MARKS ${type.toUpperCase()}]`, marks)
			if (marks && marks.length > 0) {
				console.log('  Elements:', marks.map(m => m.nodeName).join(' > '))
			}
		})

		$effect(() => {
			if (!this.editableRef) return

			// ciritical backup override if style missing
			this.editableRef.style.whiteSpace = 'break-spaces'

			// Save initial state to history
			this.history.push(this.editableRef)

			this.editableRef.addEventListener('blur', this.onBlur)
			this.editableRef.addEventListener('input', this.onInput)
			this.editableRef.addEventListener('paste', this.onPaste)
			this.editableRef.addEventListener('keydown', this.onKeydown)
			this.editableRef.addEventListener('beforeinput', this.onBeforeInput)
			document.addEventListener('selectionchange', this.onSelectionChange)
			// let observer = observeTextBlock(this.editableRef, {
			// 	// onNodeAdded: this.onNodeAdded
			// 	// onNodeRemoved: this.onNodeRemoved,
			// 	onTextChange: this.onTextChange
			// })
			return () => {
				// observer()
				this.editableRef?.removeEventListener('blur', this.onBlur)
				this.editableRef?.removeEventListener('paste', this.onPaste)
				this.editableRef?.removeEventListener('input', this.onInput)
				this.editableRef?.removeEventListener('keydown', this.onKeydown)
				this.editableRef?.removeEventListener('beforeinput', this.onBeforeInput)
				document.removeEventListener('selectionchange', this.onSelectionChange)
			}
		})
	}

	// ============== observer callbacks ===============
	// private onNodeAdded = (node: Node, parent: Node) => {
	// 	console.log('add', node)
	// }
	// private onNodeRemoved = (node: Node, parent: Node) => {
	// 	console.log('del')
	// }
	// private onTextChange = (node: Node, oldText: string, newText: string) => {
	// 	console.log('text change', { node, oldText, newText })
	// }
	// ====================================================

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

		// setCaretAfterExit(lastInsertable, selection)
		setCaretAtEnd(lastInsertable, selection)

		// Prevent FocusMarks from appearing on just-pasted formatted elements
		this.skipNextFocusMarks = true

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

		// neutralize inline (two sided) focus mark to refelct (live) edits

		// Only enter focus mark edit flow if:
		// 1. A span was modified (delimiter edited), OR
		// 2. A span was disconnected (deleted), OR
		// Do NOT trigger just because cursor is inside activeInline (user typing regular content)

		// Query all focus mark spans in the editor and get the formatted element from span parent
		const spans = this.focusMarkManager.inlineSpanRefs

		const spanDisconnected = spans.some(span => !span.isConnected)
		const spanModified = spans.some(
			span => span.textContent !== this.focusMarkManager.activeDelimiter
		)

		if (spanDisconnected) {
			spans.forEach(span => span.remove())
			// to be handled in focusMarkManager with other side effects
			this.focusMarkManager.activeDelimiter = ''
		}
		// 2. if one is edited, mirror to the other
		else if (spanModified) {
			const editedSpan = spans.find(
				span => span.textContent !== this.focusMarkManager.activeDelimiter
			)
			const mirrorSpan = spans.find(span => span !== editedSpan)
			// todo: normaize both spans if invalid delimiters => update: use onBeforeInput to prevent invalid delimiters

			if (editedSpan && mirrorSpan && SUPPORTED_INLINE_DELIMITERS.has(editedSpan.textContent)) {
				mirrorSpan.textContent = editedSpan.textContent
				this.focusMarkManager.activeDelimiter = editedSpan.textContent || ''
			}
		}
		// else {
		// 	return // no changes to spans detected, but this should still trigger the NORMAL FLOW below?
		// }

		// the next code is only needed when spand edited and not removed?
		const formattedElement = this.focusMarkManager.activeInline
		if (formattedElement && (spanModified || spanDisconnected)) {

			// 1. unwrap content within formattedElement (de-transform)
			const cleanClone = formattedElement.cloneNode(true) as HTMLElement
			cleanClone.normalize() // Merge fragmented text nodes
			// 1.2 convert insides to md to preserve nested tags unrelated to current focus mark
			const md = htmlToMarkdown(cleanClone.innerHTML)
			const { fragment } = markdownToDomFragment(md)
			// 1.4 replace the formatted element with the fragment (leaving the delimiters, and hence caret, in the dom)

			// Build full block fragment with formattedElement replaced
			const parentBlock = formattedElement.parentElement!
			const newBlockFragment = document.createDocumentFragment()
			parentBlock.childNodes.forEach(child => {
				if (child === formattedElement) newBlockFragment.append(...fragment.childNodes)
				else newBlockFragment.append(child.cloneNode(true))
			})

			const hasInlinePattern = findFirstMarkdownMatch(parentBlock.textContent || '')

			smartReplaceChildren(parentBlock, newBlockFragment, selection, hasInlinePattern)
			this.history.push(this.editableRef)

			return
		}

		// NORMAL FLOW: check for md patterns and transform
		if (findAndTransform(this.editableRef)) {
			// Prevent FocusMarks from appearing on the just-transformed element
			// They should only appear when user navigates BACK to an existing element
			this.skipNextFocusMarks = true
			this.history.push(this.editableRef)
			return
		}

		this.history.pushCoalesced(this.editableRef)
	}

	// save history entry before incoming transformation
	private onBeforeInput = (e: InputEvent) => {
		if (e.inputType !== 'insertText' || !e.data || !this.editableRef) return

		const selection = window.getSelection()
		if (!selection?.anchorNode) return

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

	// this.marks instruction handler
	private onKeydown = (e: KeyboardEvent) => {
		// Early return if no editable reference
		if (!this.editableRef) return

		// Handle undo/redo FIRST (before other handlers)
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
			e.preventDefault()
			this.history.breakCoalescing(this.editableRef)
			this.history.undo(this.editableRef)
			this.skipNextFocusMarks = true // Don't show marks on restored content
			this.isDirty = true
			return
		}
		if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
			e.preventDefault()
			this.history.redo(this.editableRef)
			this.skipNextFocusMarks = true // Don't show marks on restored content
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
			return
		}

		if (this.marks == null) return
		if (e.key.length > 1 || e.ctrlKey || e.metaKey) return

		e.preventDefault()
		const selection = window.getSelection()
		if (!selection || selection.rangeCount === 0 || !selection.anchorNode) return

		// use marks state to exit current stylized node
		const textNode = document.createTextNode(e.key)
		const outermostElBeforeCaret =
			this.marks.length > 0 ? this.marks[this.marks.length - 1] : selection.anchorNode

		const range = selection.getRangeAt(0)
		range.deleteContents()

		insertAfter(textNode, outermostElBeforeCaret)

		// delete empty nodes left behind (resolved backspace style escaper exited empty node but empty parent remained)
		if (
			outermostElBeforeCaret?.textContent?.trim() === '' &&
			outermostElBeforeCaret instanceof Element
		) {
			outermostElBeforeCaret.remove()
		}

		setCaretAfter(textNode, selection)
		this.onInput(e) // trigger input handler to save state and handle md patterns
		this.marks = null
	}

	// Handle selection changes for both FocusMarks and exit-styled-element tracking
	private onSelectionChange = (e: Event) => {
		const selection = window.getSelection()
		if (!selection || !selection.anchorNode) return
		if (!this.editableRef?.contains(selection.anchorNode)) return

		// ===== FocusMarks: Show markdown delimiters when cursor enters formatted elements =====
		// This injects/ejects .pd-focus-mark spans dynamically based on cursor position
		// Skip if this selection change was triggered by a transformation (not user navigation)
		if (this.skipNextFocusMarks) {
			this.skipNextFocusMarks = false
		} else {
			this.focusMarkManager.update(selection, this.editableRef)
		}

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

	private onBlur = () => {
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
