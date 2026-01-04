# History System for Rich Editor

A clean, production-ready undo/redo system for contenteditable with snapshot-based state management and text coalescing.

## Architecture

```
history/
├── types.ts           # TypeScript interfaces and types
├── selection.ts       # Selection serialization/restoration utilities
├── EditorHistory.ts   # Core history manager class
├── index.ts          # Public exports
└── README.md         # This file
```

## Features

- ✅ **Snapshot-based**: Stores HTML + cursor position for each state
- ✅ **Text coalescing**: Groups continuous typing into single undo units (500ms timeout)
- ✅ **Cursor restoration**: Serializes and restores selection positions using node paths
- ✅ **Manual triggers**: Explicit control over when history is saved
- ✅ **Keyboard shortcuts**: Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo)
- ✅ **Configurable**: Max stack size, coalescing timeout, debug mode
- ✅ **Portable**: Clean separation, ready for extraction as npm package

## Integration Points

The history system is integrated into `richEditorState.svelte.ts` at these points:

### 1. Initialization
```typescript
private history = new EditorHistory({ debug: false })

$effect(() => {
  if (!this.editableRef) return
  this.history.push(this.editableRef) // Save initial state
  // ...
})
```

### 2. Paste Operations
```typescript
private onPaste = (e: ClipboardEvent) => {
  e.preventDefault()
  this.isDirty = true

  // Save state BEFORE paste
  if (this.editableRef) {
    this.history.breakCoalescing(this.editableRef)
  }

  // ... paste logic
}
```

### 3. Transformations (Block-level)
```typescript
if (/^#{1,6} /.test(content)) {
  // Save state BEFORE block transformation
  this.history.breakCoalescing(this.editableRef)

  // ... transformation logic
  block?.replaceWith(fragment)
}
```

### 4. Transformations (Inline)
```typescript
if (match && node.nodeType === Node.TEXT_NODE) {
  // Save state BEFORE inline transformation
  this.history.breakCoalescing(this.editableRef)

  // ... transformation logic
  range.insertNode(fragment)
  return
}

// Regular typing - use coalesced history save
this.history.pushCoalesced(this.editableRef)
```

### 5. Keyboard Shortcuts
```typescript
private onKeydown = (e: KeyboardEvent) => {
  // Undo: Ctrl+Z
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
    e.preventDefault()
    if (this.editableRef) {
      this.history.undo(this.editableRef)
      this.isDirty = true
    }
    return
  }

  // Redo: Ctrl+Y or Ctrl+Shift+Z
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault()
    if (this.editableRef) {
      this.history.redo(this.editableRef)
      this.isDirty = true
    }
    return
  }

  // Enter key - breaks coalescing
  if (handleEnterKey(this.editableRef, e)) {
    if (this.editableRef) {
      this.history.breakCoalescing(this.editableRef)
    }
    return
  }
  // ...
}
```

### 6. Selection Changes
```typescript
private onSelectionChange = (e: Event) => {
  // Break coalescing when cursor moves
  if (this.editableRef && this.history.getState().isCoalescing) {
    this.history.breakCoalescing(this.editableRef)
  }
  // ...
}
```

## Manual Testing Guide

1. **Start dev server**: `npm run dev`
2. **Navigate to**: `http://localhost:5173/test`
3. **Click** into the contenteditable article area

### Test 1: Undo/Redo Transformation
1. Type: `**test**` (will transform to bold)
2. Press **Ctrl+Z** - should revert to plain "This is bold and italic text"
3. Press **Ctrl+Y** - should restore bold transformation
✅ **Expected**: Transformation is properly undone/redone

### Test 2: Undo/Redo Paste
1. Copy some text from anywhere
2. Paste into editor
3. Press **Ctrl+Z** - should remove pasted content
4. Press **Ctrl+Y** - should restore pasted content
✅ **Expected**: Paste is properly undone/redone

### Test 3: Undo/Redo Block Creation
1. Press **End** to go to end of text
2. Press **Enter** to create new paragraph
3. Press **Ctrl+Z** - should remove the new paragraph
✅ **Expected**: New block is removed (this was broken before)

