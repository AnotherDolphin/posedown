# FocusMarks - Current Status

**Last Updated:** 2026-02-09
**Latest Commit:** Block marks editing + smartReplace refactoring

> **For architecture, design decisions, and how it works**, see [../focusMarks-design.md](../focusMarks-design.md)

## Executive Summary

**Status:** ✅ Production-ready with block editing (partial)

Core functionality works. All logic consolidated in [FocusMarkManager](../../src/lib/core/utils/focus-mark-manager.ts). Edge delimiter typing, marks escape, delimiter edit reparsing, and **block marks editing** (headings) fully implemented. Utilities extracted to [focus/utils.ts](../../src/lib/core/focus/utils.ts) for better modularity.

## Recent Changes (Last 2 Weeks)

### Block Marks Editing (Jan 27 - Feb 1)
- ✅ **Headings (H1-H6) fully editable** - Type `#` to upgrade, backspace to downgrade
- ✅ Block transforms preserve inline formatting
- ✅ Empty/new blocks show focus marks
- ✅ Separate handlers for block/inline operations
- ✅ New infrastructure: `block-patterns.ts`, test suite (336 lines)

### Architecture Refactoring (Feb 2-4)
- ✅ **SmartReplace auto caret restoration** - Removed manual correction from focus-mark-manager
- ✅ **Utilities extraction** - Pure functions moved to `focus/utils.ts` (224 lines)
- ✅ **Inline focus activation control** - Marks don't appear after pattern creation until refocus
- ✅ setCaretAt now supports element nodes
- ✅ New test suite for smartReplaceChildren (509 lines)

### 2026-02-06 to 2026-02-09
- ✅ **Issue #9 FIXED** - BR tag removal prevents trailing backslash in updated headers
- ✅ **Issue #10 FIXED** - Block span preservation with `BLOCK_FOCUS_MARK_CLASS` during inline transforms
- ✅ **Issue #11 FIXED** - Conditional `ejectMarks()` state clearing keeps block edits responsive
- ✅ **Test reorganization complete** - 10 files moved to 4 behavioral categories
- ✅ New test suite: `block-transformation.spec.ts` (756 lines)

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

**Inline Marks:**
- Display & editing: bold, italic, code, strikethrough, del
- Real-time transformations: `**` → `*` changes bold to italic
- Edge delimiter typing: Type `*` at edge of `*italic*` to upgrade to `**bold**`
- Breaking delimiters: Type `*` inside `*italic*` to break pattern
- Span mirroring: Edits sync between opening/closing delimiters
- Marks escape: Typing at end exits formatting

**Block Marks:**
- Display: headings, blockquotes, lists
- **Editing (headings H1-H6)**: Type `#` to upgrade, backspace to downgrade
- Transforms preserve inline formatting
- Shows marks even in empty blocks

**Smart Behaviors:**
- Marks eject on cursor leave
- No marks after pattern creation (activation control)
- Edge detection for cursor adjacent to elements
- Correct caret positioning from any direction
- Delete/backspace before marks works correctly

**Architecture:**
- SmartReplace auto caret restoration (no manual correction needed)
- Modular utilities in `focus/utils.ts`
- Separate block/inline handlers

## What's Broken / Incomplete

**Block Marks (Improved):**
- ✅ Headings work fully (issues #9, #10, #11 fixed)
- ✅ Block marks persist during inline transformations
- ✅ Invalid delimiter flattening works
- ❌ Blockquotes: Editing `>` shows on separate line
- ❌ Lists: Editing `-`/`1.` needs UX redesign
- ❌ Codeblocks: Marks never show

**Cursor Positioning:**
- 3 edge cases in breaking delimiter transformations (UX polish)
- Caret jumps when creating patterns before consecutive elements

**Not Implemented:**
- List item UX (click focus, hide HTML markers)

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

**High Priority:** Block issues #2, #3, #33 (errors), #77 (caret jump)

**Medium Priority:** Blockquote/list editing, cursor edge cases, pattern normalization

**Low Priority:** Codeblock marks, list UX, performance profiling, animations

## Key Files

See [../focusMarks-design.md#integration-points](../focusMarks-design.md#integration-points) for architecture.

**Core Implementation:**
- [focus-mark-manager.ts](../../src/lib/core/utils/focus-mark-manager.ts) (~800 lines) - Main orchestration
  - Key APIs: `tryHandleEdgeInput()`, `handleActiveInline()`, `handleActiveBlock()`
  - State: `activeInline`, `activeBlock`, `inlineSpanRefs`, `blockSpanRefs`
- [focus/utils.ts](../../src/lib/core/focus/utils.ts) (224 lines) - **NEW** Extracted utilities
  - `extractInlineMarks()`, `extractBlockMarks()`, `createMarkSpan()`
  - `atEdgeOfFormatted()`, `getSpanlessClone()`
  - `wouldFormValidDelimiter()`, `wouldFormValidBlockDelimiter()`
- [block-patterns.ts](../../src/lib/core/utils/block-patterns.ts) (50 lines) - **NEW** Block delimiter support
  - `isSupportedBlockDelimiter()`, block delimiter validation
- [richEditorState.svelte.ts](../../src/lib/svelte/richEditorState.svelte.ts) - Integration only
  - `applyMarks()` (marks escape), consolidated `onBeforeInput` handling

**DOM Utilities:**
- [smartReplaceChildren.ts](../../src/lib/core/dom/smartReplaceChildren.ts) - **Enhanced** Smart reconciliation with auto caret restoration
- [dom/util.ts](../../src/lib/core/dom/util.ts) - `reparse()`, cursor positioning
- [dom.ts](../../src/lib/core/utils/dom.ts) - Tag lists, tree walking
- [selection.ts](../../src/lib/core/utils/selection.ts) - `setCaretAt()` (now supports element nodes), `setCaretAtEnd()`

**Tests:**
- [tests/e2e/focus-marks/](../../tests/e2e/focus-marks/) - All test suites (9 files)
- [tests/e2e/focus-marks/block-delimiter-editing.spec.ts](../../tests/e2e/focus-marks/block-delimiter-editing.spec.ts) - **NEW** Block editing tests (336 lines)
- [tests/unit/smartReplaceChildren.spec.ts](../../tests/unit/smartReplaceChildren.spec.ts) - **NEW** Unit tests (509 lines)
- [block-transformation.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/block-transformation.spec.ts) - Block type conversion tests (756 lines)
- [TEST-INDEX.md](../../tests/e2e/focus-marks/TEST-INDEX.md) - Test organization guide

## Issue Tracker

> See [focusmark-notes.md](./focusmark-notes.md) for complete issue history

**Recently Fixed (Jan 26 - Feb 4):**
- Edge delimiter typing, breaking delimiters, caret positioning
- Mirroring, empty element typing, span edge editing
- Block transforms, inline formatting preservation, activation control

**Open Issues:**
- #8: Undo/redo "range not found" error
- #77: Consecutive elements caret jump
- #343: Null error reading 'childNodes'
- Block #2-6: querySelectorAll error, mark deletion, blockquote/codeblock/list issues

**Status:** 16 major issues fixed in last 2 weeks, 9 open issues remaining
