# Block Mark Editing Implementation Plan
current commit: c3ee7e536a4253e4d7ecd062ec145308c72c9def
## Problem Summary

The FocusMarks feature currently **displays** block delimiters (`#`, `##`, `>`, `-`, `1.`) correctly but doesn't allow **editing** them. When a user tries to edit a block delimiter (e.g., changing `##` to `#`), nothing happens - the edit is ignored.

### What Works ✅
- Block marks display correctly (injection/ejection)
- Shows `#` through `######` for headings
- Shows `>` for blockquotes
- Shows `-` for unordered lists, `1.` for ordered lists

### What's Missing ❌
1. **State tracking** - No reference to track the injected block delimiter span
2. **Edit detection** - No handler to detect when users modify block delimiters
3. **Transformation logic** - No code to change block element types based on delimiter edits
4. **Integration** - No wiring in the input handler to process block edits
5. **Tests** - Zero tests for block editing (0 out of 88 focus mark tests)

### Why It's Complex
- **Inline marks** have paired delimiters (opening + closing) that mirror edits
- **Block marks** have only a single prefix delimiter
- Changes affect DOM **structure** (element type) not just content
- List transformations require manipulating parent list containers

---

## Implementation Approach

### 1. State Tracking

**File:** `src/lib/core/utils/focus-mark-manager.ts` (lines 30-36)

Add block span tracking to the FocusMarkManager class:

```typescript
export class FocusMarkManager {
    activeInline: HTMLElement | null = null
    activeBlock: HTMLElement | null = null
    activeDelimiter: string | null = null
    inlineSpanRefs: Array<HTMLElement> = []

    // ADD:
    blockSpanRef: HTMLElement | null = null        // Single span reference
    activeBlockDelimiter: string | null = null     // Original delimiter text

    skipNextFocusMarks = false
    private editableRef: HTMLElement | null = null
}
```

**Rationale:**
- Blocks have only one prefix span (not an array like `inlineSpanRefs`)
- Track original delimiter to detect changes

---

### 2. Update Injection/Ejection

**File:** `src/lib/core/utils/focus-mark-manager.ts`

**Update `injectBlockMarks()` (line 247):**
```typescript
private injectBlockMarks(element: HTMLElement): void {
    if (element.querySelector(`.${FOCUS_MARK_CLASS}`)) return

    const delimiters = this.extractDelimiters(element)
    if (!delimiters) return

    const prefixSpan = this.createMarkSpan(delimiters.start)

    // Store reference for edit detection
    this.blockSpanRef = prefixSpan
    this.activeBlockDelimiter = delimiters.start

    element.prepend(prefixSpan)
}
```

**Update `ejectMarks()` (line 267):**
```typescript
private ejectMarks(element: HTMLElement): void {
    if (!element.isConnected) return

    const marks = element.querySelectorAll(`.${FOCUS_MARK_CLASS}`)
    marks.forEach(mark => mark.remove())

    this.inlineSpanRefs = []
    this.blockSpanRef = null           // Clear block reference
    this.activeBlockDelimiter = null   // Clear delimiter

    element.normalize()
}
```

---

### 3. Add Edit Detection Handler

**File:** `src/lib/core/utils/focus-mark-manager.ts`

Add new public method (parallel to `handleActiveInlineChange`):

```typescript
/**
 * Detects and handles edits to block delimiter spans.
 * Called from onInput handler in richEditorState.
 *
 * @param selection Current selection for cursor restoration
 * @returns true if block edit was handled, false otherwise
 */
public handleActiveBlockChange(selection: Selection): boolean {
    if (!this.activeBlock || !this.blockSpanRef) return false

    // Case 1: Span was deleted entirely
    if (!this.blockSpanRef.isConnected) {
        return this.transformBlock(selection, '')
    }

    // Case 2: Span content was modified
    const currentContent = this.blockSpanRef.textContent || ''
    if (currentContent.trim() !== this.activeBlockDelimiter?.trim()) {
        return this.transformBlock(selection, currentContent.trim())
    }

    return false
}
```

---

### 4. Add Transformation Logic

**File:** `src/lib/core/utils/focus-mark-manager.ts`

Add transformation methods for different block types:

