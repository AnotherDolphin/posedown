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
- **Before and after** transformations (markdown pattern → formatted HTML)
- **Before and after** structural changes (Enter key creating new blocks, Backspace on empty list items)
- **Before and after** paste operations
- **Before** undo/redo operations
- **On** navigation (arrow keys break coalescing)

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

### 5. Block Operations Pattern
Block creation (Enter key) and deletion (Backspace on empty list items) use a **"Before and After"** pattern:

```
State N:   <p>Hello world|</p>          (before Enter)
           ↑ breakCoalescing() saves state N
User presses Enter
State N+1: <p>Hello world</p><p>|</p>   (after Enter)
           ↑ push() saves state N+1
User types "Next"
State N+2: <p>Hello world</p><p>Next|</p> (after typing, coalesced)
```

Undo sequence:
1. Undo → removes "Next" → back to empty second paragraph
2. Undo → removes second paragraph → back to single paragraph "Hello world"
3. Undo → removes "Hello world" (if it was typed text)

**Why "Before and After" for block operations?**
- **Before**: Captures state to return to when undoing the block creation/deletion
- **After**: Creates a clean undo boundary so subsequent typing coalesces separately
- **Consistency**: Matches the paste operation pattern (before paste, after paste)
- **UX**: Users expect block operations to be independently undoable

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

**Location**: `src/lib/rich/richEditorState.svelte.ts`

**Pattern: "Before and After" for structural operations**:
- **Enter key**: `breakCoalescing()` before → `handleEnterKey()` → `push()` after
- **Backspace in lists**: `breakCoalescing()` before → `handleBackspaceKey()` → `push()` after
- **Paste**: `breakCoalescing()` before → paste logic → `push()` after

**Pattern: "After Only" for inline transformations**:
- Inline/block transformations: Rely on `onBeforeInput` break-before-delimiter → transformation logic → `push()` after
- Regular typing: `pushCoalesced()` with 500ms debounce timer

**Automatic breaks** (via `breakCoalescing`):
- Before undo/redo operations
- Before Enter key press (if handled)
- Before Backspace in empty list items (if handled)
- On arrow key navigation (Left, Right, Up, Down)
- Before delimiter completion (via `onBeforeInput` detecting markdown syntax)

**Immediate saves** (via `push`):
- After Enter key creates new block
- After Backspace modifies list structure
- After paste operations complete
- After transformations complete (inline or block)

### Handler Function Optimizations

**Location**: `src/lib/rich/utils/dom.ts`, `src/lib/rich/utils/list-handler.ts`

To avoid redundant checks, the handler functions follow these principles:

1. **Key validation happens once** in the caller (`richEditorState.svelte.ts`):
   ```typescript
   if (e.key === 'Enter' && this.editableRef) {
     handleEnterKey(this.editableRef, e)  // No key check inside
   }
   ```

2. **Non-optional parameters** when guaranteed by caller:
   - `handleEnterKey(editable: HTMLElement, ...)` - not `HTMLElement | undefined`
   - `handleBackspaceKey(editable: HTMLElement, ...)` - not `HTMLElement | undefined`

3. **Remove unused parameters**:
   - `handleEnterInListItem(selection, listItem)` - removed unused `editable`
   - `handleBackspaceInListItem(selection, listItem)` - removed unused `editable`

**Benefits**: Cleaner code, fewer redundant checks, better type safety.

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
1. **Block operations** create independent undo points:
   - Enter key: undo removes new paragraph, undo again removes Enter
   - Backspace on empty list: undo restores list item, undo again removes list item
   - Rapid multiple Enters create multiple undo points
2. **Delete operations** save state before deleting
3. **First character after operations** is properly coalesced separately
4. **Transformations** create separate history entries from typing
5. **Multiple transformations** maintain correct undo stack
6. **Cursor movement** breaks coalescing appropriately
7. **Edge cases** (undo with no history, rapid undo/redo, cursor position restoration)
