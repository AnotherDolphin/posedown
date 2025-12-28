# DOM & Selection Management System

> Robust cursor positioning and selection restoration during content transformations

## Overview

The DOM & Selection Management system provides utilities for manipulating the DOM and preserving cursor position during transformations. The key innovation is **node path serialization** - representing cursor position as an array of child indices rather than direct node references, allowing selection to survive DOM restructuring.

### Architecture Flow

```
Transformation Starts
     ↓
serializeSelection(selection, root)
  → { anchorPath: [0, 2, 1], anchorOffset: 5 }
     ↓
DOM Transformation
  (replace/modify elements)
     ↓
restoreSelection(serialized, root)
  → getNodeFromPath([0, 2, 1])
  → Set cursor at offset 5
     ↓
Cursor Restored
```

### Key Components

- **Selection Serialization**: `src/lib/rich/history/selection.ts` - Path-based cursor saving/restoration
- **Cursor Positioning**: `src/lib/rich/utils/selection.ts` - Utilities for placing cursor precisely
- **DOM Utilities**: `src/lib/rich/utils/dom.ts` - Block boundary detection, element traversal
- **Integration**: Used by history system, pattern transformations, paste operations

### Related Documentation

- **[history-design.md](history-design.md)** - Primary consumer of selection serialization for undo/redo
- **[inline-patterns-design.md](inline-patterns-design.md)** - Uses cursor restoration during transformations
- **[block-patterns-design.md](block-patterns-design.md)** - Uses block boundary detection, cursor restoration

## Core Principles

### 1. Node Paths Over References

Cursor position is serialized as **paths of child indices** rather than direct node references.

**Path Format**: `[0, 2, 1]` means `root.childNodes[0].childNodes[2].childNodes[1]`

**Example**:
```html
<article>           <!-- root -->
  <p>               <!-- [0] -->
    Hello           <!-- [0, 0] - text node -->
    <strong>        <!-- [0, 1] -->
      world         <!-- [0, 1, 0] - text node -->
    </strong>
  </p>
</article>

Cursor at "world|" → Path: { anchorPath: [0, 1, 0], anchorOffset: 5 }
```

**Why Paths vs. References**:

| Aspect | Node Paths | Node References |
|--------|------------|-----------------|
| Survive DOM replacement | ✅ Yes | ❌ No (references broken) |
| Survive garbage collection | ✅ Yes (paths are arrays) | ❌ No (weak refs needed) |
| Serializable | ✅ Yes (JSON) | ❌ No |
| Performance | ⚠️ Slower (traversal) | ✅ Fast (direct access) |

**Decision**: Use paths for history persistence, references for immediate operations.

### 2. Block Boundary Detection

Identify the main parent block element for transformations using `getMainParentBlock()`.

**Purpose**: Determines the scope of inline pattern transformations.

**Implementation** (dom.ts lines 122-147):
```typescript
export function getMainParentBlock(node: Node, root: HTMLElement): HTMLElement | null {
    let current = node
    while (current && current !== root) {
        if (isBlockTagName(current.tagName)) {
            return current as HTMLElement
        }
        current = current.parentNode
    }
    return null
}
```

**Example**:
```html
<article>
  <p>                     <!-- Main block -->
    Hello <strong>world</strong>
    ^current = text node "world"
  </p>
</article>

getMainParentBlock(textNode) → <p> element
```

### 3. Selection Restoration After Changes

After DOM transformations, cursor position must be restored to maintain user context.

**Pattern**:
1. Serialize selection before transformation
2. Perform DOM modification
3. Restore selection from serialized data

**Used By**:
- History undo/redo
- Inline pattern transformations
- Block pattern transformations
- Paste operations

### 4. Styled Element Exit Detection

Detect when cursor is at the end of a styled element and should exit on next character.

**Problem**: contenteditable "style persistence" - typing at end of `<strong>` continues bold formatting.

**Solution**: `escapeCaretStyle()` inserts zero-width space, then removes it after cursor moves.

**Implementation** (selection.ts lines 113-138):
```typescript
export async function escapeCaretStyle(node, selection, editable) {
    const exitTextNode = document.createTextNode('\u200C') // Zero-width space
    insertAfter(exitTextNode, node)

    await new Promise(resolve => setTimeout(resolve, 0)) // Let event loop run

    newRange.setStart(exitTextNode, 1)
    exitTextNode.textContent = '' // Remove zero-width space
    // ...
}
```

