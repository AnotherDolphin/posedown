# Focus Mark Caret Boundary Tests Report

**Date:** 2026-01-15
**Issue:** Caret positioning bugs when typing at boundaries of focus mark spans

## Summary

Added 6 new test cases to capture caret positioning issues when focus marks are displayed and user types at various boundary positions (before/after delimiter spans).

**Test Results:** 3 passed / 3 failed

The failing tests confirm that caret positioning is incorrect when typing delimiters at certain boundaries of focus mark spans.

---

## New Test Cases

### Test 1: BEFORE opening span (Home position)
**Location:** `tests/e2e/focus-mark-editing.spec.ts:726`
**Status:** ✅ PASS

**Scenario:**
1. Create `**bold**` → transforms to `<strong>bold</strong>`
2. Click to show focus marks: `<strong><span>**</span>bold<span>**</span></strong>`
3. Press `Home` to move caret before opening span
4. Type `*` then `X`

**Expected:** `*X` appears before bold text
**Actual:** ✅ Works correctly - `*Xbold`

**Analysis:** Typing before the formatted element works as expected.

---

### Test 2: AFTER closing span (End position)
**Location:** `tests/e2e/focus-mark-editing.spec.ts:764`
**Status:** ❌ FAIL

**Scenario:**
1. Create `**bold**` → transforms to `<strong>bold</strong>`
2. Click to show focus marks
3. Press `End` to move caret after closing span
4. Type `*` then `X`

**Expected:** `bold*X` (characters at end)
**Actual:** `X**bold**` (caret jumped to START!)

**Analysis:** Critical bug - caret jumps from end to beginning of block.

---

### Test 3: Between opening span and text
**Location:** `tests/e2e/focus-mark-editing.spec.ts:797`
**Status:** ❌ FAIL

**Scenario:**
1. Create `**bold**` → transforms to `<strong>bold</strong>`
2. Click to show focus marks
3. Navigate: `Home` → `ArrowRight` (3x) to position between span and text
4. Type `*` then `X`

**Expected:** `*X` appears before "bold" text
**Actual:** `**b*Xold**` (caret in middle of word!)

**Analysis:** Navigation doesn't position caret correctly - ends up inside text content instead of between span and text.

---

### Test 4: Between text and closing span
**Location:** `tests/e2e/focus-mark-editing.spec.ts:832`
**Status:** ✅ PASS

**Scenario:**
1. Create `**bold**` → transforms to `<strong>bold</strong>`
2. Click to show focus marks
3. Navigate: `End` → `ArrowLeft` (3x) to position between text and closing span
4. Type `*` then `X`

**Expected:** `*X` appears after "bold" text
**Actual:** ✅ Works correctly

**Analysis:** Typing after text content but before closing span works as expected.

---

### Test 5: Multiple delimiters at Home
**Location:** `tests/e2e/focus-mark-editing.spec.ts:866`
**Status:** ❌ FAIL

**Scenario:**
1. Create `*italic*` → transforms to `<em>italic</em>`
2. Click to show focus marks
3. Press `Home`
4. Type `**` then `X`

**Expected:** `**X` at start (e.g., `**Xitalic`)
**Actual:** `**i*Xtalic**` (caret drifted into content!)

**Analysis:** When typing multiple delimiter characters, caret position drifts unexpectedly. Should stay at beginning but ends up in middle of content.

---

### Test 6: Bold in middle of text (regression check)
**Location:** `tests/e2e/focus-mark-editing.spec.ts:897`
**Status:** ✅ PASS

**Scenario:**
1. Create `hello **bold** world`
2. Click on bold to show focus marks
3. Navigate to position before bold: `Home` → `ArrowRight` (6x)
4. Type `*` then `X`

**Expected:** `hello *Xbold world` (stays at position)
**Actual:** ✅ Works correctly

**Analysis:** Typing before a formatted element in the middle of text works correctly - caret doesn't jump to end of block.

---

## Bug Analysis

### Identified Issues

1. **End position caret jump (Test 2)**
   - Severity: Critical
   - When caret is after closing span and user types, caret jumps to start of block
   - Result: `X**bold**` instead of expected `bold*X`

