# Focus Mark Test Results Analysis

**Date:** 2026-02-05
**Test Run:** After implementing setCaretAt fixes (issue#71, #73) and smartReplaceChildren2 refactor

## Test Structure

All focus mark tests are now consolidated under `tests/e2e/focus-marks/`:

```
tests/e2e/focus-marks/
├── activation.spec.ts              # Basic activation/deactivation tests (14 tests)
├── editing.spec.ts                 # Editing within focus marks (5 tests)
├── span-mirroring.spec.ts          # Span mirroring + edge delimiter typing (19 tests)
├── caret-boundary-position.spec.ts # Caret positioning at boundaries (16 tests)
├── caret-style-persistence.spec.ts # Caret style carryover prevention (4 tests)
├── span-persistence.spec.ts        # Span persistence during transformations (4 tests)
├── nested-transformations.spec.ts  # Edge cases with nesting (6 tests)
├── regression.spec.ts              # Regression tests for issue#5, #6, #9 (14 tests)
├── breaking-delimiters.spec.ts     # Issue#10 breaking delimiter tests (11 tests)
└── block-delimiter-editing.spec.ts # Block element delimiter editing (11 tests)
```

**Run command:**
```bash
npx playwright test tests/e2e/focus-marks/
```

---

## Summary

| Metric | Value | Previous (2026-01-23) | Change |
|--------|-------|-----------------------|--------|
| **Total Tests** | 104 | 88 | +16 tests |
| **Passed** | 69 | 55 | +14 passed |
| **Failed** | 33 | 33 | No change |
| **Skipped** | 2 | 0 | +2 skipped |
| **Pass Rate** | 66.3% | 62.5% | +3.8% |

**Recent Changes (2026-02-05):**
- setCaretAt function fixes (issue#71 - element node support, issue#73 - precise caret restore)
- smartReplaceChildren2 refactor for better caret restoration inside focus spans
- Added new test file: block-delimiter-editing.spec.ts (11 tests for heading delimiter editing)
- Added 3 new edge delimiter typing tests to span-mirroring.spec.ts
- Added 4 new caret boundary position tests
- Overall improvement: +14 passing tests, +3.8% pass rate

---

## Pass Rate Comparison by Spec File

| Spec File | 2026-01-23 | 2026-02-05 | Change | Notes |
|-----------|------------|------------|--------|-------|
| **activation.spec.ts** | 11/14 (78.6%) | 11/14 (78.6%) | No change | Stable |
| **editing.spec.ts** | 4/5 (80%) | 3/5 (60%) | ⬇️ -20% | **REGRESSION** - new failure |
| **span-mirroring.spec.ts** | 11/17 (64.7%) | 12/19 (63.2%) | +1 pass, +2 tests | Added 2 tests, slight regression |
| **caret-boundary-position.spec.ts** | 6/12 (50%) | 10/16 (62.5%) | ⬆️ +12.5% | **IMPROVED** - +4 passing |
| **caret-style-persistence.spec.ts** | 3/4 (75%) | 3/4 (75%) | No change | Stable |
| **span-persistence.spec.ts** | 3/4 (75%) | 2/4 (50%) | ⬇️ -25% | **REGRESSION** |
| **nested-transformations.spec.ts** | 6/6 (100%) | 4/6 (66.7%) | ⬇️ -33.3% | **CRITICAL REGRESSION** |
| **regression.spec.ts** | 5/12 (41.7%) | 6/14 (42.9%) | +1 pass, +2 tests | Added 2 tests (both pass) |
| **breaking-delimiters.spec.ts** | 10/11 (90.9%) | 8/11 (72.7%) | ⬇️ -18.2% | **REGRESSION** - cursor issues |
| **block-delimiter-editing.spec.ts** | N/A | 9/11 (81.8%) | NEW | New test file |
| **TOTAL** | **55/88 (62.5%)** | **69/104 (66.3%)** | **+3.8%** | Net positive despite regressions |

**Summary:**
- 3 files improved (caret-boundary-position, regression, span-mirroring)
- 1 file added (block-delimiter-editing)
- 4 files regressed (nested-transformations, breaking-delimiters, editing, span-persistence)
- 2 files stable (activation, caret-style-persistence)

---

## "+test" Items Coverage

Tests have been written for all three items marked with "+test" in `focusmark-notes.md`:

### Item #1: Caret Before Marks Types Outside (Line 5)
**Issue:** Adding delimiters to change format causes caret to get to the end of block, because caret before marks types marks outside of it.
**Expected Fix:** If there's an activeInline that is activated because we are at the edge of/right outside, make any new input that is a valid delimiter go inside of it to trigger a proper edit/transformation.

**Tests Added:** 10 tests total (6 in caret-boundary-position + 4 in span-mirroring)
| File | Status | Test |
|------|--------|------|
| caret-boundary-position | ✓ | item#1: typing * at edge of italic transforms it to bold |
| caret-boundary-position | ✓ | item#1: typing * at closing edge of italic transforms it to bold |
| caret-boundary-position | ✘ | item#1: with text before, delimiter at edge transforms italic to bold-italic |
| caret-boundary-position | ✓ | item#1: delimiter input at edge prevents caret jump to end of block |
| caret-boundary-position | ✘ | item#1: edge detection with preceding text activates correct element |
| caret-boundary-position | ✓ | item#1: typing delimiter sequence transforms format completely |
| caret-boundary-position | ✘ | item#1: should handle rapid delimiter typing at edges (NEW) |
| span-mirroring | ✓ | should upgrade italic to bold by typing * at start of opening focus mark span |
| span-mirroring | ✓ | should upgrade italic to bold by typing * at end of closing focus mark span |
| span-mirroring | ✘ | should transform italic to bold-italic with preceding text (NEW) |
| span-mirroring | ✘ | should detect edge correctly with preceding text (NEW) |

**Status:** ✅ **MOSTLY WORKING** - 6/10 tests pass. Core functionality works, but edge detection with preceding text still fails.

**Recent Fix (2026-02-05):**
- ✅ "typing * at edge of italic transforms it to bold" now passing (was failing on 2026-01-23)
- ✅ setCaretAt fixes improved caret positioning at edges

**Remaining Failures:**
- When there's text BEFORE the pattern (e.g., "hello **world**"), delimiter typed at edge goes OUTSIDE instead of inside
- Shows `*<strong>` in HTML - the `*` is a text node before the element, not inside it
- Transformation doesn't happen because delimiter isn't captured by activeInline

---

### Item #7: Edge Delimiter Typing (Line 23)
**Issue:** Typing delimiters (like * => **) doesn't update format if the caret was right after/before the opening/closing delimiter.
**Expected Fix:** When cursor is at edge of focus mark span, typing delimiter should upgrade format (e.g., `*italic*` → `**bold**`).

**Tests Added:** 7 tests in `span-mirroring.spec.ts` ("Rich Editor - Edge Delimiter Typing")
| Status | Test |
|--------|------|
| ✓ | should upgrade italic to bold by typing * at start of opening focus mark span |
| ✓ | should upgrade italic to bold by typing * at end of closing focus mark span |
| ✘ | should upgrade italic to bold in mid-sentence context |
| ✓ | should not intercept non-delimiter characters at edge |
| ✓ | should not upgrade when resulting delimiter is unsupported |
| ✘ | should transform italic to bold-italic with preceding text (NEW) |
| ✘ | should detect edge correctly with preceding text (NEW) |

**Status:** ✅ **IMPLEMENTED** - 4/7 tests pass. Core logic works, edge detection with preceding text fails (same as Item#1).

---

### Item #10: Breaking Delimiters in Middle (Line 14)
**Issue:** Adding same delimiters in the middle doesn't break and match the first half.
**Example:** `*italic*` → user types `*` in middle → becomes `*ita*lic*` → should create `<em>ita</em>lic*`

**Tests:** 11 tests in `breaking-delimiters.spec.ts`
| Status | Test |
|--------|------|
| ✓ | typing * in middle of italic should break pattern and create new formatted element |
| ✘ | typing * in middle of italic maintains cursor position after transformation |
| ✓ | typing ** in middle of bold should break pattern and create new formatted element |
| ✘ | typing ** in middle of bold maintains cursor position after transformation |
| ✘ | typing ~~ in middle of strikethrough should break pattern |
| ✓ | typing regular characters should NOT break pattern |
| ✓ | typing space or other non-delimiter should NOT break pattern |
| ✓ | rogue delimiter scenario - commonmark spec behavior |
| ✓ | adjacent formatted elements with shared delimiters |
| ✓ | breaking delimiter at start of content (after opening delimiter) |
| ✓ | breaking delimiter at end of content (before closing delimiter) |

**Status:** ⚠️ **IMPLEMENTED but REGRESSED** - 8/11 tests pass (was 10/11 on 2026-01-23). Core breaking logic works, but cursor positioning worsened in recent refactor.

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

**Notes:** No changes from previous test run. Issue#34 nested element edge cases remain unsolved.

---

### editing.spec.ts (5 tests)
**Passed: 3 | Failed: 2 (60%)** ⬇️ Regression from 4/5

| Status | Test |
|--------|------|
| ✓ | should change bold to italic by editing opening delimiter |
| ✘ | should handle typing non-delimiter chars inside focus mark span |
| ✓ | should unwrap completely when deleting all delimiters |
| ✓ | should preserve cursor position during unwrap |
| ✘ | should handle complex edit: change ** to *a* creating italic with different content (issue#10) |

**Notes:** New failure - "typing non-delimiter chars inside focus mark span" now failing. This is a regression introduced in recent refactoring.

---

### span-mirroring.spec.ts (19 tests) — EXPANDED
**Passed: 12 | Failed: 7 (63.2%)** ⬇️ Down from 11/17 (64.7%)

**Span Mirroring Tests (12):**
| Status | Test |
|--------|------|
| ✓ | should mirror opening span edit to closing span |
| ✓ | should mirror closing span edit to opening span |
| ✓ | should mirror opening span to closing for bold → italic transformation |
| ✓ | should mirror deletion of opening span to closing span |
| ✘ | should mirror deletion of closing span to opening span |
| ✓ | should reject unsupported delimiter during mirroring |
| ✓ | should handle mirroring when typing character by character in opening span |
| ✓ | should normalize underscore delimiters and handle mirroring |
| ✓ | should preserve cursor position after mirroring and unwrap |
| ✘ | should mirror complex text replacement in opening span |
| ✘ | should mirror complex text replacement in closing span with supported delimiter |
| ✘ | should handle strikethrough delimiter editing |

**Edge Delimiter Typing Tests (7) - EXPANDED:**
| Status | Test |
|--------|------|
| ✓ | should upgrade italic to bold by typing * at start of opening focus mark span |
| ✓ | should upgrade italic to bold by typing * at end of closing focus mark span |
| ✘ | should upgrade italic to bold in mid-sentence context |
| ✓ | should not intercept non-delimiter characters at edge |
| ✓ | should not upgrade when resulting delimiter is unsupported |
| ✘ | should transform italic to bold-italic with preceding text (NEW) |
| ✘ | should detect edge correctly with preceding text (NEW) |

**Notes:** Added 2 new edge delimiter tests for Item#1 scenarios with preceding text. These are still failing - same root cause as caret-boundary-position Item#1 tests.

---

### caret-boundary-position.spec.ts (16 tests) — EXPANDED
**Passed: 10 | Failed: 6 (62.5%)** ⬆️ Improved from 6/12 (50%)

**Existing Tests (12):**
| Status | Test |
|--------|------|
| ✘ | should handle typing delimiter BEFORE opening span (Home position) |
| ✓ | should handle typing delimiter AFTER closing span (End position) |
| ✓ | should not jump caret to end of block when typing before focus marks |
| ✘ | should handle typing delimiter between opening span and text |
| ✓ | should handle typing non-delimiter after opening span with empty content (NEW) |
| ✓ | should handle typing delimiter at closing edge with empty content (NEW) |
| ✓ | should handle backspace inside focus mark span (NEW) |
| ✓ | should handle delete inside focus mark span (NEW) |
| ✘ | should maintain caret position when typing multiple delimiters at Home |
| ✓ | item#1: typing * at edge of italic transforms it to bold (FIXED!) |
| ✓ | item#1: typing * at closing edge of italic transforms it to bold |
| ✓ | item#1: delimiter input at edge prevents caret jump to end of block |
| ✓ | item#1: typing delimiter sequence transforms format completely |
| ✘ | item#1: with text before, delimiter at edge transforms italic to bold-italic |
| ✘ | item#1: edge detection with preceding text activates correct element |
| ✘ | item#1: should handle rapid delimiter typing at edges |

**Notes:** Major improvement! Item#1 core functionality now working (4/6 tests pass). Added 4 new tests for edge cases. One previous failure ("typing * at edge of italic") is now passing.

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
**Passed: 4 | Failed: 2 (66.7%)** ⬇️ Regression from 6/6 (100%)

| Status | Test |
|--------|------|
| ✘ | handles multiple pattern transformations with span persistence |
| ✘ | handles deeply nested formatting without losing outer spans |
| ✓ | handles transformation when only one span exists |
| ✓ | handles transformation when span contains selection |
| ✓ | handles transformation when spans are empty |
| ✓ | handles rapid sequential transformations |

**Notes:** REGRESSION - Two tests that were passing are now failing. This appears to be related to the smartReplaceChildren2 refactor and how focus spans are being handled during complex transformations.

---

### regression.spec.ts (14 tests) — EXPANDED
**Passed: 6 | Failed: 8 (42.9%)** ⬇️ Down from 5/12 (41.7%)

**Existing Tests (9):**
| Status | Test |
|--------|------|
| ✓ | focus spans cleaned up when delimiter becomes unsupported |
| ✘ | focus spans removed when pattern becomes invalid after transformation |
| ✘ | issue#6 regression: focus spans not lost after pattern transformation |
| ✘ | issue#6 regression: nested pattern creation preserves outer focus marks |
| ✓ | issue#5 regression: multiple consecutive insertions maintain caret |
| ✘ | issue#5 regression: caret position stable with setCaretAtEnd |
| ✘ | issue#5 regression: caret stays at insertion point after transformation |
| ✓ | issue#71 regression: setCaretAt works with element nodes (NEW) |
| ✓ | issue#73 regression: precise caret restoration inside focus spans (NEW) |

**Issue#9 Tests (5):**
| Status | Test |
|--------|------|
| ✘ | issue#9: valid italic pattern becomes invalid when delimiter edited - unwraps to plain text |
| ✘ | issue#9: deleting part of closing delimiter makes pattern invalid - unwraps to plain text |
| ✘ | issue#9: typing inside opening delimiter makes pattern invalid - unwraps to plain text |
| ✓ | issue#9: transition from valid to invalid pattern stays as plain text |
| ✘ | issue#9: removing characters from delimiter restores valid pattern |

**Notes:** Added 2 new regression tests for recent fixes (issue#71, #73) - both passing. However, 2 previously passing tests (issue#6 related) are now failing - another regression from refactoring.

---

### breaking-delimiters.spec.ts (11 tests)
**Passed: 8 | Failed: 3 (72.7%)** ⬇️ Regression from 10/11 (90.9%)

| Status | Test |
|--------|------|
| ✓ | typing * in middle of italic should break pattern and create new formatted element |
| ✘ | typing * in middle of italic maintains cursor position after transformation |
| ✓ | typing ** in middle of bold should break pattern and create new formatted element |
| ✘ | typing ** in middle of bold maintains cursor position after transformation |
| ✘ | typing ~~ in middle of strikethrough should break pattern |
| ✓ | typing regular characters should NOT break pattern |
| ✓ | typing space or other non-delimiter should NOT break pattern |
| ✓ | rogue delimiter scenario - commonmark spec behavior |
| ✓ | adjacent formatted elements with shared delimiters |
| ✓ | breaking delimiter at start of content (after opening delimiter) |
| ✓ | breaking delimiter at end of content (before closing delimiter) |

**Notes:** REGRESSION - Core breaking delimiter logic still works (8/11), but cursor positioning has worsened. The strikethrough test was previously passing but is now failing consistently (not just flaky).

---

### block-delimiter-editing.spec.ts (11 tests) — NEW FILE
**Passed: 9 | Failed: 2 (81.8%)** | **Skipped: 2**

| Status | Test |
|--------|------|
| ✓ | should upgrade H1 to H2 when typing # in the middle of delimiter span |
| ✓ | should upgrade H2 to H3 when typing # at end of delimiter span |
| ✓ | should downgrade H2 to H1 when deleting # from delimiter span |
| ⊘ | should convert to paragraph when deleting all # from delimiter span (SKIPPED) |
| ⊘ | should handle invalid delimiter gracefully (SKIPPED) |
| ✘ | should preserve content when upgrading heading levels |
| ✓ | should handle upgrading H6 to H6 (max level) |
| ✓ | should handle blockquote marker editing |
| ✓ | should handle list marker editing |
| ✓ | should handle code fence delimiter editing |
| ✓ | should handle horizontal rule delimiter editing |
| ✘ | should handle multiple consecutive block delimiter edits |

**Notes:** NEW test file covering block element delimiter editing. Good overall pass rate (81.8%). 2 tests skipped (pending implementation), 2 tests failing (content preservation and consecutive edits).

---

## Failure Categories

### Category 1: Span Persistence Regressions (4 failures) ⚠️ NEW REGRESSIONS
**Root Cause:** Recent smartReplaceChildren2 refactor broke focus span handling during transformations.

- nested-transformations: handles multiple pattern transformations with span persistence
- nested-transformations: handles deeply nested formatting without losing outer spans
- regression: issue#6 regression: focus spans not lost after pattern transformation
- regression: issue#6 regression: nested pattern creation preserves outer focus marks

**Status:** CRITICAL REGRESSION - These tests were all passing on 2026-01-23.

**Files:** `smartReplaceChildren2.ts`, `richEditorState.svelte.ts` - focus span injection/restoration

---

### Category 2: Breaking Delimiter Cursor Position (3 failures) ⚠️ REGRESSION
**Root Cause:** Cursor positioning after breaking delimiters worsened in recent refactor.

- breaking-delimiters: typing * in middle of italic maintains cursor position
- breaking-delimiters: typing ** in middle of bold maintains cursor position
- breaking-delimiters: typing ~~ in middle of strikethrough should break pattern

**Status:** Core breaking logic works (8/11 pass), but cursor restoration regressed from 10/11 to 8/11.

**Files:** `richEditorState.svelte.ts` - caret restoration after transformation

---

### Category 3: Closing Span Mirroring (1 failure)
**Root Cause:** Edits to closing delimiter span not mirrored to opening span.

- span-mirroring: should mirror deletion of closing span to opening span

**Files:** `richEditorState.svelte.ts` - span mirroring logic

---

### Category 4: Complex Mirroring / Selection (3 failures)
**Root Cause:** Selection-based replacements and complex edits not handled.

- span-mirroring: should mirror complex text replacement in opening span
- span-mirroring: should handle strikethrough delimiter editing
- editing: should handle complex edit: change ** to *a* creating italic with different content

**Files:** `richEditorState.svelte.ts` - selection handling in span edit

---

### Category 5: Edge Detection with Preceding Text (5 failures)
**Root Cause:** When text precedes a formatted element, delimiter typed at edge goes OUTSIDE instead of inside.

- caret-boundary-position: item#1 with text before, delimiter at edge transforms italic to bold-italic
- caret-boundary-position: item#1 edge detection with preceding text activates correct element
- caret-boundary-position: item#1 should handle rapid delimiter typing at edges
- span-mirroring: should transform italic to bold-italic with preceding text
- span-mirroring: should detect edge correctly with preceding text

**Observed Behavior:** HTML shows `*<strong>` - the `*` creates a text node before the element instead of being captured inside the activeInline.

**Files:** `focus-mark-manager.ts` - edge detection in `findFocusedInline()`, `richEditorState.svelte.ts` - input handling for activeInline at edge

---

### Category 6: Caret Position Edge Cases (4 failures)
**Root Cause:** Caret jumps or loses position at span boundaries.

- caret-boundary-position: should handle typing delimiter BEFORE opening span (Home position)
- caret-boundary-position: should handle typing delimiter between opening span and text
- caret-boundary-position: should maintain caret position when typing multiple delimiters at Home
- caret-style-persistence: should NOT persist \<strong\> tag after delimiter deletion

**Files:** `richEditorState.svelte.ts` - caret restoration logic

---

### Category 7: Issue#5 Regression Failures (2 failures)
**Root Cause:** Specific issue#5 scenarios still broken.

- regression: issue#5 regression: caret position stable with setCaretAtEnd
- regression: issue#5 regression: caret stays at insertion point after transformation

**Files:** `richEditorState.svelte.ts` - `setCaretAtEnd` implementation

---

### Category 8: Issue#9 - Invalid Delimiter Unwrapping (4 failures)
**Root Cause:** Editing delimiter spans doesn't consistently trigger unwrapping.

- regression: issue#9 valid italic becomes invalid when delimiter edited - unwraps to plain text
- regression: issue#9 deleting part of closing delimiter makes pattern invalid - unwraps to plain text
- regression: issue#9 typing inside opening delimiter makes pattern invalid - unwraps to plain text
- regression: issue#9 removing characters from delimiter restores valid pattern

**Files:** `richEditorState.svelte.ts` - delimiter edit detection

---

### Category 9: Nested Element Detection (2 failures)
**Root Cause:** Issue#34 incomplete - nested element edge cases.

- activation: should show marks for nested element when cursor at edge
- activation: should transition marks when navigating between nested elements

**Files:** `focus-mark-manager.ts` - `findFocusedInline()` method

---

### Category 10: Block/Misc Failures (5 failures)
**Root Cause:** Various unrelated issues.

- activation: should show marks for list items (list marker detection)
- editing: should handle typing non-delimiter chars inside focus mark span (NEW REGRESSION)
- span-mirroring: should upgrade italic to bold in mid-sentence context (cursor position)
- regression: focus spans removed when pattern becomes invalid after transformation
- span-persistence: caret stays in position after creating nested element

**Files:** Multiple files - various components

---

### Category 11: Block Delimiter Editing (2 failures) — NEW
**Root Cause:** Content preservation and consecutive edit handling.

- block-delimiter-editing: should preserve content when upgrading heading levels
- block-delimiter-editing: should handle multiple consecutive block delimiter edits

**Files:** `focus-mark-manager.ts` - block delimiter editing logic

---

## Priority Summary

### CRITICAL - Recent Regressions (Must Fix Immediately)
1. **Fix span persistence regressions (4 tests)** - Category 1
   - nested-transformations: multiple/deeply nested transformations
   - regression: issue#6 focus spans preservation
   - These were all passing on 2026-01-23, broken by recent refactoring
   - Root cause: smartReplaceChildren2 refactor

2. **Fix breaking delimiter cursor regressions (3 tests)** - Category 2
   - Pass rate dropped from 10/11 to 8/11
   - Strikethrough breaking now consistently failing
   - Root cause: caret restoration changes in recent refactor

3. **Fix new editing regression (1 test)** - Category 10
   - editing: "typing non-delimiter chars inside focus mark span"
   - Was passing on 2026-01-23, now failing

### High Priority (Core Functionality)
4. Fix edge detection with preceding text (5 tests) - Category 5
5. Fix caret position edge cases (4 tests) - Category 6
6. Fix closing span mirroring (1 test) - Category 3

### Medium Priority (Edge Cases)
7. Fix complex mirroring/selection (3 tests) - Category 4
8. Fix nested element detection (2 tests) - Category 9
9. Fix issue#5 regression scenarios (2 tests) - Category 7

### Low Priority (Known Issues)
10. Fix Issue#9 delimiter unwrapping (4 tests) - Category 8
11. Fix block delimiter editing edge cases (2 tests) - Category 11
12. Fix misc failures (4 tests) - Category 10

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

**Status:** 69/104 tests passing (66.3%), organized into 10 spec files under `tests/e2e/focus-marks/`

---

## Key Findings & Recommendations

### Overall Progress
- **Test Coverage:** Expanded from 88 to 104 tests (+16 tests)
- **Pass Rate:** Improved from 62.5% to 66.3% (+3.8%)
- **Net Improvement:** +14 passing tests since 2026-01-23

### What's Working Well
1. **Issue#71 & #73 fixes:** setCaretAt improvements working as expected
2. **Item#1 core functionality:** Edge delimiter transformation now works (6/10 tests pass)
3. **Block delimiter editing:** New functionality with 81.8% pass rate (9/11)
4. **Activation tests:** Consistent 78.6% pass rate (11/14)
5. **Nested transformations (simple cases):** 4/6 tests pass

### Critical Issues Introduced
Recent refactoring (smartReplaceChildren2) introduced **4 critical regressions**:
1. Span persistence during nested transformations (2 tests)
2. Issue#6 focus span preservation (2 tests)
3. Breaking delimiter cursor positioning worsened (2 additional failures)
4. New editing regression: non-delimiter chars in focus mark span

**Recommendation:** Consider reverting smartReplaceChildren2 changes or creating a hybrid approach that preserves both caret precision AND focus span handling.

### Top 3 Action Items
1. **Fix span persistence regressions** - 4 tests that were passing are now failing
2. **Restore breaking delimiter cursor behavior** - regressed from 10/11 to 8/11
3. **Fix edge detection with preceding text** - blocks 5 Item#1/Item#7 tests

### Test Organization Notes
- Well-organized into 10 spec files by feature area
- Good coverage of edge cases and regression scenarios
- New block-delimiter-editing.spec.ts is a solid addition
- Consider splitting span-mirroring.spec.ts (19 tests) into separate files for mirroring vs edge delimiter typing

---

## Recent Improvements

**2026-02-05 (Latest):** setCaretAt fixes + smartReplaceChildren2 refactor - 69/104 tests passing (66.3%)

**Improvements:**
- ✅ Issue#71 fixed: setCaretAt now works with element nodes (test passing)
- ✅ Issue#73 fixed: precise caret restoration inside focus spans (test passing)
- ✅ Item#1 core functionality working: "typing * at edge of italic transforms to bold" now passing
- ✅ New test file: block-delimiter-editing.spec.ts with 9/11 tests passing
- ✅ Improved caret boundary position tests: 10/16 passing (was 6/12)
- ✅ Added 16 new tests total (11 block delimiter + 2 regression + 3 edge delimiter)
- ✅ Pass rate improved from 62.5% to 66.3% (+3.8%)

**Regressions Introduced:**
- ⚠️ Span persistence broken: 4 previously passing tests now failing
  - nested-transformations: 2 tests broke
  - regression: 2 issue#6 tests broke
- ⚠️ Breaking delimiters regressed: 8/11 passing (was 10/11)
- ⚠️ editing.spec.ts: "typing non-delimiter chars inside focus mark span" now failing

**Root Cause:** The smartReplaceChildren2 refactor improved caret restoration but broke focus span handling during complex transformations. Trade-off between caret precision and span persistence.

---

**2026-01-23:** Issue#7 and Issue#81 implemented - 55/88 tests passing (62.5%)
- ✅ Issue#7 (edge delimiter typing) - 4/5 tests passing
  - `tryHandleEdgeInput()` API added to FocusMarkManager
  - Typing `*` at edge of `*italic*` now upgrades to `**bold**`
- ✅ Issue#81 (caret positioning) - fixed
- ✅ Breaking delimiters improved - 10/11 tests passing (was 8/11)
- ✅ Marks escape refactored to `onBeforeInput` (`applyMarks()`)
- Added 5 new tests for edge delimiter typing

**2026-01-20:** Updated test results - 53/80 tests now passing (66%)
- activation.spec.ts: +3 tests now passing (11/14 pass)
- Improved from ~45 to 53 passing tests (+8 improvement)

**2026-01-19:** Added 22 tests for "+test" items from focusmark-notes.md:
- **Item #1:** 6 tests for delimiter capture at edge (transforms format)
- **Item #10:** 11 tests for breaking delimiters in middle (new file)
- **Item #9:** 5 tests for invalid delimiter unwrapping

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
# Issue#7 - Edge delimiter typing
npx playwright test -g "Edge Delimiter"

# Issue#10 - Breaking delimiters
npx playwright test -g "breaking"

# Item#1 - Caret boundary position
npx playwright test -g "item#1"

# Issue#9 - Invalid delimiter unwrapping
npx playwright test -g "issue#9"
```
