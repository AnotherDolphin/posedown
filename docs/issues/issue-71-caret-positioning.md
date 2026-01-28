# Issue #71: Caret Positioning in Edge Delimiter Handling

## Problem Summary

The caret positioning logic in `handleMarkSpanEdges` and `handleActiveInlineChange` is fragile and incomplete.

## Current Flow

```
handleMarkSpanEdges (focus-mark-manager.ts:542)
  ├─ modifies targetSpan.textContent
  ├─ setCaretAtEnd(targetSpan) ← only for 'after' case (line 571)
  └─ handleActiveInlineChange (line 574)
       ├─ isAtEdge(selection) ← checks current selection state
       ├─ skipCorrection = !(position === 'after' && target === 'close')
       └─ unwrapAndReparse(selection, skipCorrection)
            └─ update(selection, editableRef, skipCaretCorrection)
                 └─ injectInlineMarks(element, skipCaretCorrection)
                      └─ if (atEnd && !skipCaretCorrection) setCaretAtEnd(element)  ← FINAL caret
```

## Issues Identified

### Issue 1: `before` case has no caret positioning

```typescript
if (position === 'before') {
    targetSpan.textContent = typedChar + (targetSpan.textContent || '')
    // ← Missing caret positioning! Caret is orphaned after DOM rebuild
} else {
    targetSpan.textContent = (targetSpan.textContent || '') + typedChar
    setCaretAtEnd(targetSpan, selection)
}
```

For `before` case (typing at start of opening span), the caret is never positioned. After `handleActiveInlineChange` rebuilds the DOM, the caret is lost.

### Issue 2: `setCaretAtEnd` is a hack for `skipCorrection` logic

The `setCaretAtEnd(targetSpan, selection)` on line 571 exists to influence the `isAtEdge` check inside `handleActiveInlineChange`, not to set the actual final caret position.

This is fragile because:
- Selection state is modified before `isAtEdge` is called
- The actual final caret is set later in `injectInlineMarks`
- Any DOM changes between these calls can invalidate the selection

### Issue 3: Selection state dependency

`handleActiveInlineChange` relies on `isAtEdge(selection)` to calculate `skipCorrection`, but the selection may have been modified or invalidated by:
1. The `textContent` modification
2. The `setCaretAtEnd` call (for 'after' case)
3. Browser behavior when DOM changes

## Sub-issues

### Issue #71.1: Typing at end of closing span
- Action: `*italic*|` + type `*` → `**italic**`
- Expected: Caret should stay OUTSIDE (`**italic**|`)
- Bug: Caret moves inside to start of end span

### Issue #71.2: Backspacing from inside closing span
- Action: `**text*|*` + backspace → `*text*`
- Expected: Caret should stay INSIDE (`*text|*` or end of content)
- This case relies on `skipCorrection=true` which may not work reliably

## Suggested Fix

Pass edge position info directly to `handleActiveInlineChange` rather than relying on selection state:

```typescript
// In handleMarkSpanEdges:
if (position === 'before') {
    targetSpan.textContent = typedChar + (targetSpan.textContent || '')
} else {
    targetSpan.textContent = (targetSpan.textContent || '') + typedChar
}

// Pass edge info explicitly instead of relying on selection state
return this.handleActiveInlineChange(selection, { position, target })
```

```typescript
// In handleActiveInlineChange:
public handleActiveInlineChange(
    selection: Selection,
    edgeInfo?: { position: 'before' | 'after', target: 'open' | 'close' }
): boolean {
    // ...

    // Use passed edgeInfo instead of checking selection
    const skipCorrection = edgeInfo
        ? !(edgeInfo.position === 'after' && edgeInfo.target === 'close')
        : true  // default to skip if no info

    this.unwrapAndReparse(selection, skipCorrection)
    // ...
}
```

## Alternative: Deferred Caret Positioning

Another approach is to calculate the desired caret position (as a global offset) before DOM changes, then apply it after all DOM modifications:

```typescript
// Before DOM changes
const caretOffset = calculateGlobalOffset(selection, parentBlock)
const newCaretOffset = position === 'before' ? caretOffset + 1 : caretOffset + 1

// After all DOM changes complete
const range = getDomRangeFromContentOffsets(parentBlock, newCaretOffset)
selection.removeAllRanges()
selection.addRange(range)
```

This uses `getDomRangeFromContentOffsets` from `src/lib/core/dom/util.ts` which decouples offset calculation from DOM structure.

## Related Test Cases

Tests added in `tests/e2e/focus-marks/span-mirroring.spec.ts`:
- `should keep caret OUTSIDE when typing * at end of closing span (*italic*| -> **italic**|)` - issue#71.1
- `should keep caret INSIDE when backspacing from inside closing span (**text*|* -> *text*)` - issue#71.2
