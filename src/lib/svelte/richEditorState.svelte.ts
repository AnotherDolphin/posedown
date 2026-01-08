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
	isStyledTagName,
	insertAfter,
	getMainParentBlock,
	getAncestorByTag,
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
import { setCaretAtEnd, setCaretAfterExit, setCaretAfter } from '../core/utils/selection'
import { EditorHistory } from '../core/history'
import { FocusMarkManager } from '../core/utils/focus-mark-manager'

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
	private history = new EditorHistory({ debug: true })
	private focusMarkManager = new FocusMarkManager()

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

		// Save state AFTER paste completes
		if (this.editableRef) {
			this.history.push(this.editableRef)
		}
	}

	// inline markdown detection, transformation, and post-render cursor pos
	private onInput = (e: Event) => {
		this.isDirty = true
		const selection = window.getSelection()
		if (!selection || !selection.anchorNode || !this.editableRef) return

		// this was made because ctrl+a back/del preserves the node type of the first block element (eg. keeps a top header)
		// also, a side effect of this code is that emptying a single child automatically makes it a P (even w/o ctrl+a)
		// Guard clause: ensure editor always has at least <p><br></p>
		// if (isEditorEmpty(this.editableRef)) {
		// 	preserveOneChild(this.editableRef)
		// 	this.history.push(this.editableRef)
		// 	return
		// }

		const node = selection.anchorNode

		// issue: detect if anchor node is editableRef i.e. multiple nodes werer selected
		// instead of the 'block' getting replaced, we want to replace all selected blocks

		let block = getMainParentBlock(node, this.editableRef)
		if (!block) return

		// TODO: Strip .pd-focus-mark spans before pattern detection and markdown conversion
		// This prevents focus mark spans from being treated as content during transformation.
		//
		// Implementation:
		//   const cleanBlock = block.cloneNode(true) as HTMLElement
		//   cleanBlock.querySelectorAll('.pd-focus-mark').forEach(mark => mark.remove())
		//   cleanBlock.normalize()  // Merge fragmented text nodes
		//
		// Then use cleanBlock for pattern detection and markdown conversion below

		// Check for block patterns, with special handling for list patterns inside LIs
		const hasBlockPattern = isBlockPattern(block.innerText, node)
		const hasInlinePattern = findFirstMarkdownMatch(block.textContent || '')

		if (hasBlockPattern || hasInlinePattern) {
			// TODO: Use cleanBlock here instead of block
			const contentInMd = htmlBlockToMarkdown(block)

			// NOTE: When user edits a focus mark span (e.g., changes ** to *),
			// this will parse invalid markdown (e.g., "*text**") and automatically
			// unwrap the formatting. No special "unwrap" logic needed!

			// Parse back to DOM
			const { fragment, isInline } = markdownToDomFragment(contentInMd)
			const lastNodeInFragment = fragment.lastChild
			if (!fragment || !lastNodeInFragment) return

			// Swap DOM and restore cursor using smartReplaceChildren
			if (isInline) {
				// Pass pattern match info for accurate cursor positioning
				smartReplaceChildren(block, fragment, selection, hasInlinePattern)
			} else {
				block.replaceWith(fragment)
				setCaretAtEnd(lastNodeInFragment, selection)
			}

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
			this.isDirty = true
			return
		}
		if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
			e.preventDefault()
			this.history.redo(this.editableRef)
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
		// this.focusMarkManager.update(selection, this.editableRef)

		// ===== Exit Marks: Track styled elements where caret is at END (for exit-on-type) =====
		// This is a SEPARATE feature from FocusMarks - allows typing to exit styled elements
		if (this.marks !== null) this.marks = null // clear on displacement

		let node = selection.anchorNode
		if (node.nodeType !== Node.TEXT_NODE || selection.anchorOffset !== node.textContent?.length) {
			return
		}

		// Find and mark the outmost parent ending at caret (to be exited on keydown)
		let parent = node.parentNode
		while (parent && node == parent.lastChild && isStyledTagName(parent.nodeName)) {
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
