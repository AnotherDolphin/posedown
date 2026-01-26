# FocusMarks - Current Status

**Last Updated:** 2026-01-26
**Latest Commit:** Multiple delimiter edit reparsing fixes

> **For architecture, design decisions, and how it works**, see [../focusMarks-design.md](../focusMarks-design.md)

## Executive Summary

**Status:** ✅ Production-ready with edge delimiter support

Core functionality works. All logic consolidated in [FocusMarkManager](../../src/lib/core/utils/focus-mark-manager.ts). Edge delimiter typing, marks escape, and delimiter edit reparsing fully implemented.

## Recent Changes

### 2026-01-26
- ✅ **Multiple delimiter edit reparsing fixes** - Invalid changes now trigger proper reparse
- ✅ Refactored `checkAndMirrorSpans` to track `invalidChanges` separately

### 2026-01-25
- ✅ **Issue #73 FIXED** - Typing inside end span (e.g., `*bold|*`) now triggers focus span edit
- ✅ **Issue #74 FIXED** - Emptying focused element then typing no longer doubles delimiters
- ✅ **Issue #75 FIXED** - Typing between delimiters now predictable, focus marks stay visible
- ✅ **Issue #71/71.1 FIXED** - Mirroring no longer displaces caret incorrectly
- ✅ Handle `after-opening` as span-edge editing case for marks escape

### 2026-01-23
- ✅ **Issue #7 FIXED** - Edge delimiter typing (upgrade `*` to `**` at element edges)
- ✅ **Issue #81 FIXED** - Caret positioning when approaching from right
- ✅ New API: `tryHandleEdgeInput()` - handles typing delimiters at focus mark span edges
- ✅ Marks escape refactored - moved from `onKeydown` to `onBeforeInput` (`applyMarks()`)
- ✅ All text input handling consolidated in `onBeforeInput`

### 2026-01-21 (Commit fded9d0)
- ✅ All logic moved from `richEditorState` to `FocusMarkManager`
- ✅ **Issue #10 FIXED** - Breaking delimiters work (8/11 tests passing)
- ✅ New API: `handleActiveInline()`, `handleNestedPatterns()`, `handleBreakingDelimiters()`, `unfocus()`, `getSpanlessClone()`
- ✅ Renamed: `unwrapFormattedElement` → `reparse`
- ✅ `richEditorState` simplified to single method call

### 2026-01-20
- ✅ Issue #67 fixed - Delete before focus marks
- ✅ Space input in formatted text
- ✅ Test suite reorganized (9 files)
- ✅ `smartReplaceChildren` refactored

## What Works ✅

**Core Features:**
- Inline marks (bold, italic, code, strikethrough, del)
- Block marks (headings, blockquotes, lists)
- Marks eject on cursor leave
- `skipNextFocusMarks` prevents marks after transformations
- Span mirroring (edits sync between pairs)

