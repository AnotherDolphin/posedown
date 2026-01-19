# Focus Mark Test Results Analysis

**Date:** 2026-01-19
**Test Run:** After refactoring `smartReplaceChildren` with unified offsetToCaret for consistent tracking inside/outside active elements

## Test Structure

All focus mark tests are now consolidated under `tests/e2e/focus-marks/`:

```
tests/e2e/focus-marks/
├── activation.spec.ts              # Basic activation/deactivation tests
├── editing.spec.ts                 # Editing within focus marks
├── span-mirroring.spec.ts          # Span mirroring behavior
├── caret-boundary-position.spec.ts # Caret positioning at boundaries
├── caret-style-persistence.spec.ts # Caret style carryover prevention
├── span-persistence.spec.ts        # NEW: Span persistence during transformations
├── nested-transformations.spec.ts  # NEW: Edge cases with nesting
└── regression.spec.ts              # NEW: Regression tests for issue#5, #6
```

**Run command:**
```bash
npx playwright test tests/e2e/focus-marks/
```

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Tests** | 58 |
| **Passed** | 38 (65.5%) |
| **Failed** | 20 (34.5%) |

**Change from baseline (2026-01-18):** +1 passing test (+1.7%)

---

## Results by Spec File

### activation.spec.ts (14 tests)
**Passed: 8 | Failed: 6 (57.1%)**

