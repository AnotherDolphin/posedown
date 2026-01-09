# Plan: Real-time Focus Mark Span Editing

## User Request
Handle typing inside focus mark spans with real-time DOM updates:
1. Typing inside delimiter spans should work correctly
2. Edits to delimiters should reflect in formatted DOM in real-time
   - Removing delimiters → delete/remove style
   - Adding/changing delimiters → update/add style
3. Non-delimiter input inside spans should be allowed but needs reformatting
4. Non-matching delimiters should become regular text

## Current State
- FocusMarks feature shows markdown delimiters when cursor enters formatted elements
- Delimiter spans are editable (`contentEditable="true"`)
- `onInput` strips focus mark spans before pattern detection (lines 200-204)
- System handles some editing (e.g., `**` → `*` unwraps formatting)

## Phase 1: Exploration ✅

### Current Implementation Analysis

**Input Flow:**
1. User types → `onInput` fires
2. Get main parent block containing cursor
3. **Strip all focus mark spans** from a cloned block (lines 200-204)
4. Pattern detection on cleaned HTML
5. If pattern found → transform → update DOM
6. `skipNextFocusMarks = true` to prevent marks on just-transformed content

**Focus Mark Lifecycle:**
- Injected: When cursor navigates to formatted element
- Editable: Spans have `contentEditable="true"`
- Stripped: Before pattern detection (to avoid treating them as content)
- Ejected: When cursor leaves formatted element

**Current Issue with Editing Marks:**
When user edits a mark span (e.g., `**` → `*`):
1. `onInput` fires with cursor inside the span
2. Span is stripped during pattern detection
3. HTML structure (<strong>) converted to markdown → `**text**` (from tags)
4. User's partial edit (`*`) is **lost/overwritten**
5. Result: Edit doesn't take effect

**Key Files:**
- `richEditorState.svelte.ts` - onInput handler, span stripping (200-204)
- `focus-mark-manager.ts` - Mark injection/ejection logic
- `dom.ts` - smartReplaceChildren (cursor positioning)
- `ast-utils.ts` - htmlBlockToMarkdown, markdown conversion

## Phase 2: Requirements Clarification ✅

**User Answers:**
1. ✅ **Transform timing**: Immediate (on each keystroke)
2. ✅ **Non-delimiter text**: Unwrap and include all text for pattern detection
   - Example: `**b**` → edit opening span to `*a*` → result: `*a*b**` (plain text)
   - Pattern detection sees: `*a*` (italic) + `b**` (plain text)
   - Final: `<em>a</em>b**`
