# FocusMarks - Design Documentation

> **For current implementation status and test results**, see [focusMarks-status.md](./issues/focusMarks-status.md)

## Overview

FocusMarks temporarily reveals markdown syntax delimiters when the cursor enters formatted elements.

**Core Behavior:**
- Cursor enters formatted element → delimiters appear
- Cursor leaves → delimiters disappear
- Delimiters are editable → user can modify to change formatting

**Examples:**
- `<strong>bold</strong>` → shows `**bold**`
- `<em>italic</em>` → shows `*italic*`
- `<h2>heading</h2>` → shows `## heading`
- Edit `**` to `*` → transforms bold → italic

## Architecture

See [focus-mark-manager.ts](../src/lib/core/utils/focus-mark-manager.ts) and [richEditorState.svelte.ts](../src/lib/svelte/richEditorState.svelte.ts)

### Component Structure

```
richEditorState.svelte.ts (Integration Layer)
└── Delegates to FocusMarkManager via:
    ├── onInput → handleActiveInline()
    ├── onSelectionChange → update()
    ├── onBlur → unfocus()
    └── Sets skipNextFocusMarks flag after transformations

FocusMarkManager (Core Implementation)
├── Public API:
│   ├── update() - Main entry on selection change
│   ├── handleActiveInline() - Orchestrates span editing
│   ├── unfocus() - Clear all marks
│   └── unwrapAndReparse() - Convert element to markdown and reparse
│
├── State:
│   ├── activeInline/activeBlock - Currently focused elements
│   ├── inlineSpanRefs - Injected span references
│   ├── activeDelimiter - Current delimiter for mirroring
│   └── skipNextFocusMarks - Suppress marks after transformations
│
└── Internal Methods:
    ├── checkSpanStatus() - Detect modifications, mirror edits
    ├── handleNestedPatterns() - Process patterns inside active elements
    ├── handleBreakingDelimiters() - Handle delimiter typed in middle
    ├── findFocusedInline/Block() - Find focused elements (with edge detection)
    ├── inject/ejectMarks() - Mark lifecycle
    ├── extractDelimiters() - Reverse-engineer markdown delimiters
    └── getSpanlessClone() - Clone without focus mark spans

DOM Utilities
├── dom.ts - Tag lists, tree walking, type guards
├── dom/util.ts - reparse(), getDomRangeFromContentOffsets(), getFirstTextNode()
└── dom/smartReplaceChildren.ts - Smart DOM reconciliation with cursor preservation
```

### Data Flows

#### 1. Navigation (Arrow Keys, Mouse Click)
```
User moves cursor
  → onSelectionChange() fires
  → Check skipNextFocusMarks flag
  → focusMarkManager.update(selection, root)
  → findFocusedInline() + findFocusedBlock()
  → Compare with activeInline/activeBlock
  → ejectMarks(old) + injectMarks(new) if changed
```

#### 2. Typing Markdown Pattern
```
User types **bold**
  → onInput() fires
  → Pattern detection transforms to <strong>
  → Set skipNextFocusMarks = true
  → onSelectionChange() fires
  → Skips mark injection (flag is true)
  → Reset skipNextFocusMarks = false
```

#### 3. Editing Mark Span
```
User changes ** to * in focus mark span
  → onInput() fires
  → handleActiveInline(selection)
  → checkSpanStatus() detects modification
  → Mirrors edit to paired span
  → unwrapAndReparse() converts to markdown and back
  → smartReplaceChildren() replaces DOM
  → Result: <em> if valid, plain text if invalid
```

#### 4. Breaking Delimiter (Issue #10)
```
User types * in middle of *italic* → *ita*lic*
  → onInput() fires
  → handleActiveInline(selection)
  → handleBreakingDelimiters() detects pattern break
  → unwrapAndReparse() to markdown
  → Pattern detection finds: *ita*
  → Result: <em>ita</em>lic*
```

## Design Decisions

### 1. Dynamic Injection vs. Pre-injected Spans

**Chosen:** Dynamic injection

**Why:**
- Clean DOM 99% of time (max 4 spans)
- No serialization interference
- Derives delimiters via `htmlToMarkdown()`
- ~0.2-0.4ms per selection change (negligible)

**Alternatives rejected:**
- Pre-injected hidden spans → pollutes DOM, interferes with serialization
- Data attributes → unnecessary complexity

### 2. Delimiter Extraction via Reverse Engineering

**Method:** Convert element to markdown, split by text content

```typescript
const markdown = htmlToMarkdown(element.outerHTML) // "**text**"
const parts = markdown.split(textContent) // ["**", "**"]
```

**Why:** Simple, normalizes to default syntax, leverages existing infrastructure

**Normalization:** `__bold__` and `**bold**` both show as `**`. Original delimiter not preserved (would require data attributes for minimal benefit).

### 3. Skip Flag for New Transformations

**Problem:** After typing `**bold**`, marks immediately reappear (visual noise)

**Solution:** `skipNextFocusMarks` flag suppresses next injection, auto-resets

**Applied to:** Pattern transformations, paste, undo, redo

