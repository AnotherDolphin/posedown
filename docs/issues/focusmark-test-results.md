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
├── caret-boundary-position.spec.ts # Caret positioning at boundaries + Item#1 tests
├── caret-style-persistence.spec.ts # Caret style carryover prevention
├── span-persistence.spec.ts        # Span persistence during transformations
├── nested-transformations.spec.ts  # Edge cases with nesting
├── regression.spec.ts              # Regression tests for issue#5, #6, #9
└── breaking-delimiters.spec.ts     # NEW: Issue#10 breaking delimiter tests
```

**Run command:**
```bash
npx playwright test tests/e2e/focus-marks/
```

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Tests** | 80 |
| **Passed** | 53 |
| **Failed** | 27 |

**New Tests Added (2026-01-19):** +22 tests for items marked with "+test" in focusmark-notes.md

---

## "+test" Items Coverage

Tests have been written for all three items marked with "+test" in `focusmark-notes.md`:

### Item #1: Caret Before Marks Types Outside (Line 5)
**Issue:** Adding delimiters to change format causes caret to get to the end of block, because caret before marks types marks outside of it.
**Expected Fix:** If there's an activeInline that is activated because we are at the edge of/right outside, make any new input that is a valid delimiter go inside of it to trigger a proper edit/transformation.

**Tests Added:** 6 new tests in `caret-boundary-position.spec.ts`
| Status | Test |
|--------|------|
| ✘ | item#1: typing * at edge of italic transforms it to bold |
| ✓ | item#1: typing * at closing edge of italic transforms it to bold |
| ✘ | item#1: with text before, delimiter at edge transforms italic to bold-italic |
| ✓ | item#1: delimiter input at edge prevents caret jump to end of block |
| ✘ | item#1: edge detection with preceding text activates correct element |
| ✓ | item#1: typing delimiter sequence transforms format completely |

**Status:** ⚠️ **PARTIALLY WORKING** - 3/6 tests pass. Edge detection with preceding text fails.

**Key Failures:**
- When there's text BEFORE the pattern (e.g., "hello **world**"), delimiter typed at edge goes OUTSIDE instead of inside
- Shows `*<strong>` in HTML - the `*` is a text node before the element, not inside it
- Transformation doesn't happen because delimiter isn't captured by activeInline

**Key Verifications:**
- Delimiter typed at edge goes INSIDE activeInline (not outside)
- Transformation actually happens (e.g., `*italic*` → `**italic**` → `<strong>`)
- Tests include text BEFORE pattern to test edge detection with adjacent content
- Caret does NOT jump to end of block

---

### Item #10: Breaking Delimiters in Middle (Line 14)
**Issue:** Adding same delimiters in the middle doesn't break and match the first half.
**Example:** `*italic*` → user types `*` in middle → becomes `*ita*lic*` → should create `<em>ita</em>lic*`

**Tests Added:** 11 new tests in `breaking-delimiters.spec.ts` (NEW FILE)
| Status | Test |
|--------|------|
| ✘ | typing * in middle of italic should break pattern and create new formatted element |
| ✓ | typing * in middle of italic maintains cursor position after transformation |
| ✘ | typing ** in middle of bold should break pattern and create new formatted element |
| ✓ | typing ** in middle of bold maintains cursor position after transformation |
| ✘ | typing ~~ in middle of strikethrough should break pattern |
| ✓ | typing regular characters should NOT break pattern |
| ✓ | typing space or other non-delimiter should NOT break pattern |
| ✓ | rogue delimiter scenario - commonmark spec behavior |
| ✓ | adjacent formatted elements with shared delimiters |
| ✓ | breaking delimiter at start of content (after opening delimiter) |
| ✓ | breaking delimiter at end of content (before closing delimiter) |

**Status:** ❌ **NOT IMPLEMENTED** - Core breaking logic (3 tests) fails, edge cases pass.
**Implementation Plan:** See `docs/issues/issue10-implementation.md`

---

### Item #9: Invalid Delimiter Unwrapping (Line 19)
**Issue:** Spans don't unwrap as simple text when delimiters become invalid.
**Expected:** When pattern becomes invalid (e.g., `***text***`), the formatted element should unwrap to plain text.

**Tests Added:** 5 new tests in `regression.spec.ts`
| Status | Test |
|--------|------|
| ✘ | issue#9: valid italic pattern becomes invalid when delimiter edited - unwraps to plain text |
| ✘ | issue#9: deleting part of closing delimiter makes pattern invalid - unwraps to plain text |
| ✘ | issue#9: typing inside opening delimiter makes pattern invalid - unwraps to plain text |
| ✓ | issue#9: transition from valid to invalid pattern stays as plain text |
| ✘ | issue#9: removing characters from delimiter restores valid pattern |

**Status:** ⚠️ **PARTIALLY IMPLEMENTED** - Some invalid pattern detection works, but editing delimiters doesn't consistently trigger unwrapping.

---

## Results by Spec File

### activation.spec.ts (14 tests)
**Passed: 11 | Failed: 3 (78.6%)**

| Status | Test |
|--------|------|
| ✓ | should show marks for element directly after cursor in adjacent text node (issue#34) |
| ✓ | should show marks for element directly before cursor in adjacent text node (issue#34) |
| ✓ | should prioritize child element over parent when cursor at edge (issue#34) |
| ✓ | should show focus marks when clicking inside formatted element |
| ✓ | should hide focus marks when clicking outside formatted element |
| ✓ | should show different marks for different element types |
| ✓ | should normalize delimiter syntax (underscore italic becomes asterisk) |
| ✓ | should normalize delimiter syntax (underscore bold becomes asterisk) |
| ✓ | should not show marks on newly created formatted elements |
| ✓ | should show marks for block elements (headings) |
| ✓ | should show marks for blockquotes |
| ✘ | should show marks for nested element when cursor at edge (issue#34) |
| ✘ | should transition marks when navigating between nested elements |
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

### caret-boundary-position.spec.ts (12 tests) — UPDATED
**Passed: 6 | Failed: 6 (50%)**

**Existing Tests (6):**
| Status | Test |
|--------|------|
| ✓ | should handle typing delimiter BEFORE opening span (Home position) |
| ✓ | should handle typing delimiter AFTER closing span (End position) |
| ✓ | should not jump caret to end of block when typing before focus marks |
| ✘ | should handle typing delimiter between opening span and text |
| ✘ | should handle typing delimiter between text and closing span |
| ✘ | should maintain caret position when typing multiple delimiters at Home |

**NEW Item#1 Tests (6):**
| Status | Test |
|--------|------|
| ✘ | item#1: typing * at edge of italic transforms it to bold |
| ✓ | item#1: typing * at closing edge of italic transforms it to bold |
| ✘ | item#1: with text before, delimiter at edge transforms italic to bold-italic |
| ✓ | item#1: delimiter input at edge prevents caret jump to end of block |
| ✘ | item#1: edge detection with preceding text activates correct element |
| ✓ | item#1: typing delimiter sequence transforms format completely |

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

### span-persistence.spec.ts (4 tests)
**Passed: 3 | Failed: 1 (75%)**

| Status | Test |
|--------|------|
| ✓ | focus spans persist when typing creates new pattern inside active element |
| ✓ | focus spans are correctly positioned after transformation |
| ✓ | caret position correct after transformation with span reinjection |
| ✘ | caret stays in position after creating nested element |

---

### nested-transformations.spec.ts (6 tests)
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

### regression.spec.ts (12 tests) — UPDATED
**Passed: 5 | Failed: 7 (41.7%)**

**Existing Tests (7):**
| Status | Test |
|--------|------|
| ✓ | focus spans cleaned up when delimiter becomes unsupported |
| ✓ | issue#6 regression: focus spans not lost after pattern transformation |
| ✓ | issue#6 regression: nested pattern creation preserves outer focus marks |
| ✓ | issue#5 regression: multiple consecutive insertions maintain caret |
| ✘ | focus spans removed when pattern becomes invalid after transformation |
| ✘ | issue#5 regression: caret position stable with setCaretAtEnd |
| ✘ | issue#5 regression: caret stays at insertion point after transformation |

**NEW Issue#9 Tests (5):**
| Status | Test |
|--------|------|
| ✘ | issue#9: valid italic pattern becomes invalid when delimiter edited - unwraps to plain text |
| ✘ | issue#9: deleting part of closing delimiter makes pattern invalid - unwraps to plain text |
| ✘ | issue#9: typing inside opening delimiter makes pattern invalid - unwraps to plain text |
| ✓ | issue#9: transition from valid to invalid pattern stays as plain text |
| ✘ | issue#9: removing characters from delimiter restores valid pattern |

---

### breaking-delimiters.spec.ts (11 tests) — NEW FILE
**Passed: 8 | Failed: 3 (72.7%)**

| Status | Test |
|--------|------|
| ✘ | typing * in middle of italic should break pattern and create new formatted element |
| ✓ | typing * in middle of italic maintains cursor position after transformation |
| ✘ | typing ** in middle of bold should break pattern and create new formatted element |
| ✓ | typing ** in middle of bold maintains cursor position after transformation |
| ✘ | typing ~~ in middle of strikethrough should break pattern |
| ✓ | typing regular characters should NOT break pattern |
| ✓ | typing space or other non-delimiter should NOT break pattern |
| ✓ | rogue delimiter scenario - commonmark spec behavior |
| ✓ | adjacent formatted elements with shared delimiters |
| ✓ | breaking delimiter at start of content (after opening delimiter) |
| ✓ | breaking delimiter at end of content (before closing delimiter) |

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

### Category 3: Nested Element Detection (2 failures)
**Root Cause:** Issue#34 incomplete - nested element edge cases.

- activation: should show marks for nested element when cursor at edge
- activation: should transition marks when navigating between nested elements

**Files:** `focus-mark-manager.ts` - `findFocusedInline()` method

---

### Category 4: Block Element Marks (1 failure)
**Root Cause:** List item marks not showing correctly (expecting "-" but getting "*").

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

### Category 7: Issue#10 - Breaking Delimiters (3 failures) — NEW
**Root Cause:** Breaking delimiter logic not implemented.

- breaking-delimiters: typing * in middle of italic should break pattern
- breaking-delimiters: typing ** in middle of bold should break pattern
- breaking-delimiters: typing ~~ in middle of strikethrough should break pattern

**Files:** `richEditorState.svelte.ts` - needs implementation per `issue10-implementation.md`

---

### Category 8: Issue#9 - Invalid Delimiter Unwrapping (4 failures) — NEW
**Root Cause:** Editing delimiter spans doesn't consistently trigger unwrapping.

- regression: issue#9 valid italic becomes invalid when delimiter edited
- regression: issue#9 deleting part of closing delimiter makes pattern invalid
- regression: issue#9 typing inside opening delimiter makes pattern invalid
- regression: issue#9 removing characters from delimiter restores valid pattern

**Files:** `richEditorState.svelte.ts` - delimiter edit detection

---

### Category 9: Item#1 - Edge Detection with Preceding Text (3 failures) — NEW
**Root Cause:** When text precedes a formatted element, delimiter typed at edge goes OUTSIDE instead of inside.

- caret-boundary-position: item#1 typing * at edge of italic transforms it to bold
- caret-boundary-position: item#1 with text before, delimiter at edge transforms italic to bold-italic
- caret-boundary-position: item#1 edge detection with preceding text activates correct element

**Observed Behavior:** HTML shows `*<strong>` - the `*` creates a text node before the element instead of being captured inside the activeInline.

**Files:** `focus-mark-manager.ts` - edge detection in `findFocusedInline()`, `richEditorState.svelte.ts` - input handling for activeInline at edge

---

## Priority Summary

### High Priority (Core Functionality)
1. Fix closing span mirroring (3 tests)
2. Fix caret position edge cases (5 tests)
3. Fix Item#1 edge detection with preceding text (3 tests)

### Medium Priority (Edge Cases)
4. Fix complex mirroring/selection (3 tests)
5. Implement Issue#10 breaking delimiters (3 tests)
6. Fix nested element detection (2 tests)

### Low Priority (Regression Gaps)
7. Fix remaining issue#5 regression scenarios (3 tests)
8. Fix Issue#9 delimiter unwrapping (4 tests)
9. Fix block element marks - list items (1 test)

---

## Code Locations

| Component | File | Lines |
|-----------|------|-------|
| Span mirroring | `richEditorState.svelte.ts` | ~197-261 |
| Element detection | `focus-mark-manager.ts` | `findFocusedInline()` |
| Block marks | `focus-mark-manager.ts` | `injectBlockMarks()` |
| Caret restoration | `richEditorState.svelte.ts` | `setCaretAtEnd` |
| Breaking delimiters | `richEditorState.svelte.ts` | needs implementation |
| Delimiter unwrapping | `richEditorState.svelte.ts` | delimiter edit detection |

---

## Related Documentation

- [focusmark-notes.md](./focusmark-notes.md) - Issue tracking (source of +test items)
- [issue10-implementation.md](./issue10-implementation.md) - Issue#10 implementation plan
- [focusMarks-status.md](./focusMarks-status.md) - Implementation status
- [../focusMarks-design.md](../focusMarks-design.md) - Design documentation

---

**Status:** 53/80 tests passing (66%), organized into 9 spec files under `tests/e2e/focus-marks/`

---

## Recent Improvements

**2026-01-20 (Latest):** Updated test results - 53/80 tests now passing (66%)
- activation.spec.ts: +3 tests now passing (11/14 pass)
  - ✓ should show marks for element directly before cursor in adjacent text node
  - ✓ should show different marks for different element types
  - ✓ should show marks for block elements (headings)
- Improved from ~45 to 53 passing tests (+8 improvement)

**2026-01-19:** Added 22 tests for "+test" items from focusmark-notes.md:
- **Item #1:** 6 tests for delimiter capture at edge (transforms format)
- **Item #10:** 11 tests for breaking delimiters in middle (new file)
- **Item #9:** 5 tests for invalid delimiter unwrapping

**2026-01-19:** Refactored `smartReplaceChildren` with unified `offsetToCaret` for consistent caret tracking inside/outside active elements; standardized `getDomRangeFromContentOffsets`.
- Fixed blockquote focus mark activation
- Improved caret positioning consistency across block/inline elements
- **Result:** +1 passing test (blockquotes activation)

---

## Test Execution Commands

Run all focus mark tests:
```bash
npx playwright test tests/e2e/focus-marks/
```

Run individual test files:
```bash
# Issue#10 - Breaking delimiters
npx playwright test tests/e2e/focus-marks/breaking-delimiters.spec.ts

# Issue#9 - Invalid delimiter unwrapping (part of regression)
npx playwright test tests/e2e/focus-marks/regression.spec.ts

# Item#1 - Caret boundary position / edge detection
npx playwright test tests/e2e/focus-marks/caret-boundary-position.spec.ts
```

Run specific test by name:
```bash
npx playwright test -g "item#1"
npx playwright test -g "issue#9"
npx playwright test -g "breaking"
```