### Test 4: Text Coalescing
1. Type several characters: "hello world"
2. Press **Ctrl+Z** once
✅ **Expected**: All typed text undone in single operation (not character by character)

### Test 5: Coalescing Break on Cursor Move
1. Type "hello"
2. Move cursor to beginning (Home key)
3. Type "test "
4. Press **Ctrl+Z** once
✅ **Expected**: Only "test " is removed (not "hello")

### Test 6: Block-Level Transformation
1. Type: `## Heading`
2. Press **Space** (triggers transformation)
3. Press **Ctrl+Z**
✅ **Expected**: Reverts to plain paragraph with "## Heading"

### Test 7: Consecutive Undo/Redo
1. Type `**bold**` (transforms)
2. Type ` more text`
3. Press **Ctrl+Z** multiple times
4. Press **Ctrl+Y** multiple times
✅ **Expected**: No state corruption, clean undo/redo cycle

### Test 8: Cursor Position Restoration
1. Type "hello world test"
2. Click in middle of "world"
3. Press **Ctrl+Z**
✅ **Expected**: Text is removed AND cursor position is restored

## Configuration

```typescript
const history = new EditorHistory({
  maxStackSize: 100,        // Maximum history entries (default: 100)
  coalescingTimeout: 500,   // Timeout for text coalescing in ms (default: 500)
  debug: false              // Enable debug logging (default: false)
})
```

## API Reference

### EditorHistory Class

#### Methods

**`push(element: HTMLElement): void`**
- Saves current state to history
- Call before operations that should be undoable

**`pushCoalesced(element: HTMLElement): void`**
- Saves state with debouncing for text coalescing
- Use for regular typing

**`breakCoalescing(element: HTMLElement): void`**
- Ends current coalescing session and saves
- Call on selection changes, Enter, transformations

**`undo(element: HTMLElement): HistoryOperationResult`**
- Undoes last operation
- Returns `{ success: boolean, error?: string }`

**`redo(element: HTMLElement): HistoryOperationResult`**
- Redoes last undone operation
- Returns `{ success: boolean, error?: string }`

**`canUndo(): boolean`**
- Checks if undo is possible

**`canRedo(): boolean`**
- Checks if redo is possible

**`clear(): void`**
- Clears all history

**`getState()`**
- Returns current state for debugging
- `{ stackSize, currentIndex, canUndo, canRedo, isCoalescing }`

## Selection Serialization

Node paths are used to serialize/restore cursor positions:

```typescript
// Serialize current selection
const serialized = serializeSelection(window.getSelection(), rootElement)
// { anchorPath: [0, 2, 1], anchorOffset: 5, ... }

// Restore selection later
restoreSelection(serialized, rootElement)
```

Paths are arrays of child indices: `[0, 2, 1]` means:
```
rootElement.childNodes[0]
  .childNodes[2]
  .childNodes[1]
```

This approach survives DOM changes better than storing direct node references.

## Known Limitations

1. **No operation-level granularity**: Stores full HTML snapshots, not individual operations
2. **Memory usage**: Each entry stores complete HTML (mitigated by max stack size)
3. **No collaboration support**: Single-user only (would need CRDT/OT for collaboration)
4. **DOM structure changes**: If DOM changes drastically, cursor restoration may fail gracefully

## Future Enhancements

- [ ] Compress snapshots (store diffs instead of full HTML)
- [ ] Operation-based history (like ProseMirror's steps)
- [ ] Persist history to localStorage
- [ ] History branching (undo tree instead of linear stack)
- [ ] Collaboration support (requires full rewrite to transaction-based)

## Extracting as npm Package

This implementation is designed to be portable. To extract:

1. **Copy** the `history/` directory
2. **Remove** Svelte-specific imports (if any)
3. **Add** framework adapters (React hooks, Vue composables, etc.)
4. **Add** tests (unit tests for selection serialization, integration tests)
5. **Package** with proper TypeScript definitions

The core logic is framework-agnostic and works with any contenteditable element.