### 4. Span Stripping Before Pattern Detection

**Problem:** Focus mark spans interfere with pattern detection

**Solution:** `getSpanlessClone()` removes `.pd-focus-mark` spans before processing

**Why:** Preserves original DOM, cheap operation (clone only)

### 5. Editable Marks

**Chosen:** Editable (inherit `contentEditable`)

**Why:**
- User can modify delimiters to change formatting
- Can delete delimiters to unwrap
- Markdown-first philosophy

**How:** Span modifications detected by `checkSpanStatus()`, mirrored to pair, then `unwrapAndReparse()`

### 6. Maximum Two Active Marks

**Constraint:** Show only closest inline + closest block parent

**Why:** Reduces clutter, shows most relevant context, matches user mental model

**Example:** In `<blockquote><em><strong>text</strong></em></blockquote>`, show `**` (closest inline) and `>` (closest block), not `*`

### 7. Single Tilde for Strikethrough

**Choice:** Normalize `<del>` to `~text~` (not `~~text~~`)

**Why:** Better span editing UX - single backspace cleanly unwraps. With `~~`, deleting one tilde leaves 3 tildes requiring manual cleanup.

**Implementation:** Custom handler in [ast-utils.ts](../src/lib/core/transforms/ast-utils.ts)

**Trade-off:** Deviates from GFM spec (but GitHub-compatible)

### 8. Cursor Positioning After Transformations

**Problem:** Text offsets don't map directly to DOM nodes

**Solution:** `getDomRangeFromContentOffsets()` - traverses DOM depth-first, accumulating character count

**Used in:**
- `smartReplaceChildren()` - pattern transformations
- `unwrapAndReparse()` - span editing

**Related utilities:** `reparse()`, `getFirstTextNode()`, `buildBlockFragmentWithReplacement()`

### 9. Breaking Delimiter Handling

**Problem:** What happens when user types delimiter in middle?

**Chosen:** Break pattern and rematch

**Example:** `*italic*` + type `*` in middle → `*ita*lic*` → `<em>ita</em>lic*`

**Why:** Intuitive, matches markdown semantics (first pattern wins), allows building new regions

**Implementation:** `handleBreakingDelimiters()` compares matched text vs. full content, triggers `unwrapAndReparse()` if different

## Technical Details

### Tag Lists

Defined in [dom.ts](../src/lib/core/utils/dom.ts):

```typescript
INLINE_FORMATTED_TAGS = ['STRONG', 'EM', 'CODE', 'S', 'DEL']
BLOCK_FORMATTED_TAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI']
```

### Special Handling: List Items

**Problem:** `<li>` needs parent context (`<ul>` → `-`, `<ol>` → `1.`)

**Solution:** Create temporary wrapper with parent list type before markdown conversion

### CSS Styling

Defined in [RichEditor.svelte](../src/lib/svelte/RichEditor.svelte):

```css
.pd-focus-mark {
  color: #888;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
  opacity: 0.7;
}
```

**Rationale:** Monospace distinguishes from content, gray/opacity makes secondary, resets prevent inheritance

### Performance

- **Per selection change:** ~0.2-0.4ms
- **Memory:** ~1 KB peak (4 spans max)
- **Optimizations:** Early returns if unchanged, `isConnected` checks, normalize only after ejection

## Known Structural Limitations

These are architectural constraints, not implementation bugs:

1. **Block mark editing not implemented** - Requires different transformation strategy (affects structure, not just text)
2. **List depth not shown** - Would require walking tree, unclear if users need it
3. **Ordered lists always show "1."** - Matches markdown convention (auto-numbering)
4. **Multi-line code blocks unsupported** - Unclear how to show marks on multi-line structure
5. **Single cursor only** - Multi-cursor would need arrays (browser limitation)

## Future Enhancements

1. Animation - Fade in/out transitions
2. Configurable styling - User preferences
3. Keyboard toggle - Global shortcut
4. Nested hierarchy - Show all formatting levels
5. Mark autocomplete - Suggest alternatives

## Debugging

**Common issues:**
- Marks after transformation → Check `skipNextFocusMarks` flag
- Duplicate marks → Check `querySelector` in inject, `querySelectorAll` in eject
- Cursor jumps → Check `getDomRangeFromContentOffsets()` in `smartReplaceChildren()`
- Pattern detection fails → Verify `getSpanlessClone()` used

**Debug logging:**
```typescript
// In update()
console.log('[FocusMarks]', { focusedInline, activeInline })

// In extractDelimiters()
console.log('[FocusMarks]', { start, end, markdown })
```

## Integration Points

See implementations:
- [richEditorState.svelte.ts](../src/lib/svelte/richEditorState.svelte.ts) - Integration layer
- [focus-mark-manager.ts](../src/lib/core/utils/focus-mark-manager.ts) - Core logic
- [dom/util.ts](../src/lib/core/dom/util.ts) - DOM utilities
- [smartReplaceChildren.ts](../src/lib/core/dom/smartReplaceChildren.ts) - Smart reconciliation
