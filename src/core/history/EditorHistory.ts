import type { HistoryEntry, HistoryOptions, HistoryOperationResult } from './types'
import { serializeSelection, restoreSelection } from './selection'

/**
 * Manages undo/redo history for a contenteditable element.
 *
 * Uses a snapshot-based approach where each history entry stores:
 * - Complete HTML content of the editor
 * - Cursor/selection position (serialized as node paths)
 *
 * Features:
 * - Manual trigger points (call push() when you want to save state)
 * - Text coalescing (groups continuous typing into single undo units)
 * - Cursor position restoration
 * - Configurable stack size
 *
 * @example
 * ```ts
 * const history = new EditorHistory({ maxStackSize: 50 })
 *
 * // Save state before transformation
 * history.push(editableElement)
 *
 * // Undo/redo
 * history.undo(editableElement)
 * history.redo(editableElement)
 * ```
 */
export class EditorHistory {
	/** Stack of history entries (single array, not separate undo/redo) */
	private stack: HistoryEntry[] = []

	/** Current position in the stack (points to current state) */
	private currentIndex: number = -1

	/** Maximum number of entries to keep */
	private maxStackSize: number

	/** Timeout for text coalescing in milliseconds */
	private coalescingTimeout: number

	/** Debug mode flag */
	private debug: boolean

	/** Timer for debounced coalescing */
	private coalescingTimer: ReturnType<typeof setTimeout> | null = null

	/** Timestamp of last input for timeout detection */
	private lastInputTime: number = 0

	/** Whether we're currently in a coalescing session */
	private isCoalescing: boolean = false

	constructor(options: HistoryOptions = {}) {
		this.maxStackSize = options.maxStackSize ?? 100
		this.coalescingTimeout = options.coalescingTimeout ?? 500
		this.debug = options.debug ?? false
	}

	/**
	 * Saves the current state of the editor to history.
	 * Call this before operations that should be undoable.
	 *
	 * @param element - The contenteditable element to save
	 */
	push(element: HTMLElement): void {
		// Normalize the DOM to remove empty text nodes before serialization
		// This ensures the selection paths match the HTML that innerHTML produces
		element.normalize()

		const selection = window.getSelection()
		const serializedSelection = selection ? serializeSelection(selection, element) : null

		const entry: HistoryEntry = {
			html: element.innerHTML,
			selection: serializedSelection,
			timestamp: Date.now()
		}

		if (this.debug) {
			console.log('[EditorHistory] Saving state:', {
				htmlPreview: element.innerHTML.substring(0, 100) + '...',
				htmlLength: element.innerHTML.length,
				hasSelection: !!serializedSelection,
				selectionPath: serializedSelection?.anchorPath,
				selectionOffset: serializedSelection?.anchorOffset
			})
		}

		// Check if this state is identical to the current state
		if (this.currentIndex >= 0) {
			const currentEntry = this.stack[this.currentIndex]
			if (this.areEntriesIdentical(currentEntry, entry)) {
				this.log('Skipping duplicate state save')
				return
			}
		}

		// If we're not at the end of the stack, clear forward history
		if (this.currentIndex < this.stack.length - 1) {
			this.stack = this.stack.slice(0, this.currentIndex + 1)
			this.log('Cleared forward history')
		}

		// Add new entry
		this.stack.push(entry)
		this.currentIndex = this.stack.length - 1

		// Enforce max stack size
		if (this.stack.length > this.maxStackSize) {
			this.stack.shift()
			this.currentIndex--
			this.log('Trimmed history to max size')
		}

		this.log(`Pushed history entry ${this.currentIndex + 1}/${this.stack.length}`)
	}

	/**
	 * Pushes state with debouncing for text coalescing.
	 * Continuous typing within the timeout period will be grouped into a single undo unit.
	 *
	 * @param element - The contenteditable element to save
	 */
	pushCoalesced(element: HTMLElement): void {
		const now = Date.now()
		const timeSinceLastInput = now - this.lastInputTime

		// If timeout expired, save previous coalesced group and start new session
		if (timeSinceLastInput > this.coalescingTimeout) {
			if (this.isCoalescing) {
				this.push(element)
				this.log('Coalescing timeout expired, saved previous group')
			}
			this.isCoalescing = true
		}

		// Reset debounce timer
		if (this.coalescingTimer) {
			clearTimeout(this.coalescingTimer)
		}

		this.coalescingTimer = setTimeout(() => {
			this.push(element)
			this.isCoalescing = false
			this.log('Coalesced typing saved')
		}, this.coalescingTimeout)

		this.lastInputTime = now
	}

