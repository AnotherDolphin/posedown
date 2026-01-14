# Focus Mark Span Management - Issue & Plan

## Current Problem

Focus marks (delimiter spans like `**` for bold) are not being properly cleaned up after certain operations because our pure DOM query approach cannot detect deleted spans.

### Why Pure DOM Queries Fail

**Scenario:** User backspaces the opening `**` span
1. Span gets deleted from DOM immediately
2. `onInput` fires
3. `querySelectorAll('.pd-focus-mark')` only returns surviving spans
4. We check `spans.some(span => !span.isConnected)` → false (deleted span not in results)
5. Cleanup logic never triggers

**Core issue:** DOM queries only show **current state**. We need to detect **what changed** (deleted/moved/modified spans), but deleted elements aren't queryable.

## Additional Issues

1. **`formattedElement` gets wrong parent after `smartReplaceChildren`**
   - Cloned delimiter spans end up outside the formatted element
   - `spans[0].parentElement` points to `<p>` block instead of `<strong>`

2. **Can't distinguish "no spans" vs "spans were deleted"**
   - Both cases result in empty query results
   - Need preceding state to compare

## Solution: Hybrid Approach (Option B)

Keep `activeInline` as cached state, but query spans from it fresh each time.

### Why This Works

```typescript
// Use cached activeInline (even if disconnected) as anchor
const formattedElement = this.focusMarkManager.activeInline?.isConnected
    ? this.focusMarkManager.activeInline
    : null

// Query spans from the cached element (not from editableRef)
const spans = formattedElement?.querySelectorAll('.pd-focus-mark') || []

// Now spanDisconnected works! Spans queried from disconnected parent show as disconnected
const spanDisconnected = spans.some(span => !span.isConnected)
```

**Benefits:**
- ✅ `activeInline` provides stable reference to the formatted element (even if stale)
- ✅ Querying spans from stale `activeInline` still works - returns the spans (even if disconnected)
- ✅ `span.isConnected` now correctly detects deleted spans
- ✅ `formattedElement` is always the actual formatted element, not its parent block
- ✅ Don't need to track span counts or use observers
- ✅ `activeInline` already gets updated by `focusMarkManager.update()` on selection changes

### When activeInline Becomes Stale

Only one case: After `smartReplaceChildren()` at line 314
- The old `activeInline` is removed from DOM
- New cloned formatted element is inserted
- `activeInline` still points to old element (now disconnected)

**This is actually fine:**
- We can still query spans from it
- Those spans show as disconnected
- Cleanup triggers correctly
- On next selection change, `focusMarkManager.update()` will update `activeInline` to new element

## Implementation Plan

### Step 1: Revert to using `activeInline`
**File:** `src/lib/svelte/richEditorState.svelte.ts` line ~211-215

**Current:**
```typescript
const spans = this.editableRef
    ? (Array.from(this.editableRef.querySelectorAll('.' + FOCUS_MARK_CLASS)) as HTMLElement[])
    : []
const formattedElement = spans[0]?.parentElement as HTMLElement | null
```

**Change to:**
```typescript
const formattedElement = this.focusMarkManager.activeInline
const spans = formattedElement
    ? (Array.from(formattedElement.querySelectorAll('.' + FOCUS_MARK_CLASS)) as HTMLElement[])
    : []
```

### Step 2: Update condition to handle disconnected activeInline
**Line ~220**

**Current:**
```typescript
if (formattedElement && (spanModified || spanDisconnected || cursorInsideSpan)) {
```

**Change to:**
```typescript
if (formattedElement && (spanModified || spanDisconnected || cursorInsideSpan)) {
```
Keep the condition, but now `spanDisconnected` will actually work because:
- Spans queried from disconnected `activeInline` are themselves disconnected
- `spans.some(span => !span.isConnected)` returns true

### Step 3: Add safety check for span cloning
**Line ~297-300**

**Current:**
```typescript
// Inject current focus mark clones so cursor can restore into them
if (spans.length === 2) {
    fragment.prepend(spans[0].cloneNode(true))
    fragment.append(spans[1].cloneNode(true))
}
```

**Keep as is** - this is correct. The issue is that these clones end up outside the formatted element in the block fragment, but that's intentional (they need to be outside for cursor restoration).

### Step 4: Consider clearing activeInline after removal
**Optional - line ~241-244**

When we remove spans due to disconnection/empty:
```typescript
if (bothDisconnected || anyEmpty) {
    spans.forEach(span => span.remove())
    this.focusMarkManager.activeDelimiter = ''
    this.focusMarkManager.activeInline = null  // Clear stale reference
}
```

This ensures we don't hold onto disconnected elements unnecessarily.

## Testing Checklist

After implementation, verify:
- [ ] Backspacing opening delimiter removes both spans
- [ ] Backspacing closing delimiter removes both spans
- [ ] Deleting content that removes a span cleans up properly
- [ ] Editing delimiter text mirrors to other span
- [ ] After `smartReplaceChildren`, next input operation works correctly
- [ ] No console errors about disconnected nodes
- [ ] Cursor position maintained correctly after operations

## Alternative Approaches (Rejected)

### A: Track Expected Span Count
- Requires additional state (`expectedSpanCount`)
- Still need to handle wrong parent issue
- More complex than hybrid approach

### C: MutationObserver
- Re-introduces complexity we just removed
- Observer fires at unpredictable times
- Harder to reason about execution order

### D: Update spanRefs After Mutations
- Need to remember to update after every mutation
- Easy to miss update calls
- More error-prone than querying

## Conclusion

The hybrid approach (cached `activeInline` + fresh span queries) is the sweet spot:
- Simple: Just query from cached element instead of editableRef
- Robust: Works even with disconnected elements
- Minimal changes: Only ~4 lines of code to modify
- Self-healing: `activeInline` gets updated on next selection change

## My design
- keep precise references to spans in focus manager, this makes them independent of activeInline staleness
- upon input
    1. check if either (cached) span is disconnected/empty => disconnect the other and/or eject both spans

    2. if both connected and one got edited: (basic mirroring currently works if delimiter length > 1 i.e. spans exist after edit/backspace)
        1. if the edit invovles, or results in, other than `SUPPORTED_INLINE_DELIMITERS` do not reflect and eject both spans outside the formatted element
            restore cursor if needed (smartReplace can help we just need to draw the shape of the new fragment)
        2. if the new delimiter value is supported, mirror the delimiter to the other span
        3. update spanRefs in focus manager

    3. eject the old formatted element tag and run transform pipeline on its content (`innerHTML`) now inclduing changed/removed focusSpans
    4. replace old el with new detransformed content fragment using `smartReplaceChildren`, removing focus marks, minimizing mutations, and restoring caret.
    5. 
