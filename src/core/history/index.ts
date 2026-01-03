/**
 * History management for contenteditable elements.
 *
 * This module provides a snapshot-based undo/redo system with:
 * - Manual trigger points (explicit push() calls)
 * - Text coalescing (groups continuous typing)
 * - Cursor position restoration
 * - Configurable stack size
 *
 * @module history
 */

export { EditorHistory } from './EditorHistory'
// export type { HistoryEntry, HistoryOptions, HistoryOperationResult, SerializedSelection } from './types'
// export { serializeSelection, restoreSelection, getNodePath, getNodeFromPath } from './selection'
