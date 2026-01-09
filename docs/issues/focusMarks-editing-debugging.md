# Focus Mark Editing - Solution Documentation

**Date**: 2026-01-09
**Feature**: Real-time editing of focus mark delimiter spans
**Status**: ✅ SOLVED (All tests passing)

---

## Feature Overview

When cursor enters a formatted element (bold, italic, code, etc.), FocusMarks injects editable `<span class="pd-focus-mark">` elements showing markdown delimiters (e.g., `**`, `*`, `` ` ``). Users can edit these spans to change/remove formatting in real-time.

**User Flow:**
1. Bold text: `**bold**` → Rendered as `<strong>bold</strong>`
2. Click on bold text → Focus marks appear: `<strong><span>**</span>bold<span>**</span></strong>`
3. User edits opening span `**` → `*` → Unwraps to plain text `*bold**`
4. Pattern detection runs immediately → No valid pattern found → Stays as plain text
5. User navigates to end and deletes one asterisk → `*bold*`
6. Pattern detection runs → Valid italic pattern found → Transforms to `<em>bold</em>`

**Requirements:**
- ✅ Unwrap formatted element when user edits delimiter spans
- ✅ **Always run pattern detection after unwrap** (transforms happen in real-time)
- ✅ Preserve cursor position during unwrap and subsequent transformations
- ✅ Handle multiple keystrokes in sequence correctly

---

## The Solution

### Core Principle: **Trust the Existing Architecture**

The solution is elegantly simple:
1. **Detect** when input occurs inside a focus mark span
2. **Unwrap** the formatted element to plain text (with edited delimiters)
3. **Normalize** text nodes to prevent fragmentation
4. **Let pattern detection run normally** - don't return early
5. **Let `smartReplaceChildren()` handle cursor positioning** - it already works correctly

### Implementation (richEditorState.svelte.ts:187-256)

```typescript
private onInput = (e: Event) => {
    this.isDirty = true
    const selection = window.getSelection()
    if (!selection || !selection.anchorNode || !this.editableRef) return

    // Check if cursor is inside a focus mark span
    const focusedSpan = this.focusMarkManager.spanRefs.find((span, _) =>
        span.contains(selection.anchorNode)
    )

    if (focusedSpan) {
        // Unwrap the formatted element to plain text
        this.focusMarkManager.handleSpanEdit(focusedSpan, selection)
        this.editableRef.normalize()

        // CRITICAL: Do NOT return early - let pattern detection continue!
        // (Lines 197-198 commented out)
    }

    // ... rest of onInput logic ...

    let block = getMainParentBlock(node, this.editableRef)
    if (!block) return

    // Clean block (strip focus mark spans before pattern detection)
    const cleanBlock = block.cloneNode(true) as HTMLElement
    cleanBlock.querySelectorAll('.' + FOCUS_MARK_CLASS).forEach(mark => mark.remove())
    cleanBlock.normalize()

    // Check for patterns
    const hasBlockPattern = isBlockPattern(cleanBlock.innerText, node)
    const hasInlinePattern = findFirstMarkdownMatch(cleanBlock.textContent || '')

    if (hasBlockPattern || hasInlinePattern) {
        const contentInMd = htmlBlockToMarkdown(cleanBlock)

        // Parse back to DOM
        const { fragment, isInline } = markdownToDomFragment(contentInMd)

        if (isInline) {
            // smartReplaceChildren handles cursor positioning using pattern match info
            smartReplaceChildren(block, fragment, selection, hasInlinePattern)
        } else {
            block.replaceWith(fragment)
            setCaretAtEnd(lastNodeInFragment, selection)
        }

        // Skip focus marks ONLY if NOT editing a span (just-transformed content)
        if (!focusedSpan) this.skipNextFocusMarks = true

        this.history.push(this.editableRef)
        return
    }

    this.history.pushCoalesced(this.editableRef)
}
```

### Why This Works

**1. Unwrapping preserves all content**
`handleSpanEdit()` extracts `formattedElement.textContent`, which includes the edited delimiter text from the span. Result: `*bold**` (all chars preserved).

**2. Pattern detection handles both cases**
- **Valid pattern** (e.g., `*bold*`) → Transforms to `<em>bold</em>`
- **Invalid pattern** (e.g., `*bold**`) → Stays as plain text

**3. `smartReplaceChildren()` positions cursor correctly using `getRangeFromBlockOffsets()`**
After transformation, the DOM structure changes (new formatted elements are created). To position the cursor correctly:
- `smartReplaceChildren()` receives `hasInlinePattern` (pattern match object) and calculates cursor offset based on delimiter lengths
- Uses `getRangeFromBlockOffsets(newNode, 0, anchorOffset)` to traverse the new DOM structure and find the correct text node and offset
- This decouples the logical cursor position (string offset) from the physical DOM position (which text node, which offset)

**4. `normalize()` prevents text node fragmentation**
After unwrapping, adjacent text nodes get merged, preventing cursor positioning issues.

**5. Minimal special cases needed**
The main flow (pattern detection + smartReplaceChildren) handles cursor positioning. The only special handling is detecting span edits and unwrapping before pattern detection continues.

---

## Key Files

### 1. `src/lib/svelte/richEditorState.svelte.ts` (Lines 187-256)
**What it does:**
- Detects when cursor is inside a focus mark span (`spanRefs.find()`)
- Calls `handleSpanEdit()` to unwrap
- Calls `normalize()` to merge text nodes
- **Does NOT return early** - continues to pattern detection
- Pattern detection runs normally
- Calls `smartReplaceChildren()` which positions cursor correctly

### 2. `src/lib/core/utils/focus-mark-manager.ts` (Lines 238-262)
**What it does:**
- `handleSpanEdit()`: Unwraps formatted element to plain text node
- `calculateCursorOffset()`: Uses Range API to get offset within formatted element
- `restoreCursor()`: Restores cursor in the new text node
- Clears `spanRefs` array (marks are gone after unwrap)
- Clears `activeInline` reference (element is gone)

### 3. `src/lib/core/utils/dom.ts` (Lines 496-526, 557-681)
**What it does:**
- `getRangeFromBlockOffsets()` (496-526): Traverses DOM tree to find correct text node and offset based on global character offset from block start
- `smartReplaceChildren()` (557-681): Swaps old DOM nodes with new transformed nodes while preserving cursor position
  - Calculates cursor offset adjustment based on delimiter lengths (lines 572-589)
  - Uses `getRangeFromBlockOffsets()` to find correct cursor position in new DOM structure (line 654)
  - **Critical fix**: Previously tried naive approach (commented out 659-667), but had to use `getRangeFromBlockOffsets()` to correctly traverse the new DOM structure and position cursor

---

## The Cursor Positioning Challenge

### The Problem
After unwrapping and pattern detection, the DOM structure changes:
```
Before: **text**  (plain text node)
After:  <strong>text</strong>  (element with text node child)
```

The cursor needs to be positioned correctly in the NEW structure. Simply calculating an offset isn't enough because:
- The new DOM may have nested elements (e.g., `<strong>` wrapping a text node)
- Different elements may be at different positions
- A global character offset (e.g., offset 5 in block) needs to map to a specific text node and offset within that node

### The Solution: `getRangeFromBlockOffsets()`
This function (dom.ts:496-526) solves the problem by:
1. Taking a global character offset from the block start
2. Traversing the new DOM tree depth-first
3. Accumulating character counts as it visits each text node
4. Finding which text node contains the target offset
5. Calculating the local offset within that text node
6. Returning a Range pointing to the correct position

**Example:**
```typescript
// Block structure after transformation:
// <p>
//   "Hello "        (6 chars, offsets 0-5)
//   <strong>
//     "world"       (5 chars, offsets 6-10)
//   </strong>
//   "!"             (1 char, offset 11)
// </p>

// Want cursor at global offset 8 (inside "world")
const range = getRangeFromBlockOffsets(block, 0, 8)
// Returns: Range pointing to "world" text node at local offset 2
// (8 - 6 = 2, because "world" starts at global offset 6)
```

### Integration in `smartReplaceChildren()`
In line 654 of dom.ts:
```typescript
const range = getRangeFromBlockOffsets(newNode, 0, anchorOffset)
selection.removeAllRanges()
selection.collapse(range.endContainer, range.endOffset)
```

This replaces the previous naive approach (commented out 659-667) which tried to:
- Get the first text node
- Set cursor directly to the offset
- **Failed** because it didn't traverse nested elements correctly

---

## What We Tried (Learning Journey)

### ❌ Attempt 1: Event Listeners on Spans
**Approach:** Attach `input` event listeners directly to focus mark spans

**Why it failed:**
- `e.target` is always the parent contentEditable DIV, not the span
- Browser event bubbling issue with nested contentEditable elements

### ✅ Attempt 2: Check `selection.anchorNode` in onInput
**Approach:** On each input, check if cursor is inside a focus mark span using `spanRefs.find(span => span.contains(selection.anchorNode))`

**Why it works:**
- ✅ Correctly detects when editing inside spans
- ✅ No event listener issues
- ✅ Works with browser's natural event flow

### ❌ Attempt 3: Skip Pattern Detection After Unwrap (WRONG APPROACH)
**Approach:** Return early after unwrapping to avoid re-transforming
```typescript
if (focusedSpan) {
    this.focusMarkManager.handleSpanEdit(focusedSpan, selection)
    this.history.push(this.editableRef)
    return  // ❌ WRONG - This prevents real-time transformations
}
```

**Why it was wrong:**
- ❌ Invented a requirement that didn't exist: "preserve invalid markdown"
- ❌ Prevented real-time transformations (the actual goal)
- ❌ Broke multiple keystrokes in sequence
- ❌ Didn't trust the existing architecture

**The fix:** Remove the early return! Let pattern detection run normally.

### ✅ Attempt 4: Let Pattern Detection Run (CORRECT APPROACH)
**Approach:** After unwrapping, continue to pattern detection
```typescript
if (focusedSpan) {
    this.focusMarkManager.handleSpanEdit(focusedSpan, selection)
    this.editableRef.normalize()
    // NO return - continue to pattern detection
}
```

**Why it works:**
- ✅ Pattern detection handles both valid and invalid markdown correctly
- ✅ `smartReplaceChildren()` positions cursor correctly using pattern match info
- ✅ Real-time transformations work as expected
- ✅ Multiple keystrokes work correctly

---

## Key Insights

### 1. Always Run Pattern Detection
After unwrapping, **always** run pattern detection. It will:
- Transform valid patterns (e.g., `*text*` → `<em>text</em>`)
- Leave invalid patterns as plain text (e.g., `*text**` stays plain)

This is what enables **real-time transformations** - the core goal of the feature.

### 2. Use `getRangeFromBlockOffsets()` for Cursor Positioning
After DOM transformation, the node structure changes completely. To position cursor correctly:
- Calculate logical cursor offset (character position from block start) minus delimiter adjustments
- Use `getRangeFromBlockOffsets()` to traverse new DOM and find the correct text node and offset
- This decouples string-based pattern detection from node-based DOM structure
- **Key fix**: Previous naive approach (getting first text node, setting offset directly) failed because it didn't account for nested elements in the new DOM structure

### 3. `normalize()` is Critical
After unwrapping, call `editableRef.normalize()` to merge adjacent text nodes. Without this, text nodes stay fragmented, breaking cursor positioning.

### 4. Span Detection Uses `contains()`
```typescript
const focusedSpan = this.spanRefs.find(span => span.contains(selection.anchorNode))
```
This works because `spanRefs` is populated when marks are injected and cleared when they're ejected or unwrapped.

### 5. Clear `spanRefs` on Unwrap
In `handleSpanEdit()`, set `this.spanRefs = []` before unwrapping. This prevents stale references after the spans are removed.

### 6. Skip Focus Marks After Transformation (But Not After Unwrap)
```typescript
if (!focusedSpan) this.skipNextFocusMarks = true
```
This prevents marks from appearing on just-transformed elements. But when `focusedSpan` is truthy (user editing marks), we allow marks to reappear so they can continue editing.

---

## Example Transformations

### Example 1: Edit Bold to Italic
```
Initial:     <strong><span>**</span>bold<span>**</span></strong>
User action: Click in opening span, press Backspace
After unwrap: *bold**  (plain text)
Pattern detection: No match for *bold** → stays plain text
User action: Navigate to end, press Backspace
After edit:   *bold*  (plain text)
Pattern detection: Match! *bold* → <em>bold</em>
Result:      <em>bold</em>
```

### Example 2: Type Non-Delimiter Chars
```
Initial:     <strong><span>**</span>text<span>**</span></strong>
User action: Click in opening span, type 'abc'
After unwrap: **abctext**  (plain text)
Pattern detection: No match for **abctext** → stays plain text
Result:      **abctext**  (plain text, cursor after 'c')
```

### Example 3: Mismatched Delimiters
```
Initial:     <strong><span>**</span>text<span>**</span></strong>
User action: Click in opening span, press End, type '*'
After unwrap: ***text**  (plain text)
Pattern detection: No match for ***text** → stays plain text
Result:      ***text**  (plain text with mismatched delimiters)
```

---

## Why the Previous Approach Failed

### Misunderstanding #1: "Preserve Invalid Markdown"
**Wrong assumption:** After editing `**` → `*`, user wants `*bold**` to stay as plain text forever.

**Reality:** User wants real-time transformations. If they continue editing to make `*bold*`, it should become italic immediately.

### Misunderstanding #2: "Pattern Detection Will Break Things"
**Wrong assumption:** Running pattern detection after unwrapping will cause issues.

**Reality:** Pattern detection is designed to handle both valid and invalid markdown. It's the core of the editor's functionality.

### Technical Challenge: Cursor Positioning in Transformed DOM
**The Challenge:** After pattern detection transforms plain text to formatted elements, the DOM structure changes completely. Finding the correct cursor position in the new structure is non-trivial.

**Wrong approach (attempted):** Get first text node, set offset directly
```typescript
const textNode = getFirstTextNode(newNode)
selection.collapse(textNode, anchorOffset)
```

**Why it failed:** Doesn't account for nested elements. If the new structure is `<p>Hello <strong>world</strong>!</p>` and cursor should be at offset 8 (inside "world"), the naive approach would place it in the first text node "Hello " instead of traversing to find "world".

**Correct solution:** Use `getRangeFromBlockOffsets()` to traverse the DOM tree and find the correct text node and local offset based on global character offset.

---

## Testing

### E2E Tests: `tests/e2e/focus-mark-editing.spec.ts`

**Run tests:**
```bash
npm test tests/e2e/focus-mark-editing.spec.ts
```

**Test scenarios:**
1. ✅ Change bold to italic by editing opening delimiter
2. ✅ Type non-delimiter chars inside focus mark span
3. ✅ Unwrap completely when deleting all delimiters
4. ✅ Keep mismatched delimiters as plain text
5. ✅ Preserve cursor position during unwrap
6. ✅ Handle strikethrough delimiter editing
7. ✅ Handle complex edit: change `**` to `*a*` creating italic with different content

**All tests passing!**

---

## Architecture Principles

### 1. Separation of Concerns
- **FocusMarkManager**: Handles mark injection/ejection and unwrapping
- **richEditorState**: Handles input events and pattern detection
- **smartReplaceChildren**: Handles cursor positioning during transformations

### 2. Trust Existing Systems
Don't reinvent the wheel. The existing pattern detection + cursor positioning system works correctly.

### 3. Minimal Special Cases
The only special handling needed is:
1. Detect if cursor is in a focus mark span
2. Unwrap the formatted element
3. Normalize text nodes
4. Continue normal flow

### 4. Real-Time Transformations
Pattern detection runs on every keystroke, enabling real-time feedback. This is a feature, not a bug.

---

## Related Documentation

- **Plan**: `docs/focusMarks-editing-plan.md`
- **Feature Status**: `docs/focusMarks-plan.md`
- **E2E Tests**: `tests/e2e/focus-mark-editing.spec.ts`

---

## Critical Lessons Learned

1. **Don't invent requirements** - "Skip pattern detection" was never a real requirement
2. **Real-time means real-time** - Pattern detection should run on every keystroke, transforming valid patterns and leaving invalid ones as plain text
3. **Cursor positioning requires DOM traversal** - After transformation, use `getRangeFromBlockOffsets()` to traverse the new DOM structure and find the correct text node based on global character offset
4. **Decouple logical from physical positions** - Pattern detection works with string offsets; DOM positioning needs node traversal. `getRangeFromBlockOffsets()` bridges this gap
5. **Let pattern detection continue** - The simplest solution (unwrap → normalize → continue) enables real-time transformations without special cases

---

**Last Updated**: 2026-01-09
**Status**: ✅ Feature complete and all tests passing
**Key Insights**:
1. Let pattern detection run normally after unwrapping (don't skip it)
2. Use `getRangeFromBlockOffsets()` to correctly position cursor in transformed DOM structure