```typescript
/**
 * Transform block element based on delimiter change.
 * Handles: heading level changes, blockquote unwrap, list type changes.
 */
private transformBlock(selection: Selection, newDelimiter: string): boolean {
    if (!this.activeBlock || !this.editableRef) return false

    const oldTagName = this.activeBlock.tagName
    const contentText = this.activeBlock.textContent?.replace(this.activeBlockDelimiter || '', '') || ''

    // Remove focus mark span before transformation
    this.blockSpanRef?.remove()
    this.blockSpanRef = null

    // Determine target element type
    const targetTag = this.getTargetBlockTag(newDelimiter, oldTagName)

    // Handle list items separately (more complex)
    if (oldTagName === 'LI' || targetTag.startsWith('LI-')) {
        return this.transformListItem(selection, newDelimiter, targetTag, contentText)
    }

    // Handle standard blocks (headings, blockquotes, paragraphs)
    return this.transformStandardBlock(selection, newDelimiter, targetTag, contentText)
}

/**
 * Map delimiter to target HTML tag.
 */
private getTargetBlockTag(delimiter: string, currentTag: string): string {
    if (!delimiter) return 'P'  // Empty delimiter = unwrap to paragraph

    // Heading patterns: # through ######
    if (/^#{1,6}\s*$/.test(delimiter)) {
        const level = delimiter.trim().length
        return `H${level}`
    }

    // Blockquote
    if (/^>\s*$/.test(delimiter)) return 'BLOCKQUOTE'

    // Unordered list
    if (/^[-*+]\s*$/.test(delimiter)) return 'LI-UL'

    // Ordered list
    if (/^\d+\.\s*$/.test(delimiter)) return 'LI-OL'

    // Invalid/unknown → unwrap to paragraph
    return 'P'
}

/**
 * Transform standard block elements (headings, blockquotes, paragraphs).
 */
private transformStandardBlock(
    selection: Selection,
    newDelimiter: string,
    targetTag: string,
    contentText: string
): boolean {
    if (!this.activeBlock || !this.editableRef) return false

    // Build markdown with new delimiter
    const markdown = newDelimiter ? `${newDelimiter} ${contentText}` : contentText

    // Import markdownToDomFragment from ast-utils
    const { fragment } = markdownToDomFragment(markdown)
    const newElement = fragment.firstChild as HTMLElement

    if (!newElement) return false

    // Calculate cursor offset before replacement
    const cursorOffset = this.calculateCursorOffset(selection, this.activeBlock)

    // Replace element
    this.activeBlock.replaceWith(newElement)

    // Restore cursor position
    this.restoreCursorAfterBlockTransform(selection, newElement, cursorOffset, newDelimiter)

    // Update state
    this.activeBlock = newElement
    this.update(selection, this.editableRef, true)

    return true
}

/**
 * Transform list items - handles UL ↔ OL, LI → P unwrap.
 */
private transformListItem(
    selection: Selection,
    newDelimiter: string,
    targetTag: string,
    contentText: string
): boolean {
    if (!this.activeBlock || !this.editableRef) return false

    const currentTag = this.activeBlock.tagName
    const parentList = this.activeBlock.parentElement

    // Case 1: Unwrap LI to paragraph
    if (currentTag === 'LI' && targetTag === 'P') {
        const newP = document.createElement('P')
        newP.textContent = contentText

        // If this is the only item, replace entire list
        if (parentList?.children.length === 1) {
            parentList.replaceWith(newP)
        } else {
            this.activeBlock.replaceWith(newP)
        }

        // Set cursor and update
        const range = document.createRange()
        range.setStart(newP.firstChild || newP, 0)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)

        this.activeBlock = newP
        this.update(selection, this.editableRef, true)
        return true
    }

    // Case 2: Change list type (UL ↔ OL)
    if (currentTag === 'LI' && parentList && (targetTag === 'LI-UL' || targetTag === 'LI-OL')) {
        const newListType = targetTag === 'LI-UL' ? 'UL' : 'OL'

        // Clone all items
        const items = Array.from(parentList.children)
        const newList = document.createElement(newListType)
        items.forEach(item => newList.appendChild(item.cloneNode(true)))

        // Find which item to restore cursor to
        const itemIndex = items.indexOf(this.activeBlock!)

        // Replace parent list
        parentList.replaceWith(newList)

        // Restore cursor
        const newActiveItem = newList.children[itemIndex] as HTMLElement
        const range = document.createRange()
        range.setStart(newActiveItem.firstChild || newActiveItem, 0)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)

        this.activeBlock = newActiveItem
        this.update(selection, this.editableRef, true)
        return true
    }

    // Case 3: Wrap paragraph in new list
    if (currentTag === 'P' && (targetTag === 'LI-UL' || targetTag === 'LI-OL')) {
        const markdown = targetTag === 'LI-UL'
            ? `- ${contentText}`
            : `1. ${contentText}`

        const { fragment } = markdownToDomFragment(markdown)
        const newList = fragment.firstChild as HTMLElement

        this.activeBlock.replaceWith(newList)

        const newLi = newList.querySelector('li') as HTMLElement
        const range = document.createRange()
        range.setStart(newLi.firstChild || newLi, 0)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)

        this.activeBlock = newLi
        this.update(selection, this.editableRef, true)
        return true
    }

    return false
}

/**
 * Calculate cursor offset within block element.
 */
private calculateCursorOffset(selection: Selection, block: HTMLElement): number {
    if (!selection.anchorNode || !block.contains(selection.anchorNode)) {
        return 0
    }

    const range = document.createRange()
    range.setStart(block, 0)
    range.setEnd(selection.anchorNode, selection.anchorOffset)
    return range.toString().length
}

/**
 * Restore cursor after block transformation.
 */
private restoreCursorAfterBlockTransform(
    selection: Selection,
    newElement: Node,
    oldOffset: number,
    newDelimiter: string
): void {
    // Import getDomRangeFromContentOffsets from dom/util
    const delimiterLength = newDelimiter.length
    const adjustedOffset = Math.max(0, oldOffset - delimiterLength)

    const range = getDomRangeFromContentOffsets(newElement, adjustedOffset)
    selection.removeAllRanges()
    selection.addRange(range)
}
```