3. ✅ **Mismatched delimiters**: Convert both to plain text (unwrap)
4. ✅ **Scope**: Only inline marks for now (**, *, `, ~~) - block marks later

## Phase 3: Design Solution ✅

### Core Strategy: "Event Listener on Focus Mark Spans"

**Key Insight:** Instead of checking for focus mark spans on EVERY keystroke, attach `input` event listeners directly to the spans when they're created. The listener unwraps the formatted element, letting pattern detection handle re-transformation.

**Advantages:**
- ✅ More performant (only fires when editing spans, not every keystroke)
- ✅ Cleaner separation (FocusMarkManager handles its own behavior)
- ✅ Event-driven (no checking needed)

**Flow:**
```
FocusMarkManager.injectInlineMarks():
  1. Create spans: <span class="pd-focus-mark">**</span>
  2. Attach input listener to each span
  3. Inject into DOM

User edits span: <strong><span>*</span>text<span>**</span></strong>
                   ↓ (input event on span)
Listener unwraps:  *text**  (plain text)
                   ↓ (triggers normal onInput)
Result:            *text** (no match, stays plain)

User completes:    *text*
                   ↓ (pattern detection)
Result:            <em>text</em> (italic)
```

## Implementation Plan

### Files to Modify

**1. `src/lib/core/utils/focus-mark-manager.ts`** - Modify span creation and lifecycle

```typescript
// Add to class:
private spanListeners = new Map<HTMLSpanElement, (e: Event) => void>()

// Modify createMarkSpan to attach listener:
private createMarkSpan(text: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = FOCUS_MARK_CLASS
  span.textContent = text
  span.contentEditable = 'true'

  // NEW: Attach input event listener
  const listener = this.handleSpanInput.bind(this, span)
  span.addEventListener('input', listener)
  this.spanListeners.set(span, listener)

  return span
}

// NEW: Handle input in focus mark span
private handleSpanInput(span: HTMLSpanElement, e: Event): void {
  // Find the formatted element (parent of span)
  const formattedElement = span.parentElement
  if (!formattedElement || !INLINE_FORMATTED_TAGS.includes(formattedElement.tagName as any)) {
    return
  }

  // Get current selection
  const selection = window.getSelection()
  if (!selection) return

  // Calculate cursor offset before unwrapping
  const cursorOffset = this.calculateCursorOffset(formattedElement, selection)

  // Unwrap: Extract all text and replace with plain text node
  const fullText = formattedElement.textContent || ''
  const textNode = document.createTextNode(fullText)
  formattedElement.replaceWith(textNode)

  // Restore cursor
  this.restoreCursor(textNode, cursorOffset, selection)

  // Clean up our active references (element is gone)
  if (this.activeInline === formattedElement) {
    this.activeInline = null
  }
}

// NEW: Calculate cursor offset in formatted element
private calculateCursorOffset(element: HTMLElement, selection: Selection): number {
  const anchorNode = selection.anchorNode
  if (!anchorNode || !element.contains(anchorNode)) return 0

  const range = document.createRange()
  range.setStart(element, 0)
  range.setEnd(anchorNode, selection.anchorOffset)
  return range.toString().length
}

// NEW: Restore cursor in text node
private restoreCursor(textNode: Text, offset: number, selection: Selection): void {
  const safeOffset = Math.min(offset, textNode.length)
  const range = document.createRange()
  range.setStart(textNode, safeOffset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

// Modify ejectMarks to clean up listeners:
private ejectMarks(element: HTMLElement): void {
  if (!element.isConnected) return

  const marks = element.querySelectorAll(`.${FOCUS_MARK_CLASS}`)
  marks.forEach(mark => {
    const span = mark as HTMLSpanElement
    const listener = this.spanListeners.get(span)
    if (listener) {
      span.removeEventListener('input', listener)
      this.spanListeners.delete(span)
    }
    mark.remove()
  })

  element.normalize()
}
```

**2. `src/lib/svelte/richEditorState.svelte.ts`** - NO CHANGES NEEDED!

The event listener triggers `handleSpanInput`, which unwraps the element. The unwrapping replaces the formatted element with plain text, which then triggers the normal `onInput` handler automatically. Pattern detection handles the rest.

### Implementation Steps

1. **Modify `focus-mark-manager.ts`**
   - Add `spanListeners` Map to track listeners for cleanup
   - Modify `createMarkSpan` to attach input event listener
   - Add `handleSpanInput` method: unwraps formatted element on span edit
   - Add `calculateCursorOffset` helper: range-based offset calculation
   - Add `restoreCursor` helper: restore cursor in text node
   - Modify `ejectMarks`: remove listeners before removing spans
   - Import `INLINE_FORMATTED_TAGS` from dom.ts

2. **No changes to `richEditorState.svelte.ts`**
   - Event listener handles unwrapping
   - Unwrapping triggers normal `onInput` flow automatically
   - Pattern detection works as-is

3. **Test scenarios**
   - Edit opening delimiter: `**` → `*`
   - Edit closing delimiter
   - Delete all delimiters (unwrap completely)
   - Type non-delimiter chars in span: `**` → `*a*`
   - Mismatched delimiters: `*text**` (stays plain)
   - Cursor position preservation throughout
   - Listener cleanup on ejection (no memory leaks)

### Edge Cases Handled

✅ **Nested formatting** - Only unwrap immediate parent, pattern detection handles rest
✅ **Empty spans** - User deletes all chars → unwrap extracts empty string → plain text
✅ **Cursor preservation** - Range-based offset calculation before/after unwrap
✅ **Block elements** - Check `INLINE_FORMATTED_TAGS`, skip blocks for now
✅ **Mismatched delimiters** - Pattern detection naturally leaves as plain text

### Example Transformation

```
Start:    <strong><span>**</span>bold<span>**</span></strong>
Edit:     <strong><span>*a</span>bold<span>**</span></strong>
          ↓ (detected in span)
Unwrap:   *abold**  (plain text at cursor offset 2)
          ↓ (pattern detection)
No match: *abold**  (stays plain)

Complete: *abold*
          ↓ (pattern detection)
Match:    <em>abold</em>  (italic)
```

### Why This Works

- **Event-driven**: Only fires when editing spans (not every keystroke)
- **Performant**: No checking overhead, listeners respond to actual edits
- **Encapsulated**: FocusMarkManager handles its own span behavior
- **Leverages existing system**: Unwrapping triggers normal onInput → pattern detection
- **Clean lifecycle**: Listeners added on injection, removed on ejection
- **No coupling**: Pattern detection unchanged, works on plain text as before
- **Real-time**: Transforms immediately after unwrap

---

**Status**: Ready for implementation
**Date**: 2026-01-08