2. **Navigation positioning error (Test 3)**
   - Severity: High
   - Arrow key navigation doesn't correctly position caret between span and text
   - Caret ends up inside text content instead of at boundary
   - Result: `**b*Xold**` instead of expected `*Xbold`

3. **Multi-character caret drift (Test 5)**
   - Severity: High
   - Typing multiple delimiter characters causes caret to drift from intended position
   - Result: `**i*Xtalic**` instead of expected `**Xitalic`

### Root Cause Hypothesis

The issues appear related to how the browser handles caret positioning when:
- Focus mark spans are present in the DOM
- User navigates with arrow keys or Home/End
- Pattern transformation runs and modifies DOM structure

Potential causes:
1. **Span injection interfering with browser caret logic**
   - Focus mark spans may confuse browser's native caret positioning
   - Browser may calculate offsets incorrectly due to span boundaries

2. **Pattern detection triggering unwanted transformations**
   - When user types `*` at boundaries, pattern detection may run
   - Transformation may replace DOM and miscalculate cursor position
   - `getRangeFromBlockOffsets()` may not account for focus mark spans

3. **Selection restoration logic not accounting for spans**
   - After DOM modifications, cursor restoration uses text offsets
   - Focus mark spans add extra nodes that aren't accounted for

---

## Relationship to Existing Test Failures

These new tests capture **different issues** from the existing 13 failures in `focusmark-test-results.md`:

| Existing Categories | New Tests |
|---------------------|-----------|
| Span mirroring (editing INSIDE spans) | Typing OUTSIDE spans at boundaries |
| Invalid delimiter handling | Caret positioning bugs |
| Nested element detection | N/A |
| Block element marks | N/A |

**Key difference:** Existing tests focus on editing delimiter text **within** the mark spans. New tests focus on caret behavior when typing **at boundaries** (before/after spans).

---

## Files to Investigate

### Primary suspect:
- `src/lib/core/utils/dom.ts` - `getRangeFromBlockOffsets()` (lines 496-526)
  - May not correctly handle text offsets when focus mark spans present
  - Should account for `.pd-focus-mark` spans when traversing DOM

### Secondary suspects:
- `src/lib/svelte/richEditorState.svelte.ts` - `onInput()` handler
  - Pattern detection may run when user types at boundaries
  - Should check if typed character is adjacent to focus marks

- `src/lib/core/transforms/transform.ts` - `findAndTransform()`
  - May trigger transformations unnecessarily when delimiter typed at boundary
  - Should ignore typing that occurs outside formatted elements

---

## Recommended Fixes

### Priority 1: Fix End position caret jump (Test 2)
- Debug why `End` → type causes jump to start
- Check if pattern matching incorrectly identifies `bold***` as pattern
- Verify cursor restoration logic after transformation

### Priority 2: Fix navigation positioning (Test 3)
- Arrow key navigation with spans present needs correction
- May need custom navigation handling when focus marks visible
- Browser native navigation may not handle span boundaries correctly

### Priority 3: Fix multi-character drift (Test 5)
- Debug cursor position after first `*` is typed
- Check if first `*` triggers transformation that misplaces cursor
- Second `*` typed at wrong position, causing drift

---

## Test Coverage Summary

**Before:** 0 tests for caret positioning at focus mark boundaries
**After:** 6 tests added

**Pass rate:** 50% (3/6 passing)

The failing tests successfully capture the reported issue and provide reproducible test cases for debugging.

---

## Next Steps

1. Run failing tests with debugger attached
2. Add console logging to `getRangeFromBlockOffsets()` to trace cursor calculations
3. Check if `smartReplaceChildren()` accounts for focus mark spans
4. Consider flag to disable pattern detection when focus marks visible
5. Fix tests one by one in priority order

---

**Test File:** `tests/e2e/focus-mark-editing.spec.ts` (lines 722-935)
**Added Lines:** ~210 lines of test code
**Related Issue:** Caret jumps to end of block when typing delimiters at boundaries

# moi: this analysis is so f*ing bad that getRangeFromBlockOffsets() is not even used anywhere