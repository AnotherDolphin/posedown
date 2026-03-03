# FocusMarks - Current Status

**Last Updated:** 2026-03-03
**Latest Commit:** `onInlineBreakingEdits` disabled checkpoint (issue#86.2 WIP); issue#84 + #85 fixed; caret offset restore in `findAndTransform` (issue#86); BUG-1/2/3/4 moved to `test.fixme`

> **For architecture, design decisions, and how it works**, see [../focusMarks-design.md](../focusMarks-design.md)

## Executive Summary

**Status:** ⚠️ WIP — `onInlineBreakingEdits` disabled (issue#86.2 checkpoint); several regressions active

Core functionality works. All logic consolidated in [FocusMarkManager](../../src/lib/core/utils/focus-mark-manager.ts). Edge delimiter typing, marks escape, delimiter edit reparsing, and **block marks editing** (headings) fully implemented. Pattern detection migrated from regex to CommonMark AST-based (`findFirstMdMatch`). BUG-1/2/3/4 acknowledged and moved to `test.fixme`. Currently exploring using `findAndTransform` as the central handler for both new patterns and breaking edits (issue#86.2), with `onInlineBreakingEdits` disabled — causing open regressions.

## Recent Changes (Last 2 Weeks)

### 2026-02-25 to 2026-03-03 — issue#84/85/86 fixes; `onInlineBreakingEdits` checkpoint

- ✅ **BUG-2 partial** (`893605c`) - `spansAreTheMatch` guard in `smartReplaceChildren`: focus spans only migrate when `oldNode.textContent === patternMatch.text`. Fixes `caret:474`, `inline:168`; stale-span offset correction introduced regressions in mixed-delimiter tests (later resolved)
- ✅ **issue#84 FIXED** (`4470154`) - Space input at `|*text*` (before focused inline, non-delimiter) — `handleInlineMarkEdges` had no escape for `position='before'` + non-delimiter input
- ✅ **issue#85 FIXED** (`07318be`) - Outer pattern missed after inner transform due to delimiter reallocation; `findAndTransform` now called at end of `unwrapAndReparseInline`
- ✅ **issue#86 FIXED** (`bb1026b`) - `findAndTransform` captures `caretOffset` before inline DOM swap; returns `{caretOffset, block}` so `onInput` can restore exact position
- ✅ **issue#86.0** (`c564208`) - Prevent `*` matching as List node without trailing space (`ast-utils.ts` + `block-marks.ts`)
- ✅ **issue#86.3** (`029365a`) - `hasFormattedNodeChanges` false positives from element-count length check fixed
- ✅ **`hasFormattedNodeChanges`** (`34e1f6b`) - Replaces `isOnlyWhiteSpaceDifference` in `transform.ts` for change inference; fixes bad space-input skipping. Extracted to `transforms/checkers.ts`
- ✅ **BUG-1/2/3/4 acknowledged** - Moved to `test.fixme`; no longer blocking test runs
- ⚠️ **issue#86.2 OPEN** (`029365a`) - Checkpoint: `onInlineBreakingEdits` disabled in `handleFocusedInline` (exploring `findAndTransform` as unified handler for breaking edits). Causes regressions — caret offset mismatches when folded delimiters re-emerge as unmatched text
- ❌ **issue#85 regression** - `inline:244` now failing due to #86.2 checkpoint

### 2026-02-14 to 2026-02-23 — `findFirstMdMatch` Migration & API Rename
- ✅ **Issues #77, #78, #80** FIXED — consecutive elements caret, span flattening, injectInlineMarks logic
- ✅ **`findFirstMdMatch`** migration at most call sites; `findFirstMarkdownMatch` kept at site 5 (intentional)
- ✅ **API renamed** — `refocus()`, `onEdit()`, `handleInlineMarkEdges()`, `handleBlockMarkEdges()`, `handleFocusedInline()`, `unwrapAndReparseInline()`, `unwrapAndReparseBlock()`
- ✅ **smartReplace caret restore** — offset-adjusted auto-restoration
- ⏳ **Issue #81 Partial** — `hasAdjacentDelimiterChar` added (needs revision)

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

**Active regressions from issue#86.2 checkpoint (`onInlineBreakingEdits` disabled):**
- ❌ `caret:78` - Nested patterns caret (was ✅)
- ❌ `inline:168` - Multiple italic inside bold (was ✅ BUG-2 partial fix)
- ❌ `inline:244` - issue#85 test (outer pattern after inner transform; was ✅)
- ❌ `inline:375` - `***bold italic***` nesting (was ✅)
- ❌ `inline:467` - Prevent typing inside nested after conversion (was ✅)
- ❌ `inline:555`, `inline:584`, `inline:637`, `inline:652` - PDN phrase/char tests (were ✅)

**Acknowledged bugs (test.fixme — not blocking test runs):**
- ⚠️ **BUG-1** (`caret:414`) - `__bold__` → `<em>` premature transform; round-trip broken by `emphasis: '*'` normalization
- ⚠️ **BUG-2** (`caret:444`, `caret:491`, `inline:207`) - Nested inner transform caret jumps to parent end
- ⚠️ **BUG-3** (`inline:451`) - `***word***` / triple nesting loses outer `*`
- ⚠️ **BUG-4** (`inline:392`) - `**_bold italic_**` blocked at `<em>` right edge
- ⚠️ **Issue #81** - Stray delimiters after mirroring; `hasAdjacentDelimiterChar` partial fix needs revision

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

**Inline pattern + caret tests:** 45 pass / 13 fail / 6 skip (fixme) / 64 total — as of 2026-03-03
- `rich-editor-caret-position.spec.ts`: 1 fail (`:78`), 6 fixme (BUG-1/2 + acknowledged regressions), rest pass
- `rich-editor-inline-patterns.spec.ts`: 12 fail (BUG-2/3/4 + issue#86.2 regressions), rest pass

**Breaking delimiters** (`breaking-delimiters.spec.ts`): 8/14 passing
- ✅ Regular chars/space don't break, rogue delimiters, breaking at start/end, site-5 input-time detection (`:430`, `:473`, `:516`)
- ❌ 6 pre-existing failures: Escape/blur path cursor positions

**Focus marks suite:** [tests/e2e/focus-marks/](../../tests/e2e/focus-marks/) — 13 test files
- Core features working; regressions tracked in `findFirstMdMatch-regression-tracker.md`

## Next Steps

**Current focus:** Resolve issue#86.2 — find a caret-offset strategy that works when `findAndTransform` handles breaking edits (folded delimiters re-emerge as unmatched text, shifting the returned offset). Either fix the offset math or restore `onInlineBreakingEdits` with a targeted fix.

**After #86.2:** Recheck issue#85 (`inline:244`), then tackle BUG-2 (nested inner caret).

**Medium Priority:** BUG-3/BUG-4 (triple nesting, edge-guarded outer pattern), Issue #81 (stray delimiters), blockquote/list editing

**Low Priority:** Codeblock marks, list UX, block issues #2/#3/#33

## Key Files

See [../focusMarks-design.md#integration-points](../focusMarks-design.md#integration-points) for architecture.

**Core Implementation:**
- [focus-mark-manager.ts](../../src/lib/core/utils/focus-mark-manager.ts) (~875 lines) - Main orchestration
  - Public APIs: `refocus()`, `onEdit()`, `handleInlineMarkEdges()`, `handleBlockMarkEdges()`, `unfocus()`, `unwrapAndReparseInline()`, `unwrapAndReparseBlock()`
  - State: `activeInline`, `activeBlock`, `inlineSpanRefs`, `blockSpanRefs`
- [focus/utils.ts](../../src/lib/core/focus/utils.ts) (230 lines) - Extracted utilities
- [block-patterns.ts](../../src/lib/core/utils/block-patterns.ts) - Block delimiter support (`isSupportedBlockDelimiter`)
- [inline-patterns.ts](../../src/lib/core/utils/inline-patterns.ts) - `findFirstMdMatch` (canonical), `findFirstMarkdownMatch` (site 5, currently inactive)
- [transforms/checkers.ts](../../src/lib/core/transforms/checkers.ts) - `hasFormattedNodeChanges()` (structural diff, replaces `isOnlyWhiteSpaceDifference`)
- [richEditorState.svelte.ts](../../src/lib/svelte/richEditorState.svelte.ts) - Integration only (`applyMarks()`, consolidated `onBeforeInput`)

**DOM Utilities:**
- [smartReplaceChildren.ts](../../src/lib/core/dom/smartReplaceChildren.ts) - Smart reconciliation with auto caret restoration (offset-adjusted, focus mark preserve temporarily disabled)
- [dom/util.ts](../../src/lib/core/dom/util.ts) - `reparse()`, cursor positioning
- [dom.ts](../../src/lib/core/utils/dom.ts) - Tag lists, tree walking
- [selection.ts](../../src/lib/core/utils/selection.ts) - `setCaretAt()` (supports element nodes), `setCaretAtEnd()`

**Tests:**
- [tests/e2e/focus-marks/](../../tests/e2e/focus-marks/) - All test suites (13 files)
- [tests/unit/smartReplaceChildren.spec.ts](../../tests/unit/smartReplaceChildren.spec.ts) - Unit tests (509 lines)
- [delimiter-editing/inline-mirroring.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/inline-mirroring.spec.ts) - Inline mirroring tests (364 lines)
- [caret-positioning/consecutive-elements.spec.ts](../../tests/e2e/focus-marks/caret-positioning/consecutive-elements.spec.ts) - Consecutive element caret tests (84 lines)
- [delimiter-editing/block-transformation.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/block-transformation.spec.ts) - Block type conversion tests (756 lines)
- [tests/e2e/rich-editor-caret-position.spec.ts](../../tests/e2e/rich-editor-caret-position.spec.ts) - Caret position suite (26 tests)
- [tests/e2e/rich-editor-inline-patterns.spec.ts](../../tests/e2e/rich-editor-inline-patterns.spec.ts) - Inline pattern suite (35 tests)
- [TEST-INDEX.md](../../tests/e2e/focus-marks/TEST-INDEX.md) - Test organization guide
- [findFirstMdMatch-regression-tracker.md](./findFirstMdMatch-regression-tracker.md) - Migration regressions + fix strategy

## Issue Tracker

> See [focusmark-notes.md](./focusmark-notes.md) for complete issue history

**Recently Fixed (Feb 25 - Mar 3):**
- #84: Space input before focused inline (`handleInlineMarkEdges` missing escape for `position='before'`)
- #85: Outer pattern missed after inner transform; `findAndTransform` added at end of `unwrapAndReparseInline`
- #86 / #86.0 / #86.3: Caret offset restore in `findAndTransform`; List node without space; `hasFormattedNodeChanges` false positives
- `hasFormattedNodeChanges` extracted to `checkers.ts`; replaces `isOnlyWhiteSpaceDifference`
- BUG-1/2/3/4: acknowledged → `test.fixme`

**Open Issues:**
- #86.2: `onInlineBreakingEdits` disabled checkpoint causing regressions (caret offset mismatch on breaking edits via `findAndTransform`)
- BUG-2: Nested inner-element caret jumps to parent end (fixme)
- BUG-3/4: Triple nesting, edge-guarded outer pattern (fixme)
- #81: Stray delimiters after mirroring (partial fix)
- Block #4-6: Blockquote line issue, codeblock marks, list UX

**Status:** 25+ major issues fixed; current priority is resolving the issue#86.2 breaking-edits pivot
