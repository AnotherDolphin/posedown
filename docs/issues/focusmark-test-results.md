# Focus Mark Test Results Analysis

> **⚠️ NOTE:** These results are from the latest run but **pending test adjustments** for issue#6 fix.
> See [focusmark-test-adjust.md](./focusmark-test-adjust.md) for required test updates before final validation.

**Date:** 2026-01-18
**Test Run:** After fixing issue#6 (focus span reinjection during pattern transformation)

```
# Run both focus mark test files
npx playwright test tests/e2e/focus-mark-activation.spec.ts tests/e2e/focus-mark-editing.spec.ts

# Run only activation tests
npx playwright test tests/e2e/focus-mark-activation.spec.ts

# Run only editing tests
npx playwright test tests/e2e/focus-mark-editing.spec.ts
```

## Summary

**Previous Results:** 23/36 passed (63.9%)
**Current Results:** 24/36 passed (66.7%)
**Improvement:** +1 test fixed (issue#6 - focus span reinjection)

### Progress
- ✅ Fixed issue#6: Focus spans now persist during pattern transformations
- ✅ Fixed issue#5: Caret position stabilized with `setCaretAtEnd`
- ✅ 1 additional test now passing (from 23 → 24)
  - Line 272: Mirror closing span edit to opening span ✅ (now passing)
- ⚠️ Some tests may need expectation updates due to focus spans now persisting
- ❌ 12 tests still failing (down from 13)

---

## Category 1: Closing Span Mirroring Issues (4 failures)

**Root Cause:** Edits made to the closing delimiter span are not being mirrored back to the opening span. The mirroring logic appears to be unidirectional (opening → closing only).

> ✅ **Improvement:** Line 272 now passing after issue#6 fix (5 → 4 failures)

### Failures:

1. **focus-mark-editing.spec.ts:334** - Mirror closing span for italic → bold
   - User edits closing `*` to `**`
   - Expected: Transform to `<strong>`
   - Actual: Remains as `<em>`

2. **focus-mark-editing.spec.ts:389** - Mirror deletion of closing span
   - User deletes closing `~~`
   - Expected: Opening span removed, unwraps to `strike`
   - Actual: Still shows `~strike~` with both spans visible

3. **focus-mark-editing.spec.ts:442** - Complex text replacement in closing span
   - User replaces closing `*` with `~~`
   - Expected: Opening mirrors, unwraps to `~~text~~`, transforms to `<del>`
   - Actual: Only closing changed, result is `*text~~`

4. **focus-mark-editing.spec.ts:414** - Complex text replacement in opening span
   - User replaces opening `**` with `___`
   - Expected: Closing mirrors, unwraps to `___text___`
   - Actual: Partial mirroring, result is `*___text**`

**Files to Investigate:**
- `src/lib/svelte/richEditorState.svelte.ts` (lines ~197-261) - span editing logic
- Look for: Detection of which span was edited (opening vs closing)
- Likely fix: Add bidirectional mirroring, not just opening → closing

---

## Category 2: Invalid Delimiter Handling (3 failures)

**Root Cause:** When span edits result in invalid markdown delimiters, the system should unwrap to plain text and NOT re-apply formatting. Currently, it's still applying formatting even for invalid patterns.

### Failures:

1. **focus-mark-editing.spec.ts:110** - Keep mismatched delimiters as plain text
   - User edits opening `**` to `***`
   - Expected: Both mirror to `***`, unwrap to `***text***` (plain text, no `<strong>`)
   - Actual: `<strong>` still visible, invalid delimiter still formats

2. **focus-mark-editing.spec.ts:475** - Character by character typing
   - User types `x` inside opening `**` span, making it `**x`
   - Expected: Mirrors to closing, unwraps to `**xtest**x` (plain text)
   - Actual: `<strong>` still visible, invalid delimiter still formats

3. **focus-mark-editing.spec.ts:573** - Strong tag persistence (caret style carryover)
   - Complex scenario with multiple transformations
   - Expected: One `<em>` element
   - Actual: Strict mode violation - 2 `<em>` elements found
   - Indicates formatting being applied when it shouldn't

**Files to Investigate:**
- `src/lib/svelte/richEditorState.svelte.ts` - pattern validation after unwrapping
- `src/lib/core/parser/pattern.ts` - delimiter validation (SUPPORTED_INLINE_DELIMITERS)
- Likely fix: After mirroring and unwrapping, validate that the new delimiter is in SUPPORTED_INLINE_DELIMITERS before re-running transform

---

## Category 3: Nested Element Detection (3 failures)

**Root Cause:** Issue #34 implementation is incomplete. The system is not correctly prioritizing child elements over parent elements when the cursor is at edges or between nested elements.

> ✅ **Improvement:** Line 202 now passing (different marks for different element types)

### Failures:

1. **focus-mark-activation.spec.ts:20** - Nested element when cursor at edge
   - HTML: `<strong>...<em>text</em></strong>`, cursor at edge of `<em>`
   - Expected: Show marks for `<em>` (child element)
   - Actual: No focus marks showing at all

2. **focus-mark-activation.spec.ts:85** - Element before cursor in adjacent text node (issue #34)
   - Cursor in text node adjacent to formatted element
   - Expected: Show marks for adjacent formatted element
   - Actual: No focus marks showing

3. **focus-mark-activation.spec.ts:276** - Transition marks between nested elements
   - HTML: `<strong>bold and <em>italic</em></strong>`
   - Navigate from bold part → italic part
   - Expected: Marks transition from `**` to `*`
   - Actual: Still showing `**` when inside `<em>`

**Files to Investigate:**
- `src/lib/core/utils/focus-mark-manager.ts` - `findFocusedInline()` method
- `src/lib/core/utils/focus-mark-manager.ts` - `checkTextNodeEdges()` helper
- Current implementation: Uses `getFirstOfAncestors()` which walks up from cursor
- Issue: Not checking if cursor is at boundary between nested elements
- Likely fix: Enhance edge detection to check siblings and children, not just ancestors

---

## Category 4: Block Element Mark Display (2 failures)

**Root Cause:** Block element marks (blockquotes, list items) are either not showing or showing incorrect delimiters.

### Failures:

1. **focus-mark-activation.spec.ts:365** - List items showing `*` instead of `-`
   - Created: `- Item` (unordered list)
   - Expected: Focus mark shows `- `
   - Actual: Focus mark shows `* `
   - **This is a real bug** - system should normalize UL to `-`

2. **focus-mark-activation.spec.ts:345** - Blockquote marks
   - Created: `> Quote`
   - Expected: Focus mark shows `>`
   - Actual: Timeout - marks not showing at all

**Files to Investigate:**
- `src/lib/core/utils/focus-mark-manager.ts` - `extractDelimiters()` (lines ~169-183)
- Special handling for LI elements exists but may be broken
- `src/lib/core/parser/html-to-markdown.ts` - Check if UL → `-` conversion works
- `src/lib/core/utils/focus-mark-manager.ts` - `injectBlockMarks()` may not work for blockquotes

---

## Recommended Fix Priority

### High Priority (Most Impact):
1. **Fix closing span mirroring** (4 tests) - ✅ 1 fixed
   - Affects core editing functionality
   - Implementation: Detect which span was edited, mirror bidirectionally
   - Location: `richEditorState.svelte.ts` ~lines 197-261
   - Progress: Line 272 now passing after issue#6 fix

2. **Add invalid delimiter validation** (3 tests)
   - Prevents formatting bugs
   - Implementation: Check if unwrapped delimiter is in SUPPORTED_INLINE_DELIMITERS
   - Location: After unwrap, before re-running transform pipeline

### Medium Priority:
3. **Fix nested element detection** (3 tests)
   - Issue #34 follow-up
   - Implementation: Enhance `findFocusedInline()` edge detection
   - Location: `focus-mark-manager.ts`

4. **Fix list item delimiter** (1 test)
   - Simple fix, affects UX
   - Implementation: Debug `extractDelimiters()` for LI elements
   - Check `htmlToMarkdown()` UL conversion

### Low Priority:
5. **Fix blockquote marks** (1 test)
   - Edge case, less commonly used
   - Implementation: Debug `injectBlockMarks()` for blockquotes

---

## Test Details

### All Failures by File

**focus-mark-activation.spec.ts (5 failures):**
- Line 20: Nested element at edge (issue #34)
- Line 85: Element before cursor in adjacent text node (issue #34)
- Line 276: Transition between nested
- Line 345: Blockquotes
- Line 365: List items (wrong delimiter)

**focus-mark-editing.spec.ts (7 failures):**
- Line 110: Mismatched delimiters
- ~~Line 272: Closing span mirroring~~ ✅ **FIXED** (issue#6)
- Line 334: Closing span italic→bold
- Line 389: Closing span deletion
- Line 414: Opening span complex replacement
- Line 442: Closing span complex replacement
- Line 475: Character-by-character typing
- Line 573: Tag persistence / strict mode

**Total:** 12 failures (down from 13)

---

## Next Steps

**Immediate:**
1. **Update test expectations** for issue#6 fix - see [focusmark-test-adjust.md](./focusmark-test-adjust.md)
   - Adjust HTML output expectations (~5 tests)
   - Add regression tests for issue#6 and issue#5

**Implementation:**
2. Implement bidirectional span mirroring (Category 1 - 4 failures, 1 fixed)
3. Add delimiter validation before re-transforming (Category 2 - 3 failures)
4. Enhance nested element edge detection (Category 3 - 3 failures)
5. Debug list item delimiter extraction (1 failure)
6. Fix blockquote mark injection (1 failure)

---

## Code Locations to Review

### Primary Files:
- `src/lib/svelte/richEditorState.svelte.ts` (lines 197-261) - Span editing logic
- `src/lib/core/utils/focus-mark-manager.ts` - Mark injection/extraction
- `src/lib/core/parser/pattern.ts` - SUPPORTED_INLINE_DELIMITERS

### Helper Functions:
- `focus-mark-manager.ts:findFocusedInline()` - Element detection
- `focus-mark-manager.ts:extractDelimiters()` - Delimiter reverse-engineering
- `richEditorState.svelte.ts:onInput()` - Input handler with span mirroring

---

**Status:** 12 failures remaining, categorized by root cause for systematic fixing

**Note:** Test expectations may need adjustment for focus span persistence - see [focusmark-test-adjust.md](./focusmark-test-adjust.md)