| Status | Test |
|--------|------|
| ✓ | should show marks for element directly after cursor in adjacent text node (issue#34) |
| ✓ | should prioritize child element over parent when cursor at edge (issue#34) |
| ✓ | should show focus marks when clicking inside formatted element |
| ✓ | should hide focus marks when clicking outside formatted element |
| ✓ | should normalize delimiter syntax (underscore italic becomes asterisk) |
| ✓ | should normalize delimiter syntax (underscore bold becomes asterisk) |
| ✓ | should not show marks on newly created formatted elements |
| ✓ | should show marks for blockquotes |
| ✘ | should show marks for nested element when cursor at edge (issue#34) |
| ✘ | should show marks for element directly before cursor in adjacent text node (issue#34) |
| ✘ | should show different marks for different element types |
| ✘ | should transition marks when navigating between nested elements |
| ✘ | should show marks for block elements (headings) |
| ✘ | should show marks for list items |

---

### editing.spec.ts (5 tests)
**Passed: 4 | Failed: 1 (80%)**

| Status | Test |
|--------|------|
| ✓ | should change bold to italic by editing opening delimiter |
| ✓ | should handle typing non-delimiter chars inside focus mark span |
| ✓ | should unwrap completely when deleting all delimiters |
| ✓ | should preserve cursor position during unwrap |
| ✘ | should handle complex edit: change ** to *a* creating italic with different content (issue#10) |

---

### span-mirroring.spec.ts (12 tests)
**Passed: 7 | Failed: 5 (58.3%)**

| Status | Test |
|--------|------|
| ✓ | should mirror opening span edit to closing span |
| ✓ | should mirror opening span to closing for bold → italic transformation |
| ✓ | should mirror deletion of opening span to closing span |
| ✓ | should reject unsupported delimiter during mirroring |
| ✓ | should handle mirroring when typing character by character in opening span |
| ✓ | should normalize underscore delimiters and handle mirroring |
| ✓ | should preserve cursor position after mirroring and unwrap |
| ✘ | should mirror closing span edit to opening span (issue#7) |
| ✘ | should mirror deletion of closing span to opening span (issue#3) |
| ✘ | should mirror complex text replacement in opening span (issue#11) |
| ✘ | should mirror complex text replacement in closing span with supported delimiter (issue#11) |
| ✘ | should handle strikethrough delimiter editing (issue#11) |

---

### caret-boundary-position.spec.ts (6 tests)
**Passed: 3 | Failed: 3 (50%)**

| Status | Test |
|--------|------|
| ✓ | should handle typing delimiter BEFORE opening span (Home position) |
| ✓ | should handle typing delimiter AFTER closing span (End position) |
| ✓ | should not jump caret to end of block when typing before focus marks |
| ✘ | should handle typing delimiter between opening span and text |
| ✘ | should handle typing delimiter between text and closing span |
| ✘ | should maintain caret position when typing multiple delimiters at Home |

---

### caret-style-persistence.spec.ts (4 tests)
**Passed: 3 | Failed: 1 (75%)**

| Status | Test |
|--------|------|
| ✓ | should NOT persist \<em\> tag after delimiter deletion |
| ✓ | should NOT persist \<code\> tag after delimiter deletion |
| ✓ | should escape caret style when transforming bold to italic |
| ✘ | should NOT persist \<strong\> tag after delimiter deletion due to caret style carryover |

---

### span-persistence.spec.ts (4 tests) — NEW
**Passed: 3 | Failed: 1 (75%)**

| Status | Test |
|--------|------|
| ✓ | focus spans persist when typing creates new pattern inside active element |
| ✓ | focus spans are correctly positioned after transformation |
| ✓ | caret position correct after transformation with span reinjection |
| ✘ | caret stays in position after creating nested element |

---

### nested-transformations.spec.ts (6 tests) — NEW
**Passed: 6 | Failed: 0 (100%)**

| Status | Test |
|--------|------|
| ✓ | handles multiple pattern transformations with span persistence |
| ✓ | handles deeply nested formatting without losing outer spans |
| ✓ | handles transformation when only one span exists |
| ✓ | handles transformation when span contains selection |
| ✓ | handles transformation when spans are empty |
| ✓ | handles rapid sequential transformations |

---

### regression.spec.ts (7 tests) — NEW
**Passed: 4 | Failed: 3 (57.1%)**

| Status | Test |
|--------|------|
| ✓ | focus spans cleaned up when delimiter becomes unsupported |
| ✓ | issue#6 regression: focus spans not lost after pattern transformation |
| ✓ | issue#6 regression: nested pattern creation preserves outer focus marks |
| ✓ | issue#5 regression: multiple consecutive insertions maintain caret |
| ✘ | focus spans removed when pattern becomes invalid after transformation |
| ✘ | issue#5 regression: caret position stable with setCaretAtEnd |
| ✘ | issue#5 regression: caret stays at insertion point after transformation |

---

## Failure Categories

### Category 1: Closing Span Mirroring (3 failures)
**Root Cause:** Edits to closing delimiter span not mirrored to opening span.

- span-mirroring: should mirror closing span edit to opening span
- span-mirroring: should mirror deletion of closing span to opening span
- span-mirroring: should mirror complex text replacement in closing span

**Files:** `richEditorState.svelte.ts` lines ~197-261

---

### Category 2: Complex Mirroring / Selection (3 failures)
**Root Cause:** Selection-based replacements and complex edits not handled.

- span-mirroring: should mirror complex text replacement in opening span (issue#11)
- span-mirroring: should handle strikethrough delimiter editing (issue#11)
- editing: should handle complex edit (issue#10)

**Files:** `richEditorState.svelte.ts` - selection handling in span edit

---

### Category 3: Nested Element Detection (4 failures)
**Root Cause:** Issue#34 incomplete - child elements not prioritized at edges.

- activation: should show marks for nested element when cursor at edge
- activation: should show marks for element directly before cursor
- activation: should transition marks when navigating between nested elements
- activation: should show different marks for different element types

**Files:** `focus-mark-manager.ts` - `findFocusedInline()` method

---

### Category 4: Block Element Marks (2 failures)
**Root Cause:** Block marks (headings, lists) not showing.

- activation: should show marks for block elements (headings)
- activation: should show marks for list items

**Files:** `focus-mark-manager.ts` - `injectBlockMarks()`

---

### Category 5: Caret Position Edge Cases (5 failures)
**Root Cause:** Caret jumps or loses position at span boundaries.

- caret-boundary-position: typing delimiter between opening span and text
- caret-boundary-position: typing delimiter between text and closing span
- caret-boundary-position: multiple delimiters at Home
- span-persistence: caret stays in position after creating nested element
- caret-style-persistence: \<strong\> tag persistence

**Files:** `richEditorState.svelte.ts` - caret restoration logic

---

### Category 6: Regression Test Failures (3 failures)
**Root Cause:** Specific issue#5 scenarios still broken.

- regression: focus spans removed when pattern becomes invalid
- regression: issue#5 caret position stable with setCaretAtEnd
- regression: issue#5 caret stays at insertion point

**Files:** `richEditorState.svelte.ts` - `setCaretAtEnd` implementation

---

## Priority Summary

### High Priority (Core Functionality)
1. Fix closing span mirroring (3 tests)
2. Fix caret position edge cases (5 tests)
3. Fix nested element detection (4 tests)

### Medium Priority (Edge Cases)
4. Fix complex mirroring/selection (3 tests)
5. Fix block element marks (2 tests)

### Low Priority (Regression Gaps)
6. Fix remaining issue#5 regression scenarios (3 tests)

---

## Code Locations

| Component | File | Lines |
|-----------|------|-------|
| Span mirroring | `richEditorState.svelte.ts` | ~197-261 |
| Element detection | `focus-mark-manager.ts` | `findFocusedInline()` |
| Block marks | `focus-mark-manager.ts` | `injectBlockMarks()` |
| Caret restoration | `richEditorState.svelte.ts` | `setCaretAtEnd` |

---

## Related Documentation

- [focusmark-test-adjust.md](./focusmark-test-adjust.md) - Test adjustment guide
- [focusmark-notes.md](./focusmark-notes.md) - Issue tracking
- [focusMarks-status.md](./focusMarks-status.md) - Implementation status
- [../focusMarks-design.md](../focusMarks-design.md) - Design documentation

---

**Status:** 38/58 tests passing (65.5%), organized into 8 spec files under `tests/e2e/focus-marks/`

---

## Recent Improvements

**2026-01-19:** Refactored `smartReplaceChildren` with unified `offsetToCaret` for consistent caret tracking inside/outside active elements; standardized `getDomRangeFromContentOffsets`.
- Fixed blockquote focus mark activation
- Improved caret positioning consistency across block/inline elements
- **Result:** +1 passing test (blockquotes activation)