	/**
	 * Breaks the current coalescing session.
	 * Call this when an operation should start a new undo unit
	 * (e.g., selection change, Enter key, transformations).
	 *
	 * @param element - The contenteditable element to save
	 */
	breakCoalescing(element: HTMLElement): void {
		if (this.coalescingTimer) {
			clearTimeout(this.coalescingTimer)
			this.coalescingTimer = null
		}

		if (this.isCoalescing) {
			this.push(element)
			this.isCoalescing = false
			this.log('Coalescing broken, saved group')
		}
	}

	/**
	 * Undoes the last operation by restoring the previous state.
	 *
	 * @param element - The contenteditable element to restore
	 * @returns Operation result with success flag
	 */
	undo(element: HTMLElement): HistoryOperationResult {
		if (!this.canUndo()) {
			return { success: false, error: 'Nothing to undo' }
		}

		// Move back in history
		this.currentIndex--
		const entry = this.stack[this.currentIndex]

		this.restore(element, entry)
		this.log(`Undo: restored to ${this.currentIndex + 1}/${this.stack.length}`)

		return { success: true }
	}

	/**
	 * Redoes the last undone operation by restoring the next state.
	 *
	 * @param element - The contenteditable element to restore
	 * @returns Operation result with success flag
	 */
	redo(element: HTMLElement): HistoryOperationResult {
		if (!this.canRedo()) {
			return { success: false, error: 'Nothing to redo' }
		}

		// Move forward in history
		this.currentIndex++
		const entry = this.stack[this.currentIndex]

		this.restore(element, entry)
		this.log(`Redo: restored to ${this.currentIndex + 1}/${this.stack.length}`)

		return { success: true }
	}

	/**
	 * Restores a history entry (content + selection).
	 *
	 * @param element - The contenteditable element to restore
	 * @param entry - The history entry to restore
	 */
	private restore(element: HTMLElement, entry: HistoryEntry): void {
		if (this.debug) {
			console.log('[EditorHistory] Restoring state:', {
				htmlPreview: entry.html.substring(0, 100) + '...',
				htmlLength: entry.html.length,
				hasSelection: !!entry.selection,
				selectionPath: entry.selection?.anchorPath,
				selectionOffset: entry.selection?.anchorOffset
			})
			console.log('[EditorHistory] Current DOM before restore:', {
				currentHTML: element.innerHTML.substring(0, 100) + '...',
				childCount: element.childNodes.length
			})
		}

		// Restore HTML content
		element.innerHTML = entry.html

		// Normalize the DOM to ensure consistent structure
		element.normalize()

		if (this.debug) {
			console.log('[EditorHistory] DOM after HTML restore:', {
				restoredHTML: element.innerHTML.substring(0, 100) + '...',
				childCount: element.childNodes.length,
				firstChildType: element.firstChild?.nodeName,
				firstChildChildCount: element.firstChild?.childNodes.length
			})
		}

		// Restore selection/cursor if available
		if (entry.selection) {
			// debugger
			const restored = restoreSelection(entry.selection, element)
			if (!restored) {
				this.log('Warning: Could not restore selection (DOM structure changed)')
			}
		}
	}

	/**
	 * Checks if undo is possible.
	 *
	 * @returns true if there are previous states to undo to
	 */
	canUndo(): boolean {
		return this.currentIndex > 0
	}

	/**
	 * Checks if redo is possible.
	 *
	 * @returns true if there are forward states to redo to
	 */
	canRedo(): boolean {
		return this.currentIndex < this.stack.length - 1
	}

	/**
	 * Clears all history.
	 */
	clear(): void {
		this.stack = []
		this.currentIndex = -1
		this.isCoalescing = false
		if (this.coalescingTimer) {
			clearTimeout(this.coalescingTimer)
			this.coalescingTimer = null
		}
		this.log('History cleared')
	}

	/**
	 * Gets the current history state for debugging.
	 *
	 * @returns Object with stack size, current position, and undo/redo availability
	 */
	getState() {
		return {
			stackSize: this.stack.length,
			currentIndex: this.currentIndex,
			canUndo: this.canUndo(),
			canRedo: this.canRedo(),
			isCoalescing: this.isCoalescing
		}
	}

	/**
	 * Checks if two history entries are identical.
	 * Only compares HTML content - cursor position differences don't matter.
	 *
	 * @param entry1 - First entry to compare
	 * @param entry2 - Second entry to compare
	 * @returns true if entries have identical HTML content
	 */
	private areEntriesIdentical(entry1: HistoryEntry, entry2: HistoryEntry): boolean {
		// Only compare HTML content - cursor position is irrelevant for history
		return entry1.html === entry2.html
	}

	/**
	 * Logs a message if debug mode is enabled.
	 *
	 * @param message - The message to log
	 */
	private log(message: string): void {
		if (this.debug) {
			console.log(`[EditorHistory] ${message}`)
		}
	}
}
