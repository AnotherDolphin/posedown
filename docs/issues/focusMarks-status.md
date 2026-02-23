# FocusMarks - Current Status

**Last Updated:** 2026-02-23
**Latest Commit:** `findFirstMdMatchForTransform` added as BUG-1 fix; smartReplace caret restore improvements; open regressions tracked in BUG-2/3/4

> **For architecture, design decisions, and how it works**, see [../focusMarks-design.md](../focusMarks-design.md)

## Executive Summary

**Status:** ✅ Production-ready with block editing (partial) — inline pattern detection migrated to AST-based matching

Core functionality works. All logic consolidated in [FocusMarkManager](../../src/lib/core/utils/focus-mark-manager.ts). Edge delimiter typing, marks escape, delimiter edit reparsing, and **block marks editing** (headings) fully implemented. Pattern detection migrated from regex (`findFirstMarkdownMatch`) to CommonMark AST-based (`findFirstMdMatch`) — bringing correctness fixes with tracked regressions (BUG-2 through BUG-4).

## Recent Changes (Last 2 Weeks)

### 2026-02-14 to 2026-02-23 — `findFirstMdMatch` Migration & Bug Fixes
- ✅ **Issue #77 FIXED** - Consecutive inline elements caret jump (Feb 13)
- ✅ **Issue #78 FIXED** - Flatten invalid span edits before reparse (Feb 13)
- ✅ **Issue #78.1 FIXED** - `findFirstMdMatch` (AST/CommonMark-based) replaces regex at most call sites for correctness
- ✅ **Issue #80 FIXED** - `injectInlineMarks` preservation logic; removed `skipCaretCorrection`; `onInlineBreakingEdits` restructured
- ✅ **Issue #80.1 FIXED** - Breaking inline edits pivot back to `findFirstMarkdownMatch` at site 5 (intentional; CommonMark too strict for break detection)
- ✅ **BUG-1 FIXED** - `__bold__` → `<em>` premature transform: `findFirstMdMatchForTransform` wrapper suppresses mid-typing emphasis matches at transform.ts site 1
- ✅ **smartReplace caret restore** - Fixed missing offset adjustment when oldNode without caret is replaced; fixed missing restore on long newNodes
- ⏳ **Issue #81 Partial** - `hasAdjacentDelimiterChar` added to reduce stray delimiters after mirroring (needs revision)
- ❌ **BUG-2** - Nested inner-element transform caret jumps to parent end (`setCaretAtEnd` on inner `<strong>` resolves to parent `<em>` end)
- ❌ **BUG-3** - `***word***` / `***~~text~~***` lose outer `*` due to premature `<em>` intermediate state
- ❌ **BUG-4** - `**_bold italic_**` blocked by `handleInlineMarkEdges` at `<em>` right edge
- ❌ **Issue #82** - `smartReplaceChildren` misses caret restore when no pattern arg but pattern exists between new and span delimiter

### 2026-02-09 to 2026-02-11 — Block Fixes
- ✅ **Issue #12 FIXED** - Invalid delimiter deletion correctly flattens heading to `<p>` and refocuses
- ✅ **Issue #13 FIXED** - Undo/redo no longer destroys focus mark refs; inject methods now reassign from existing spans

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

**Inline Pattern Detection (findFirstMdMatch migration regressions):**
- ❌ **BUG-2** - Nested inner transform caret jumps to parent end (`caret:431`, `caret:474`, `inline:168`, `inline:207`)
- ❌ **BUG-3** - `***word***` / triple nesting loses outer `*` (`inline:418`)
- ❌ **BUG-4** - `**_bold italic_**` blocked at `<em>` right edge (`inline:359`)
- ❌ **Issue #81** - Mirroring leaves stray delimiters; `hasAdjacentDelimiterChar` partial fix needs revision
- ❌ **Issue #82** - `onInlineBreakingEdits` must flatten all spans + pass match; current path misses precise restore

