# Plan: Issue#10 - Active Inline Breaking Edits (outdated)

## Problem Summary

When a user types delimiter characters in the middle of formatted content, it "breaks" the original pattern and should create a new pattern match.

**Example:**
- Start: `*italic*` rendered as `<em>italic</em>` with focus marks showing
- User types `*` in the middle: text becomes `*ita*lic*`
- Expected: `*ita*` becomes the new italic pattern → `<em>ita</em>lic*`

## Current State

The condition at line 238 currently includes `formattedElement.contains(selection.anchorNode)`:

```typescript
if (formattedElement && (spanModified || spanDisconnected || formattedElement.contains(selection.anchorNode))) {
```

**Problem:** This is too broad - it triggers on ALL typing inside the formatted element, not just breaking delimiter edits. This interferes with regular typing and breaks caret position unnecessarily.

**What we need:** Specific detection for when typed content creates a new delimiter pattern.

## Is `findFirstMarkdownMatch` the Right Tool?

**Yes, for finding the new pattern boundary.** But we need separate logic to DETECT when a breaking edit occurred.

For `*ita*lic*`:
- `findFirstMarkdownMatch('*ita*lic*')` correctly identifies `*ita*` as the first italic match
- Returns position info for cursor restoration

## Implementation Approach

### Detection Strategy

Detect "breaking edits" by checking if the content text (between focus marks) now contains the `activeDelimiter`:

```typescript
// Get content text between the focus mark spans
const contentText = getContentTextBetweenMarks(formattedElement)
const containsDelimiter = contentText.includes(activeDelimiter)
```

### Refined Condition

Replace the overly broad condition with specific detection:

```typescript
// ACTIVEINLINE BREAKING EDITS - detect when typed delimiter creates new pattern
const contentContainsDelimiter = formattedElement &&
    !spanModified &&
    !spanDisconnected &&
    formattedElement.contains(selection.anchorNode) &&
    getContentText(formattedElement).includes(this.focusMarkManager.activeDelimiter || '')

if (formattedElement && (spanModified || spanDisconnected || contentContainsDelimiter)) {
    // existing unwrap/re-parse logic
}
```

## Implementation Steps

### Step 1: Add Helper Function

Add a function to extract content text between focus marks:

```typescript
// In richEditorState or focus-mark-manager
function getContentTextBetweenMarks(element: HTMLElement): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.' + FOCUS_MARK_CLASS).forEach(mark => mark.remove())
    return clone.textContent || ''
}
```

### Step 2: Update the Condition (lines 238)

```typescript
// Check if content (between marks) now contains the delimiter - breaking edit!
const contentText = getContentTextBetweenMarks(formattedElement)
const isBreakingEdit = contentText.includes(this.focusMarkManager.activeDelimiter || '')

if (formattedElement && (spanModified || spanDisconnected || isBreakingEdit)) {
    // existing unwrap/re-parse logic at lines 239-261
}
```

### Step 3: Verify Focus Mark Handling in Unwrap

Ensure focus marks are properly converted to their text content when unwrapping:

```typescript
// Line ~243: Convert focus marks to text before htmlToMarkdown
cleanClone.querySelectorAll('.' + FOCUS_MARK_CLASS).forEach(mark => {
    mark.replaceWith(document.createTextNode(mark.textContent || ''))
})
cleanClone.normalize()
const md = htmlToMarkdown(cleanClone.innerHTML)
```

## Files to Modify

1. `/home/abdullah/projects/posedown/src/lib/svelte/richEditorState.svelte.ts`
   - Add `getContentTextBetweenMarks` helper (or import from focus-mark-manager)
   - Update condition at line 238 to use `isBreakingEdit` detection
   - Ensure focus marks are converted to text in unwrap logic

## Verification

1. Regular typing inside formatted element should NOT trigger unwrap/re-parse
2. Typing delimiter character (e.g., `*` inside `*italic*`) SHOULD trigger and create new pattern
3. Cursor should be positioned correctly after transformation

### Test Cases

1. Type `*italic*` → `<em>italic</em>`
2. Click inside, focus marks appear
3. Type regular characters → no transformation, just typing
4. Type `*` in middle → should transform to `<em>ita</em>lic*`

## Edge Cases to Consider

1. **Multiple delimiters:** What if user types `**` inside `*italic*`? Should detect based on current `activeDelimiter`
2. **Partial delimiter:** User types one `*` when `activeDelimiter` is `**` - should not trigger ✅ CONFIRMED
3. **Nested formatting:** Content already has nested tags that should be preserved

---

## Questions for Review

Please answer these before implementation begins. Mark with ✅ when answered.

### Q1: Helper Function Location
Where should `getContentTextBetweenMarks` live?
- [ ] A) In `richEditorState.svelte.ts` as a private method
- [ ] B) In `focus-mark-manager.ts` as a utility method
- [ ] C) In `dom.ts` with other DOM utilities

### Q2: Cursor Position After Transformation
After `*italic*` becomes `*ita*lic*` → `<em>ita</em>lic*`, where should cursor be?
- [ ] A) Right after the new `<em>` closing tag (before "lic")
- [ ] B) At the same text offset as before transformation (character-wise)
- [ ] C) At the end of the paragraph

### Q3: History Entry
Should the breaking edit transformation create a separate history entry (undoable)?
- [ ] A) Yes, always push to history
- [ ] B) No, coalesce with the typed character
- [ ] C) Only if the transformation actually changed the pattern

### Q4: Focus Mark State After Transformation
After the transformation, should focus marks reappear on the new `<em>ita</em>`?
- [ ] A) Yes, cursor is still in/near formatted element
- [ ] B) No, skip focus marks (like after normal pattern completion)
- [ ] C) Depends on cursor position

### Q5: Multiple Breaking Edits
If user types `*` twice quickly creating `**` inside `*italic*`:
- After first `*`: content is "ita*lic", no match, no trigger
- After second `*`: content is "ita**lic", contains `**` but activeDelimiter is `*`

Should this trigger? (The typed `**` is different from activeDelimiter `*`)
- [ ] A) No, only match exact activeDelimiter (current plan)
- [ ] B) Yes, match any SUPPORTED_INLINE_DELIMITER
- [ ] C) Yes, match any delimiter that's longer or equal to activeDelimiter

---

## Implementation Checklist

Once questions are answered:

- [ ] Add `getContentTextBetweenMarks` helper function
- [ ] Update condition at line 238 with `isBreakingEdit` detection
- [ ] Ensure focus marks converted to text in unwrap logic (line ~243)
- [ ] Update `skipNextFocusMarks` handling if needed
- [ ] Run existing test: `focus-mark-editing.spec.ts:149-186`
- [ ] Add new test case for regular typing (should NOT trigger)
- [ ] Manual testing with `*italic*` and `**bold**` scenarios