---

### 5. Integration with Input Handler

**File:** `src/lib/svelte/richEditorState.svelte.ts` (line 185)

Update the `onInput` handler:

```typescript
private onInput = async (e: Event) => {
    this.isDirty = true
    const selection = window.getSelection()
    if (!selection || !selection.anchorNode || !this.editableRef) return false

    // Handle inline mark edits (existing)
    if (this.focusMarkManager.handleActiveInlineChange(selection)) {
        this.history.push(this.editableRef)
        return
    }

    // Handle block mark edits (NEW)
    if (this.focusMarkManager.handleActiveBlockChange(selection)) {
        this.history.push(this.editableRef)
        return
    }

    // Normal flow: MD pattern detection & transformation (existing)
    if (findAndTransform(this.editableRef)) {
        this.focusMarkManager.skipNextFocusMarks = true
        this.history.push(this.editableRef)
        return
    }

    this.history.pushCoalesced(this.editableRef)
}
```

**Change:** Add single call to `handleActiveBlockChange()` after inline handling, before normal pattern detection.

---

### 6. Add Required Imports

**File:** `src/lib/core/utils/focus-mark-manager.ts` (lines 1-14)

Add these imports:

```typescript
import { markdownToDomFragment } from '../transforms/ast-utils'
import { getDomRangeFromContentOffsets } from '../dom/util'
```

---

## Critical Files

| File | Purpose | Changes |
|------|---------|---------|
| `src/lib/core/utils/focus-mark-manager.ts` | Core focus marks logic | Add ~200 lines: state tracking, edit detection, transformation methods |
| `src/lib/svelte/richEditorState.svelte.ts` | Input handler integration | Add 4 lines: call `handleActiveBlockChange()` in `onInput` |
| `tests/e2e/focus-marks/block-editing.spec.ts` | Test coverage (NEW file) | Create ~19 tests for block editing |

---

## Implementation Sequence

### Phase 1: State Tracking (No user-facing changes)
1. Add `blockSpanRef`, `activeBlockDelimiter` properties to FocusMarkManager
2. Update `injectBlockMarks()` to store references
3. Update `ejectMarks()` to clear block references

### Phase 2: Detection & Basic Transformation
1. Add `handleActiveBlockChange()` method
2. Add `transformBlock()` method
3. Add `getTargetBlockTag()` helper
4. Add `transformStandardBlock()` method (headings, blockquotes)
5. Add cursor helpers (`calculateCursorOffset`, `restoreCursorAfterBlockTransform`)

