# Rich Editor History System

> High-level design of the undo/redo system for the markdown-aware contenteditable editor

## Overview

The history system uses a **snapshot-based approach** where each entry stores:
- Complete HTML content of the editor
- Serialized cursor/selection position (as DOM node paths)
- Timestamp

## Core Principles

### 1. Manual Trigger Points
History is saved explicitly at key operations, not automatically on every DOM mutation:
- Before and after transformations (markdown pattern → formatted HTML)
- Before destructive operations (delete, backspace on empty lines)
- On structural changes (Enter key, paste)
- On navigation (arrow keys break coalescing)

### 2. Text Coalescing
Continuous typing is grouped into **single undo units** via a debounced timer (500ms):
- User types "hello world" → saved as one history entry
- Typing pauses for 500ms+ → timer fires, state saved
- Any break event (see below) flushes the pending group immediately

### 3. Break-Before-Delimiter Strategy
To enable reverting incomplete markdown patterns, history breaks **before** delimiter completion:

```
User types: **make bold*
             ↑ state saved here (before final *)
User types final: *
             ↑ transformation happens, new state saved
```

This allows undo to return to `**make bold*` instead of jumping back to before typing started.

**Detection**: `onBeforeInput` checks if the next character would complete a valid markdown delimiter:
- Symmetric delimiters: `**`, `*`, `__`, `_`, `~~`, `` ` ``, etc.
- Block markers: `# `, `## `, `- `, `> `, `1. `, etc.

### 4. Separation After Transformations
Typing after a transformation is coalesced separately from the transformation itself:

```
State 0: <p><br></p>           (empty editor)
State 1: <p>#</p>              (typed "#", saved via break-before-delimiter)
State 2: <h1></h1>             (space typed, transformation occurred)
State 3: <h1>Heading</h1>      (typed "Heading", coalesced into one entry)
```

Undo sequence:
1. Undo → removes "Heading" → back to empty `<h1></h1>`
2. Undo → removes transformation → back to `<p>#</p>`
3. Undo → removes "#" → back to empty editor

## Implementation Details

### EditorHistory Class
**Location**: `src/lib/rich/history/EditorHistory.ts`

**Key methods**:
- `push(element)` - Save state immediately
- `pushCoalesced(element)` - Save with debounced coalescing
- `breakCoalescing(element)` - Flush pending coalesced state and start new group
- `undo(element)` - Restore previous state
- `redo(element)` - Restore next state

**State management**:
- Single array stack (not separate undo/redo stacks)
- `currentIndex` points to current state
- Undo: move index backward, restore that entry
- Redo: move index forward, restore that entry
- New edit: truncates forward history

### Break Points in richEditorState

**Automatic breaks** (via `breakCoalescing`):
- Before undo/redo (line 238, 247)
- Before Enter key (line 257)
- Before Backspace in lists (line 267)
- On arrow key navigation (line 275)
- Before delimiter completion (line 228, via `onBeforeInput`)

**Saves after operations**:
- After transformations (line 202)
- During coalesced typing (line 206)

## Cursor Restoration

Selection is serialized as **paths from root** rather than absolute offsets:
- Each node in the path is identified by its index in `childNodes`
- Example: `[0, 2, 1]` means root → first child → third child → second child
- Robust to content changes as long as structure is similar
- Falls back gracefully if path no longer exists

## Design Trade-offs

### Why snapshot-based vs. operation-based?
- **Simpler**: No need to invert operations or maintain operation log
- **Robust**: Works with any DOM transformation, including complex markdown parsing
- **Fast restore**: Just set innerHTML + restore selection
- **Cost**: Higher memory usage (stores full HTML per state)

### Why manual triggers vs. MutationObserver?
- **Control**: Explicit about what's undoable
- **Performance**: Avoids overhead of observing every DOM change
- **Coalescing**: Can intelligently group related edits
- **Predictable**: User expectations align with explicit save points

### Why break-before-delimiter vs. break-after?
- **UX**: Users expect to undo incomplete patterns (e.g., `**text*`)
- **Granularity**: Allows reverting back one character at delimiter boundary
- **Natural**: Matches mental model of "I started typing bold syntax, let me undo that"

## Stack Size & Limits

- **Max entries**: 100 (configurable)
- **Coalescing timeout**: 500ms (configurable)
- **Oldest entries trimmed** when stack exceeds max
- **Duplicate detection**: Consecutive identical HTML states are skipped

## Testing Strategy

Tests verify:
1. **Delete operations** save state before deleting
2. **First character after operations** is properly coalesced
3. **Transformations** create separate history entries
4. **Multiple transformations** maintain correct undo stack
5. **Cursor movement** breaks coalescing appropriately
6. **Edge cases** (undo with no history, rapid undo/redo)
