# FocusMarks - Current Status

**Last Updated:** 2026-02-20
**Latest Commit:** `b32db79` — findFirstMdMatch regression tracking, smartReplace offset fix, stray delimiter cleanup

> **For architecture, design decisions, and how it works**, see [../focusMarks-design.md](../focusMarks-design.md)

## Executive Summary

**Status:** ✅ Production-ready with block editing (partial)

Core functionality works. All logic consolidated in [FocusMarkManager](../../src/lib/core/utils/focus-mark-manager.ts). Edge delimiter typing, marks escape, delimiter edit reparsing, and **block marks editing** (headings) fully implemented. Utilities extracted to [focus/utils.ts](../../src/lib/core/focus/utils.ts) for better modularity.

## Recent Changes (Last 2 Weeks)

### 2026-02-13 to 2026-02-20
- ✅ **Issue #77 FIXED** - Consecutive inline elements no longer cause caret jump; new test: `consecutive-elements.spec.ts`
- ✅ **Issue #78 FIXED** - Invalid span edits are now flattened inline inside `checkAndMirrorSpans()` (replaces span with text node + restores caret)
- ✅ **Issue #80 FIXED** - `injectInlineMarks` now validates existing spans match current delimiter (prevents stale refs from `onInlineBreakingEdits`); `onInlineBreakingEdits` now reparses whole parent block (not just active inline); `skipCaretCorrection` parameter removed — `injectInlineMarks` always corrects to end when caret is at end
- ✅ **Issue #81 FIXED** (preliminary) - `hasAdjacentDelimiterChar()` prevents mirroring when hanging delimiter chars exist adjacent to element; strips stray chars in `unwrapAndReparseInline`
- ✅ **smartReplace offset fix** - `smartReplaceChildren` now correctly adjusts offset when `oldNode` without caret is replaced
- ✅ **New: `findFirstMdMatch()`** - CommonMark/mdast-compliant replacement for `findFirstMarkdownMatch()` (which is now deprecated); migration tracker in `findFirstMdMatch-regression-tracker.md`
- ✅ **API renamed**: `onRefocus()` → `refocus()`, `handleActiveInline()` → `onEdit()`, `handleActiveBlock()` removed (merged into `onEdit()`), `tryHandleEdgeInput()` → `handleInlineMarkEdges()` + `handleBlockMarkEdges()`, `onInlineMarkChange()` → `handleFocusedInline()`, `unwrapAndReparse()` → `unwrapAndReparseInline()` + `unwrapAndReparseBlock()`
- ✅ New test suite: `inline-mirroring.spec.ts` (364 lines), `consecutive-elements.spec.ts` (84 lines) — total now 13 test files

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

### 2026-02-09 to 2026-02-11
- ✅ **Issue #12 FIXED** - Invalid delimiter deletion now correctly flattens heading to `<p>` and refocuses
- ✅ **Issue #13 FIXED** - Undo/redo no longer destroys focus mark refs; inject methods now reassign from existing spans

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
- ✅ Headings work fully (issues #9–#13 fixed)
- ✅ Block marks persist during inline transformations
- ✅ Invalid delimiter flattening and H→P conversion work
- ✅ Focus marks survive undo/redo
- ❌ Blockquotes: Editing `>` shows on separate line
- ❌ Lists: Editing `-`/`1.` needs UX redesign
- ❌ Codeblocks: Marks never show

**Cursor Positioning:**
- 3 edge cases in breaking delimiter transformations (UX polish)
- Caret jumps when creating patterns before consecutive elements

**Not Implemented:**
- List item UX (click focus, hide HTML markers)

## Test Results

**Focus-marks e2e suite:** 13 test files (was 9)

**General caret/inline tests (tracked separately):**
- `rich-editor-caret-position.spec.ts`: 23/26 passing (3 confirmed failures: BUG-1, BUG-2)
- `rich-editor-inline-patterns.spec.ts`: 26/30 passing (4 confirmed failures: BUG-2, BUG-3, BUG-4)
- See [findFirstMdMatch-regression-tracker.md](./findFirstMdMatch-regression-tracker.md) for full analysis

**Open confirmed bugs:**
- **BUG-1** (`caret:404`) — `__bold__` creates `<em>` instead of `<strong>` (underscore round-trip failure)
- **BUG-2** (`caret:431`, `caret:474`, `inline:168`, `inline:207`) — Cursor jumps to parent end after nested inner-element transform
- **BUG-3** (`inline:418`) — `***word***` loses outer `*` via intermediate `<em>` mirroring
- **BUG-4** (`inline:359`) — `**_bold italic_**` blocked by `handleInlineMarkEdges` at `<em>` right edge

**Test files:** [tests/e2e/focus-marks/](../../tests/e2e/focus-marks/)
- 13 test files total (4 caret-positioning, 4 delimiter-editing, 3 activation, 1 pattern-detection, 1 unit)
- Core features: Working
- Regressions tracked in `findFirstMdMatch-regression-tracker.md`

## Next Steps

**High Priority:** BUG-1/BUG-2/BUG-3/BUG-4 from `findFirstMdMatch` migration (see tracker); Block issues #2, #3, #33

**Medium Priority:** Option C pre-transform guard for BUG-1/BUG-3; blockquote/list editing; cursor edge cases

**Low Priority:** Codeblock marks, list UX, performance profiling, animations

## Key Files

See [../focusMarks-design.md#integration-points](../focusMarks-design.md#integration-points) for architecture.

**Core Implementation:**
- [focus-mark-manager.ts](../../src/lib/core/utils/focus-mark-manager.ts) (~864 lines) - Main orchestration
  - Public APIs: `refocus()`, `onEdit()`, `handleInlineMarkEdges()`, `handleBlockMarkEdges()`, `unfocus()`, `unwrapAndReparseInline()`, `unwrapAndReparseBlock()`
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
- [tests/e2e/focus-marks/](../../tests/e2e/focus-marks/) - All test suites (13 files)
- [tests/unit/smartReplaceChildren.spec.ts](../../tests/unit/smartReplaceChildren.spec.ts) - Unit tests (509 lines)
- [delimiter-editing/inline-mirroring.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/inline-mirroring.spec.ts) - **NEW** Inline mirroring tests (364 lines)
- [caret-positioning/consecutive-elements.spec.ts](../../tests/e2e/focus-marks/caret-positioning/consecutive-elements.spec.ts) - **NEW** Consecutive element caret tests (84 lines)
- [delimiter-editing/block-transformation.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/block-transformation.spec.ts) - Block type conversion tests (756 lines)
- [TEST-INDEX.md](../../tests/e2e/focus-marks/TEST-INDEX.md) - Test organization guide

## Issue Tracker

> See [focusmark-notes.md](./focusmark-notes.md) for complete issue history

**Recently Fixed (Jan 26 - Feb 20):**
- Edge delimiter typing, breaking delimiters, caret positioning
- Mirroring, empty element typing, span edge editing
- Block transforms, inline formatting preservation, activation control
- #77 consecutive elements, #78 invalid span flattening, #80 injectInlineMarks staleness + breaking edits, #81 stray delimiter cleanup

**Open Issues:**
- BUG-1/2/3/4: `findFirstMdMatch` migration regressions (see tracker)
- #343: Null error reading 'childNodes'
- Block #2-6: querySelectorAll error, mark deletion, blockquote/codeblock/list issues

**Status:** 20+ major issues fixed, regressions from `findFirstMdMatch` migration are the current priority