**Block Marks:**
- ✅ Headings work fully (issues #9–#13 fixed)
- ✅ Block marks persist during inline transformations
- ✅ Invalid delimiter flattening and H→P conversion work
- ✅ Focus marks survive undo/redo
- ❌ Blockquotes: Editing `>` shows on separate line
- ❌ Lists: Editing `-`/`1.` needs UX redesign
- ❌ Codeblocks: Marks never show

**Not Implemented:**
- List item UX (click focus, hide HTML markers)

## Test Results

**Inline pattern + caret tests:** ~49–52 / 61 passing (flaky — varies by run order)
- `rich-editor-caret-position.spec.ts`: 23 pass / 3 fail (BUG-1 ✅ fixed, BUG-2 ❌ ×2, + `:78`/`:296` flaky)
- `rich-editor-inline-patterns.spec.ts`: 26 pass / 4 fail (BUG-2 ×2, BUG-3, BUG-4)

**Breaking delimiters** (`breaking-delimiters.spec.ts`): 8/14 passing
- ✅ Regular chars/space don't break, rogue delimiters, breaking at start/end, site-5 input-time detection (`:430`, `:473`, `:516`)
- ❌ 6 pre-existing failures: Escape/blur path cursor positions

**Focus marks suite:** [tests/e2e/focus-marks/](../../tests/e2e/focus-marks/) — 9 test files, 94 tests
- Core features working; ~36 failures mostly cursor positioning and nested transforms

## Next Steps

**High Priority:** BUG-2 (nested transform caret), Issue #82 (smartReplace + onInlineBreakingEdits), Issue #81 (stray delimiters)

**Medium Priority:** BUG-3/BUG-4 (triple nesting, edge-guarded outer pattern), blockquote/list editing

**Low Priority:** Codeblock marks, list UX, block issues #2/#3/#33

## Key Files

See [../focusMarks-design.md#integration-points](../focusMarks-design.md#integration-points) for architecture.

**Core Implementation:**
- [focus-mark-manager.ts](../../src/lib/core/utils/focus-mark-manager.ts) - Main orchestration
  - Key APIs: `tryHandleEdgeInput()`, `handleActiveInline()`, `handleActiveBlock()`, `onInlineBreakingEdits()`
  - State: `activeInline`, `activeBlock`, `inlineSpanRefs`, `blockSpanRefs`
- [focus/utils.ts](../../src/lib/core/focus/utils.ts) - Extracted utilities (`extractInlineMarks`, `extractBlockMarks`, `createMarkSpan`, `atEdgeOfFormatted`, `getSpanlessClone`, `wouldFormValidDelimiter`, `wouldFormValidBlockDelimiter`)
- [block-patterns.ts](../../src/lib/core/utils/block-patterns.ts) - Block delimiter support (`isSupportedBlockDelimiter`)
- [inline-patterns.ts](../../src/lib/core/utils/inline-patterns.ts) - **`findFirstMdMatchForTransform`** (BUG-1 guard wrapper over `findFirstMdMatch`)
- [richEditorState.svelte.ts](../../src/lib/svelte/richEditorState.svelte.ts) - Integration only

**DOM Utilities:**
- [smartReplaceChildren.ts](../../src/lib/core/dom/smartReplaceChildren.ts) - Smart reconciliation with auto caret restoration (offset-adjusted, focus mark preserve temporarily disabled)
- [dom/util.ts](../../src/lib/core/dom/util.ts) - `reparse()`, cursor positioning
- [selection.ts](../../src/lib/core/utils/selection.ts) - `setCaretAt()` (supports element nodes), `setCaretAtEnd()`

**Tests:**
- [tests/e2e/focus-marks/](../../tests/e2e/focus-marks/) - All focus mark suites (9 files)
- [tests/e2e/rich-editor-caret-position.spec.ts](../../tests/e2e/rich-editor-caret-position.spec.ts) - Caret position suite (26 tests)
- [tests/e2e/rich-editor-inline-patterns.spec.ts](../../tests/e2e/rich-editor-inline-patterns.spec.ts) - Inline pattern suite (35 tests)
- [breaking-delimiters.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/breaking-delimiters.spec.ts) - Breaking delimiter tests (14 tests)
- [block-transformation.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/block-transformation.spec.ts) - Block type conversions (756 lines)
- [docs/findFirstMdMatch-regression-tracker.md](../findFirstMdMatch-regression-tracker.md) - Detailed regression tracking for findFirstMdMatch migration

## Issue Tracker

> See [focusmark-notes.md](./focusmark-notes.md) for complete issue history

**Recently Fixed (Feb 11 - Feb 23):**
- #77: Consecutive inline elements caret jump
- #78 / #78.1: Invalid span flatten before reparse; `findFirstMdMatch` call site decisions
- #80 / #80.1: `injectInlineMarks` preservation, `skipCaretCorrection` removed, breaking edits restructured
- BUG-1: `__bold__` premature transform via `findFirstMdMatchForTransform` guard

**Open Issues:**
- BUG-2: Nested inner-element caret jumps to parent end
- BUG-3: `***word***` outer `*` lost in triple nesting
- BUG-4: `**_bold italic_**` blocked at `<em>` right edge
- #81: Stray delimiters after mirroring (partial fix)
- #82: `onInlineBreakingEdits` missing span flatten + match arg for precise caret restore
- Block #2: `querySelectorAll` TypeError in `findAndTransform`
- Block #4-6: Blockquote line issue, codeblock marks, list UX