**Advanced Features:**
- Real-time transformations (edit `**` → `*` to transform bold → italic)
- **Edge delimiter typing (issue #7)** - type `*` at edge of `*italic*` to upgrade to `**bold**`
- **Breaking delimiters (issue #10)** - type `*` inside `*italic*` breaks pattern
- Edge detection (issue #34) - cursor adjacent to formatted elements
- **Caret positioning (issue #81)** - correct positioning when approaching from right
- Nested patterns - type `**bold**` inside `*italic*`
- Delete/backspace before marks (issue #67)
- Marks escape - typing at end of styled element exits formatting

## What's Broken / Incomplete

### Partially Working ⏳
**Cursor positioning edge cases** - 3/11 tests failing
- Affects: Breaking delimiter transformations
- Impact: UX polish (core functionality works)
- Tests: [breaking-delimiters.spec.ts:66,149,186](../../tests/e2e/focus-marks/breaking-delimiters.spec.ts)

### Not Implemented ⚠️
**Block mark editing**
- Editing `#` → `##` should change heading level
- Editing `>` should unwrap blockquote
- Editing `-`/`1.` should change list type
- Requires different transformation strategy

**List item UX**
- Click should focus end of text, not span
- Should hide default HTML markers when markdown marks shown

## Test Results

**Full test suite:** 58/94 passing (61.7%)

### Breaking Delimiters (Issue #10): 8/11 passing ✅
- ✅ Type `*` in middle of italic - breaks pattern
- ✅ Type `**` in middle of bold - breaks pattern
- ✅ Type `~~` in middle of strikethrough - breaks pattern
- ✅ Regular characters don't break
- ✅ Space doesn't break
- ✅ Rogue delimiter scenarios
- ✅ Adjacent formatted elements
- ✅ Breaking at start/end
- ❌ Cursor position after break (3 failures)

**Test files:** [tests/e2e/focus-marks/](../../tests/e2e/focus-marks/)
- 9 test files, 94 tests total
- Core features: Working
- Edge cases: 36 failures (mostly cursor positioning, nested transformations)

## Next Steps

### High Priority
1. Fix 3 cursor position edge cases
2. Add cursor assertions to transformation tests

### Medium Priority
3. Implement block mark editing
4. List item UX improvements

### Low Priority
5. Performance profiling
6. Animation/transitions
7. Configurable styling

## Key Files

See [../focusMarks-design.md#integration-points](../focusMarks-design.md#integration-points) for architecture.

**Core Implementation:**
- [focus-mark-manager.ts](../../src/lib/core/utils/focus-mark-manager.ts) (661 lines) - All logic here
  - Key APIs: `tryHandleEdgeInput()`, `isAtEdge()`, `wouldFormValidDelimiter()`, `checkAndMirrorSpans()`
- [richEditorState.svelte.ts](../../src/lib/svelte/richEditorState.svelte.ts) - Integration only
  - New: `applyMarks()` (marks escape), consolidated `onBeforeInput` handling

**DOM Utilities:**
- [smartReplaceChildren.ts](../../src/lib/core/dom/smartReplaceChildren.ts) - Smart reconciliation
- [dom/util.ts](../../src/lib/core/dom/util.ts) - `reparse()`, cursor positioning
- [dom.ts](../../src/lib/core/utils/dom.ts) - Tag lists, tree walking

**Tests:**
- [tests/e2e/focus-marks/](../../tests/e2e/focus-marks/) - All test suites

## Issue Tracker

| Issue | Status | Notes |
|-------|--------|-------|
| #3/3.2 | ✅ Fixed | Caret restoration after deleting from end |
| #5 | ✅ Fixed | setCaretAfter for new patterns inside activeElement |
| #6 | ✅ Fixed | Focus spans preserved after pattern transformation |
| #7 | ✅ Fixed | Edge delimiter typing (upgrade format at element edges) |
| #7.1 | ✅ Fixed | Caret no longer jumps to end when adding delimiters |
| #10 | ✅ Fixed | Breaking delimiters (8/11 tests, 3 cursor edge cases) |
| #11 | ✅ Fixed | Single tilde for strikethrough |
| #34 | ✅ Fixed | Edge detection |
| #67 | ✅ Fixed | Delete before marks |
| #71/71.1 | ✅ Fixed | Mirroring caret displacement |
| #72 | ✅ Fixed | Typing between delimiters |
| #73 | ✅ Fixed | Typing inside end span triggers edit |
| #74 | ✅ Fixed | Empty element typing no longer doubles delimiters |
| #75 | ✅ Fixed | Typing between delimiters predictable |
| #81 | ✅ Fixed | Caret positioning when approaching from right |
| #8 | 🔴 Open | Undo/redo "range not found" error |
| #9 | 🔴 Open | Spans don't unwrap when delimiters become invalid |
| #343 | 🔴 Open | Null error reading 'childNodes' |
| - | ⏳ Partial | Cursor positioning (edge cases in caret-boundary tests) |
| - | ⚠️ Not Impl | Block mark editing |
| - | ⚠️ Not Impl | List UX |
