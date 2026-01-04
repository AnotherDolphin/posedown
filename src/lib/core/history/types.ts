/**
 * Represents a serialized cursor/selection position in the editor.
 * Uses node paths (arrays of child indices) to reliably restore positions
 * after DOM changes.
 */
export interface SerializedSelection {
	/** Path to the anchor node (start of selection) */
	anchorPath: number[]
	/** Offset within the anchor node */
	anchorOffset: number
	/** Path to the focus node (end of selection) */
	focusPath: number[]
	/** Offset within the focus node */
	focusOffset: number
	/** Whether the selection is collapsed (cursor vs range) */
	isCollapsed: boolean
}

/**
 * A single entry in the history stack.
 * Stores both content and cursor position for complete state restoration.
 */
export interface HistoryEntry {
	/** HTML snapshot of the editor content */
	html: string
	/** Serialized selection/cursor position */
	selection: SerializedSelection | null
	/** Timestamp when this entry was created (for debugging) */
	timestamp: number
}

/**
 * Configuration options for the history system.
 */
export interface HistoryOptions {
	/** Maximum number of history entries to keep (default: 100) */
	maxStackSize?: number
	/** Timeout in ms for text coalescing (default: 500) */
	coalescingTimeout?: number
	/** Enable debug logging (default: false) */
	debug?: boolean
}

/**
 * Result of a history operation (undo/redo).
 */
export interface HistoryOperationResult {
	/** Whether the operation succeeded */
	success: boolean
	/** Error message if operation failed */
	error?: string
}