## Implementation Details

### Selection Serialization

**Location**: `src/lib/rich/history/selection.ts`

#### `getNodePath(node, root)` → `number[]`

Converts DOM node to path of child indices.

**Algorithm**:
1. Start at target node
2. Walk up to root, recording child index at each level
3. Build path array from root to node (reversed order)

**Example**:
```javascript
// HTML: <article><p>Hello</p></article>
// textNode = "Hello"

getNodePath(textNode, article)
  → parent is <p>, indexOf(textNode) = 0
  → path.unshift(0) → [0]
  → parent is <article>, indexOf(<p>) = 0
  → path.unshift(0) → [0, 0]
  → return [0, 0]
```

**Edge Case**: Returns `[]` if node is not in root (shouldn't happen).

#### `getNodeFromPath(path, root)` → `Node | null`

Restores node from path array.

**Algorithm**:
1. Start at root
2. For each index in path, descend to `childNodes[index]`
3. Return final node

**Validation**:
- Checks if each index is within bounds
- Returns `null` if path is invalid (DOM changed too much)
- Logs error with diagnostic info

**Example**:
```javascript
// path = [0, 1, 0]
getNodeFromPath([0, 1, 0], article)
  → node = root.childNodes[0]     // <p>
  → node = node.childNodes[1]     // <strong>
  → node = node.childNodes[0]     // text node
  → return text node
```

#### `serializeSelection(selection, root)` → `SerializedSelection | null`

Saves current cursor/selection as paths.

**Returns**:
```typescript
{
    anchorPath: number[],    // Start of selection
    anchorOffset: number,    // Offset within anchor node
    focusPath: number[],     // End of selection
    focusOffset: number,     // Offset within focus node
    isCollapsed: boolean     // Is cursor (not range)?
}
```

**Validation**:
- Returns `null` if selection is invalid
- Returns `null` if selection is outside root
- Validates both anchor and focus nodes

#### `restoreSelection(serialized, root)` → `boolean`

Restores cursor/selection from serialized data.

**Algorithm**:
1. Get nodes from paths using `getNodeFromPath()`
2. Clamp offsets to node length (handles text changes)
3. Create Range and set start/end
4. Add range to Selection
5. Return success status

**Offset Clamping**:
```typescript
const anchorLength = getNodeLength(anchorNode)
const clampedOffset = Math.min(serialized.anchorOffset, anchorLength)
```

**Why**: Text content may have changed (e.g., "hello" → "hi"), offset 5 would be invalid.

**Returns**: `true` if successful, `false` if paths invalid or range creation failed.

### Cursor Positioning Utilities

**Location**: `src/lib/rich/utils/selection.ts`

#### `setCaretAtEnd(node, selection)`

Positions cursor at the end of a node's content.

**Behavior**:
- For nodes with children: Descends to last text descendant
- For empty nodes: Places cursor at offset 0 (or text length)

**Use Cases**:
- After inline transformation: cursor after `<strong>text</strong>`
- After block creation: cursor in new `<li>`
- After paste: cursor at end of pasted content

**Implementation** (lines 38-61):
```typescript
export function setCaretAtEnd(node: Node, selection: Selection) {
    const targetNode = getLastTextDescendant(node) // Recurse into containers

    const newRange = document.createRange()

    if (targetNode.childNodes.length > 0) {
        newRange.selectNodeContents(targetNode)
        newRange.collapse(false) // Collapse to end
    } else {
        newRange.setStart(targetNode, targetNode.textContent?.length || 0)
    }

    selection.removeAllRanges()
    selection.addRange(newRange)
}
```

#### `setCaretAfter(node, selection)`

Positions cursor immediately after a node.

**Difference from setCaretAtEnd**:
- `setCaretAtEnd(<strong>text</strong>)` → Cursor inside: `<strong>text|</strong>`
- `setCaretAfter(<strong>text</strong>)` → Cursor after: `<strong>text</strong>|`

**Use Cases**:
- Exiting inline elements
- Positioning after transformed blocks

**Implementation** (lines 96-108):
```typescript
export function setCaretAfter(node: Node, selection: Selection) {
    const range = document.createRange()
    range.setStartAfter(node)      // Position after node
    range.collapse(true)           // Collapse to single point

    selection.removeAllRanges()
    selection.addRange(range)
}
```

#### `escapeCaretStyle(node, selection, editable)`

Escapes contenteditable "style persistence" when backspacing in styled elements.

**Problem**:
```html
<!-- Before backspace -->
<p>Hello <em>w|</em> text</p>

<!-- After backspace (without escape) -->
<p>Hello <em>|</em> text</p>  <!-- Cursor stuck in <em>, typing continues italic -->
```

**Solution**:
1. Insert zero-width non-joiner (`\u200C`)
2. Wait for event loop (let backspace complete)
3. Position cursor after zero-width char
4. Remove zero-width char
5. If block is now empty, replace with `<br>`

**Result**: Cursor escapes italic, typing is plain text.

### DOM Utilities

**Location**: `src/lib/rich/utils/dom.ts`

#### `getMainParentBlock(node, root)` → `HTMLElement | null`

Finds the enclosing block-level element.

**Block Tags**: P, H1-H6, BLOCKQUOTE, PRE, UL, OL, LI

**Algorithm**:
1. Start at node
2. Walk up parent chain
3. Return first block-level element found
4. Return `null` if no block found (node is outside editable)

**Use Case**: Determine transformation scope for inline patterns.

#### `getAncestorByTag(node, tagName, root)` → `Element | null`

Finds nearest ancestor with specific tag name.

**Example**:
```javascript
getAncestorByTag(textNode, 'LI', editable)
  → Returns <li> if inside list, null otherwise
```

**Use Cases**:
- List Enter/Backspace handlers
- Styled element detection
- Block boundary detection

#### `getStyledAncestor(node, root)` → `Element | null`

Finds nearest styled ancestor (STRONG, EM, CODE, etc.).

**Styled Tags**: STRONG, EM, CODE, S, U, SUB, SUP, MARK

**Use Case**: Detect if backspace will remove all text in styled element.

**Example**:
```html
<p>Hello <strong>w|</strong></p>
         ^node

getStyledAncestor(node) → <strong>
```

#### `willBackspaceRemoveAllStyledText(selection, styledElement, event)`

Detects if backspace would delete all text in a styled element.

**Logic**:
- Check if cursor is at offset 1 (before last character)
- Check if styled element has exactly 1 character
- Return `true` if backspace would empty the element

**Integration**: Used in `handleBackspaceKey()` to trigger `escapeCaretStyle()`.

## Pattern Examples

### Example 1: Node Path Serialization

```html
<article>        <!-- root -->
  <p>            <!-- [0] -->
    Hello        <!-- [0, 0] - text node -->
    <strong>     <!-- [0, 1] -->
      world      <!-- [0, 1, 0] - text node -->
    </strong>
  </p>
</article>

Cursor at: "world|" (offset 5 in text node)

serializeSelection():
{
  anchorPath: [0, 1, 0],
  anchorOffset: 5,
  focusPath: [0, 1, 0],
  focusOffset: 5,
  isCollapsed: true
}

After transformation (e.g., undo):
getNodeFromPath([0, 1, 0]) → Finds "world" text node again
setStart(textNode, 5) → Cursor at "world|"
```

### Example 2: Exit Styled Element on Next Character

```html
State 1: <p>Hello <strong>world|</strong></p>
         Cursor at end of <strong>

User types: <Space>
         ↓
         onSelectionChange detects cursor at end of styled element
         marks.last = <strong> element
         ↓
         onKeydown processes space character
         Cursor is at end of marks.last
         ↓
         insertAfter(textNode(' '), <strong>)
         ↓
State 2: <p>Hello <strong>world</strong> |</p>
         Cursor exited <strong>, space is plain text
```

### Example 3: Backspace All Text in Styled Element

```html
State 1: <p>Hello <em>w|</em> text</p>
         Cursor before "w"

User presses: Backspace
         ↓
         getStyledAncestor(cursor) → <em>
         willBackspaceRemoveAllStyledText() → true
         ↓
         escapeCaretStyle(<em>)
           → Insert zero-width space after <em>
           → Wait for backspace to complete
           → Position cursor in zero-width space
           → Remove zero-width space
         ↓
State 2: <p>Hello | text</p>
         <em> removed, cursor plain text
```

### Example 4: Offset Clamping During Restore

```html
<!-- Before: Cursor at end -->
<p>Hello world|</p>
serialized.offset = 11

<!-- After transformation (text shortened) -->
<p>Hi|</p>
Restored offset clamped: min(11, 2) = 2

Result: Cursor at "Hi|" (not out of bounds)
```

### Example 5: Block Boundary Detection

```html
<article>
  <h1>Title</h1>
  <p>
    First paragraph with <strong>bold|</strong> text.
  </p>
  <p>Second paragraph</p>
</article>

Cursor at "bold|" (inside <strong>)
         ↓
getMainParentBlock(textNode("bold")) → <p> element (not <strong>)
         ↓
Transformation scope: Entire <p>, not just <strong>
```

## Design Trade-offs

### Node Paths vs. Absolute Offsets

**✅ Paths** (current):
- Survive DOM structure changes
- Work after element replacement
- Serializable for history

**❌ Offsets**:
- Fast to calculate
- Fragile (break on structure change)
- Not useful for history

**Decision**: Paths for all selection serialization.

**Tradeoff**: Slightly slower to restore (tree traversal), but correctness is more important.

### Node Paths vs. Node References

**✅ Paths** (history):
- Survive garbage collection
- Serializable to JSON
- Work after DOM replacement

**✅ References** (immediate operations):
- Faster (no traversal)
- Simpler code
- Safe for same-tick operations

**Decision**: Paths for history, references for immediate cursor positioning.

**Example**:
```typescript
// Immediate operation - use reference
setCaretAtEnd(lastNode, selection)

// History - use paths
serializeSelection(selection, root) → Store in history entry
```

### Automatic Exit from Styled Elements

**✅ Auto-Exit** (current):
- Better UX (intuitive behavior)
- Prevents "stuck" cursor
- Matches user expectations

**❌ Manual Exit**:
- Simpler implementation
- Users must press arrow keys to exit
- Confusing for non-technical users

**Decision**: Auto-exit when typing at end of styled element.

**Implementation**: `onSelectionChange` tracks styled element, `onKeydown` inserts exit node.

### Offset Clamping vs. Strict Validation

**✅ Clamp** (current):
- Graceful degradation
- Cursor placed as close as possible to intended position
- Handles text changes (e.g., undo after editing)

**❌ Strict Validation**:
- Fail if offset out of bounds
- User loses cursor position entirely
- Annoying error handling

**Decision**: Clamp offsets to valid range during restoration.

**Example**: If text was "hello" (offset 5 valid), then undo shortens to "hi", clamp to offset 2.

## Known Limitations

### 1. Path Restoration Fails on Drastic Structure Changes

**Issue**: If DOM changes drastically, paths may become invalid.

**Example**:
```html
<!-- Before -->
<p>Text</p>          <!-- Path: [0] -->

<!-- After (replaced with different structure) -->
<div><span>Text</span></div>  <!-- Path [0] → <div>, not text -->
```

**Result**: `getNodeFromPath()` returns `null`, restoration fails.

**Mitigation**: Transformations generally preserve structure (replace `<p>` with `<h1>` maintains path).

**Acceptable**: Rare edge case, fallback is cursor at start of editor.

### 2. Styled Element Exit Doesn't Work Perfectly with Nested Styles

**Issue**: Exiting nested styled elements can be ambiguous.

**Example**:
```html
<strong><em>text|</em></strong>

Which element to exit? <em> or both?
```

**Current Behavior**: Exits innermost styled element only.

**Acceptable**: Nested styles are rare, user can press space multiple times.

### 3. No Support for Multi-Range Selections

**Issue**: Modern browsers support multiple selection ranges (Ctrl+Click), but editor doesn't.

**Reason**: contenteditable doesn't support multi-range well, extremely rare use case.

**Decision**: Only serialize/restore single collapsed cursor or single range.

### 4. Cursor Can Get Stuck in Empty Styled Elements

**Issue**: In rare cases, cursor can remain inside `<strong></strong>` (empty).

**Example**:
```html
<p>Hello <strong>|</strong> world</p>
```

**Workaround**: User presses arrow keys to move out.

**Future**: Detect empty styled elements and auto-remove them.

## Testing Strategy

### Manual Testing

**Test Path Serialization**:
1. Position cursor in various locations (text, inside styles, inside blocks)
2. Trigger transformation (e.g., inline pattern)
3. Verify cursor position restored correctly after transformation

**Test Cursor Positioning**:
1. Test `setCaretAtEnd()` on various elements (empty, with text, with children)
2. Test `setCaretAfter()` for exiting styled elements
3. Verify cursor visible and editable after positioning

**Test Styled Element Exit**:
1. Type inside `<strong>text</strong>`
2. Move cursor to end: `<strong>text|</strong>`
3. Type space
4. Verify cursor exits: `<strong>text</strong> |`

**Test Backspace in Styled Elements**:
1. Create: `<p>Hello <em>w</em> text</p>`
2. Position cursor: `<em>w|</em>`
3. Press Backspace
4. Verify: `<p>Hello | text</p>` (not `<p>Hello <em>|</em> text</p>`)

**Test History Integration**:
1. Type text with inline formatting
2. Press Ctrl+Z (undo)
3. Verify cursor position restored correctly
4. Press Ctrl+Y (redo)
5. Verify cursor position restored again

### Automated Testing

**Unit Tests** (to be implemented):
```typescript
describe('Node Path Serialization', () => {
  test('getNodePath returns correct path', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p><strong>text</strong></p>'
    const textNode = root.querySelector('strong').firstChild

    expect(getNodePath(textNode, root)).toEqual([0, 0, 0])
  })

  test('getNodeFromPath restores correct node', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p><strong>text</strong></p>'

    const node = getNodeFromPath([0, 0, 0], root)
    expect(node.textContent).toBe('text')
  })

  test('offset clamping handles text changes', () => {
    const serialized = { ..., anchorOffset: 10 }
    const shortText = 'hi' // length 2

    // Should clamp to 2, not fail
    restoreSelection(serialized, root)
    expect(selection.anchorOffset).toBe(2)
  })
})
```

## Integration Points

### With History System

**Primary Integration**: History uses path serialization for all cursor restoration.

**Flow**:
1. `EditorHistory.push()` → calls `serializeSelection()` → stores in entry
2. `EditorHistory.undo()` → retrieves serialized selection → calls `restoreSelection()`

**Location**: `EditorHistory.ts` lines 72, 251-257

**Why Essential**: History undo/redo would lose cursor position without path serialization.

**Details**: See [history-design.md](history-design.md#cursor-restoration).

### With Inline Pattern Transformations

**Integration**: Pattern transformations use `smartReplaceChildren()` which preserves cursor.

**Flow**:
1. Detect inline pattern (e.g., `**bold**`)
2. Serialize current selection
3. Convert HTML → Markdown → AST → HTML
4. Replace DOM with `smartReplaceChildren()`
5. Restore selection using serialized paths

**Why**: Transformation replaces DOM nodes, direct references would break.

**Details**: See [inline-patterns-design.md](inline-patterns-design.md#with-ast-conversion) for AST-based transformation flow.

### With Block Pattern Transformations

**Integration**: Block transformations also use selection serialization.

**Example**:
```
Input: ## Heading<Space>
       ↓
       Serialize cursor position
       Replace <p> with <h2>
       Restore cursor (path [0, 0] still valid: <h2>'s text node)
```

**Details**: See [block-patterns-design.md](block-patterns-design.md#integration-points).

### With List Handlers

**Integration**: List handlers use `setCaretAtEnd()` after creating new list items.

**Example** (from `list-handler.ts`):
```typescript
export function handleEnterInListItem(selection, listItem) {
    // Create new list item
    const newLi = document.createElement('li')
    // ...
    listItem.after(newLi)

    // Position cursor at start of new item
    selection.collapse(newLi, 0)  // Uses native selection API
}
```

**Note**: List handlers use native selection API, not `setCaretAtEnd()`, because they have direct access to new node.

## Future Enhancements

- [ ] Improve path restoration with fuzzy matching (find similar nodes if exact path fails)
- [ ] Add support for multi-range selections (low priority, rare use case)
- [ ] Auto-remove empty styled elements to prevent cursor getting stuck
- [ ] Optimize path traversal with caching for large documents
- [ ] Add visual indicators for cursor position during debugging
- [ ] Implement cursor position hints for complex transformations
- [ ] Better handling of nested styled elements (exit to specific depth)
- [ ] Cursor position persistence across sessions (save to localStorage)