### Phase 3: List Handling
1. Add `transformListItem()` method with all 3 cases (unwrap, change type, wrap)

### Phase 4: Integration
1. Update `onInput` handler in `richEditorState.svelte.ts`
2. Add required imports

### Phase 5: Testing
1. Create `tests/e2e/focus-marks/block-editing.spec.ts`
2. Add tests for heading transformations (H1↔H2↔H3, etc.)
3. Add tests for blockquote unwrap
4. Add tests for list transformations (UL↔OL, unwrap)
5. Add cursor positioning tests
6. Add edge case tests (invalid delimiters, nested blocks)

---

## Test Coverage Requirements

Create `tests/e2e/focus-marks/block-editing.spec.ts` with:

### Heading Transformations (~8 tests)
- Change H2 → H1 by deleting one `#`
- Change H1 → H3 by adding `##`
- Cycle through all levels (H1→H2→H3→H4→H5→H6)
- Unwrap heading to paragraph by deleting all `#` marks
- Invalid delimiter becomes paragraph

### Blockquote Transformations (~2 tests)
- Unwrap blockquote by deleting `>` delimiter
- Invalid delimiter becomes paragraph

### List Transformations (~6 tests)
- Change UL → OL by editing `-` to `1.`
- Change OL → UL by editing `1.` to `-`
- Unwrap single LI by deleting delimiter (entire list becomes P)
- Unwrap one LI in multi-item list (just that item becomes P)
- Wrap paragraph in UL by typing `-`
- Wrap paragraph in OL by typing `1.`

### Cursor Positioning (~3 tests)
- Maintain cursor position when delimiter changes
- Handle cursor at start of content
- Handle cursor at end of content

**Total: ~19 tests minimum**

---

## Edge Cases Handled

1. **Invalid Delimiters** - `getTargetBlockTag()` returns `'P'` for invalid patterns → graceful degradation
2. **Nested Blocks** - `activeBlock` is innermost focused element → transformation only affects that element
3. **Last List Item** - `transformListItem()` checks `isOnlyChild` → removes entire list when empty
4. **Cursor Positioning** - `calculateCursorOffset()` + `restoreCursorAfterBlockTransform()` maintain position
5. **Rapid Changes** - Each edit triggers transformation, `skipNextFocusMarks` prevents flicker
6. **Deletion Methods** - Both selecting span + delete and backspacing characters check `!isConnected`

---

## Verification Strategy

### Manual Testing
1. **Heading Levels:**
   - Type `# Title` → verify H1
   - Click to show marks
   - Edit delimiter to `##` → verify transforms to H2
   - Edit to `###` → verify transforms to H3
   - Delete all `#` → verify becomes paragraph

2. **Blockquote:**
   - Type `> Quote` → verify BLOCKQUOTE
   - Click to show marks
   - Delete `>` → verify becomes paragraph

3. **Lists:**
   - Type `- Item` → verify UL > LI
   - Click to show marks
   - Edit `-` to `1.` → verify entire list becomes OL
   - Delete delimiter → verify becomes paragraph

4. **Cursor Position:**
   - Create `## Content here`
   - Position cursor at "Con|tent"
   - Edit delimiter to `#`
   - Verify cursor still at "Con|tent"

### Automated Testing
Run the new test suite:
```bash
npx playwright test tests/e2e/focus-marks/block-editing.spec.ts
```

**Success criteria:** All ~19 tests pass

### Regression Testing
Run existing focus marks tests to ensure no breakage:
```bash
npx playwright test tests/e2e/focus-marks/
```

**Success criteria:** No decrease in passing tests (currently 58/94 = 61.7%)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking inline editing | Block handling is completely separate code path, runs after inline |
| List context complexity | `transformListItem()` carefully checks `isOnlyChild`, clones all items, tracks index |
| Cursor position loss | Uses Range API for reliable offset calculation, fallback to start of element |
| History pollution | Single `history.push()` per transformation (same pattern as inline) |
| Performance | Only one active block at a time, transformations are local to single element |

---

## Out of Scope

These features are NOT included in this implementation:

1. **Nested list depth** - Currently disabled in block patterns
2. **Multi-line block editing** - Only single block element transformed
3. **Code block language selection** - Edit \`\`\`js → \`\`\`python
4. **Task list checkbox toggle** - Edit `- [ ]` → `- [x]`

These can be added in future enhancements if needed.
