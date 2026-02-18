# Test Results — 2026-02-15

**Run:** `npx playwright test tests/e2e/rich-editor-caret-position.spec.ts tests/e2e/rich-editor-inline-patterns.spec.ts`

**Summary:** 49 passed / 7 failed / 61 total *(stable individual count; `:296` occasionally flaky in caret-position suite)*

---

## Issues Discovered (from test review)

Confirmed source-code bugs revealed by reviewing individual tests. No workaround exists at the test level.

### BUG-1 — `__bold__` creates `<em>` instead of `<strong>`
**Revealed by:** `caret:403` (`// review: real issue with __ handling`)

At the 7th character of `__bold__`, CommonMark parses `__bold_` as `[text("_"), em("bold")]` — firing an intermediate italic transform. The 8th `_` then goes through `applyMarks`/`unwrapAndReparseInline` which serialises the `<em>` to `*bold*` (asterisk) and reparsed `_*bold*_` produces another `<em>`, not `<strong>`.

**Fix location:** `focus-mark-manager.ts` — intermediate-state detection for underscore delimiters.

---

### BUG-2 — Cursor jumps to parent element end after intermediate inner-element transform
**Revealed by:** `caret:430` (`// review: the strong check fails even though the p block has the strong element`), `caret:472` (`// review: good test, the caret jumps to the end after *i`)

When typing a nested pattern (e.g. `**b**`) inside an already-formatted element (e.g. `<em>italic text</em>`), the inner `<strong>` is created correctly but `injectInlineMarks` calls `setCaretAtEnd` on it, which resolves to the end of the **parent** `<em>` (since `getLastTextDescendant` descends into the last child of the last child). The caret then sits at the parent's close span rather than immediately after the inner `</strong>`. As a consequence, the inner `<strong>` appears **outside** `<em>` in the final DOM, and subsequent characters land at the parent's end.

**Fix location:** `injectInlineMarks` / `setCaretAtEnd` — when the element being marked is itself inside a parent formatted element, caret correction must not overshoot the inner element's boundary.

---

### BUG-3 — `***nested***` does not produce `<em><strong>` nesting
**Revealed by:** `caret:78` (fails in full-suite runs; root-cause is the same intermediate-transform collision as BUG-2 compounded by triple-delimiter parsing)

`***word***` produces an intermediate `**<em>word</em>` (double-asterisk + em) at char 6. The final `***` close-sequence then triggers `checkAndMirrorSpans` on the `<em>`, mirroring to `**`, then `unwrapAndReparseInline`. The reparse sees `**word**` (not `***word***`) and produces `<strong>`, discarding the outer `*`. Result is `<strong>` with no `<em>` wrapper.

**Fix location:** `unwrapAndReparseInline` / intermediate state handling — the full triple-delimiter sequence needs to be preserved when reparsing.

---

### NOTE — ArrowLeft count is focus-mark-sensitive
**Revealed by:** `caret:266` (`// review: doesn't account for spans and ends up inside 'hello'`)

Tests that use a hardcoded ArrowLeft count to navigate to a specific text position will overshoot when focus marks are visible, because each `<span class="pd-focus-mark">**</span>` adds 2 cursor positions to the traversal path. **Fixed in test** by replacing the brittle ArrowLeft loop with `Control+Home`.

---

## Finalized Tests — `rich-editor-caret-position.spec.ts`

Tests that have been individually reviewed, have robust (non-span-fragile) assertions, and pass consistently in isolation. Tests marked ⚠️ pass individually but are flaky in the full suite (FocusMarkManager state bleeds between tests sharing the same page).

| Line | Description | Status | Notes |
|------|-------------|--------|-------|
| `:20` | caret after `**bold**` | ✅ pass | |
| `:36` | pattern with text before it | ✅ pass | |
| `:52` | pattern + space + text | ✅ pass | |
| `:65` | pattern in middle of text | ✅ pass | |
| `:78` | `***nested***` caret position | ⚠️ flaky | Passes individually; fails in suite (BUG-3) |
| `:94` | multiple patterns in sequence | ✅ pass | |
| `:117` | backspace after pattern *(fixed 2026-02-18)* | ⚠️ flaky | Was span-fragile assertion; passes in isolation, flaky after `:266` on same page |
| `:132` | space after pattern stays outside | ✅ pass | |
| `:156` | rapid typing after pattern | ✅ pass | |
| `:166` | mixed patterns preserved | ✅ pass | |
| `:186` | pattern at start of line | ✅ pass | |
| `:197` | pattern at end of line | ✅ pass | |
| `:211` | strikethrough pattern | ✅ pass | |
| `:226` | code pattern | ✅ pass | |
| `:241` | markdown in middle of block | ✅ pass | |
| `:266` | cursor BEFORE pattern start *(fixed 2026-02-18)* | ✅ pass | Was ArrowLeft count + span-fragile assertion |
| `:296` | multiple patterns, cursor at end | ⚠️ flaky | Passes individually |
| `:313` | pattern with punctuation before it | ⚠️ flaky | Passes individually |
| `:328` | pattern at very start of block | ✅ pass | |
| `:343` | long text, pattern in middle | ✅ pass | |
| `:363` | typing after pattern (no trailing space) | ✅ pass | |
| `:373` | navigate away and back | ⚠️ flaky | Passes individually |
| `:417` | single underscore italic `_italic_` | ✅ pass | |

**Still failing (real bugs):**
| Line | Description | Bug |
|------|-------------|-----|
| `:78` | `***nested***` structure | BUG-3 (passes individually; flaky in suite) |
| `:404` | `__bold__` → `<strong>` | BUG-1 |
| `:431` | nested bold inside italic | BUG-2 |
| `:474` | nested italic inside bold | BUG-2 |

**Unreviewed (passing but may have span-fragile assertions):** `:20`, `:36`, `:65`, `:132`, `:156`, `:166`, `:186`, `:211`, `:226`, `:417` still use `innerHTML.toContain` — not yet reviewed.

---

## Finalized Tests — `rich-editor-inline-patterns.spec.ts`

All 35 tests reviewed. 26 pass, 4 fail (2 confirmed BUG-2, 2 confirmed intermediate-state bugs). Tests marked with `// review: passes` in the spec were user-confirmed as passing; the 6 such tests were previously mis-listed as failures (false negatives in earlier analysis — state-contamination from sequential runs made them appear broken).

| Line | Description | Status | Notes |
|------|-------------|--------|-------|
| `:17` | `**bold**` → `<strong>` | ✅ pass | |
| `:31` | `*italic*` → `<em>` | ✅ pass | |
| `:43` | `` `code` `` → `<code>` | ✅ pass | |
| `:54` | `~~deleted~~` → `<del>` | ✅ pass | |
| `:65` | prevent typing inside styled element | ✅ pass | |
| `:86` | space after styled element stays outside | ✅ pass | |
| `:107` | multiple chars after styled element | ✅ pass | |
| `:126` | mixed inline patterns | ✅ pass | |
| `:143` | prevent deletion of last `<p>` | ✅ pass | |
| `:168` | multiple italic inside bold (BUG-2) | ❌ fail | Cursor jumps to parent end after nested transform |
| `:207` | multiple bold inside italic (BUG-2) | ❌ fail | Same as above |
| `:244` | `**bold *italic* text**` nested-looking | ✅ pass | |
| `:259` | whitespace break-spaces CSS | ✅ pass | |
| `:269` | rapid typing after conversion | ✅ pass | innerHTML assertion (not span-fragile: cursor outside element) |
| `:285` | space-only text node continuation | ✅ pass | innerHTML assertion (same) |
| `:304` | Delete key `<p>` protection | ✅ pass | |
| `:325` | cursor position after conversion | ✅ pass | |
| `:343` | `***bold italic***` → `<em><strong>` | ✅ pass | |
| `:359` | `**_bold italic_**` → `<strong><em>` | ❌ fail | `handleInlineMarkEdges` intercepts `*` at `<em>` right edge |
| `:374` | `_**italic bold**_` → `<em><strong>` | ✅ pass | `// review: passes` |
| `:389` | `~~**deleted bold**~~` → `<del><strong>` | ✅ pass | `// review: passes` |
| `:404` | `**~~bold deleted~~**` → `<strong><del>` | ✅ pass | `// review: passes` |
| `:418` | triple nesting `***~~text~~***` | ❌ fail | BUG-3 variant: outer `*` consumed by intermediate transform |
| `:434` | prevent typing inside nested after conversion | ✅ pass | |
| `:457` | complex nested with text around | ✅ pass | |
| `:475` | PDN: `***word***` at start | ✅ pass | |
| `:489` | PDN: `text ***word***` at end | ✅ pass | |
| `:504` | PDN: `before ***word***` in middle | ✅ pass | |
| `:522` | PDN: `***bold italic phrase***` at start | ✅ pass | `// review: passes` |
| `:536` | PDN: `start ***bold italic phrase***` at end | ✅ pass | |
| `:551` | PDN: phrase in middle | ✅ pass | |
| `:573` | PDN: `**_text_**` at start | ✅ pass | `// review: passes` |
| `:589` | PDN: `start _**italic bold**_` at end | ✅ pass | |
| `:604` | PDN: single char `***x***` | ✅ pass | |
| `:619` | PDN: `***word***` + immediate text | ✅ pass | `// review: passes` |

**False negatives corrected (previously mis-listed as failures):**

| Old line | Test | Reason for mis-listing |
|----------|------|----------------------|
| `:373` → `:374` | `_**italic bold**_` | State contamination in sequential run; isolated: passes |
| `:387` → `:389` | `~~**deleted bold**~~` | Same |
| `:401` → `:404` | `**~~bold deleted~~**` | Same |
| `:518` → `:522` | PDN: `***bold italic phrase***` | Same |
| `:568` → `:573` | PDN: `**_text_**` | Same |
| `:613` → `:619` | PDN: `***word***` + text | Same |

---

## Current state (`merge-test` branch) — span-fragile assertion fixes in test files

**Summary:** 49 passed / 7 failed / 61 total *(individual runs; `:296` caret-position occasionally flaky)*

### Changes applied
- **Test files only** — no source code changes
- `rich-editor-caret-position.spec.ts`: ~12 `innerHTML.toContain/toMatch` assertions replaced with locator-based (`expect(locator).toContainText`, `not.toContainText`) checks
- `rich-editor-inline-patterns.spec.ts`: ~6 `innerHTML.toMatch` assertions replaced with locator-based checks
- Removed one unused `innerHTML` variable declaration

### Remaining 7 failures — real bugs

| Test | Description | Root cause |
|------|-------------|------------|
| `caret-position:404` | caret should handle underscore bold pattern (`__bold__`) | BUG-1: creates `<em>` not `<strong>` |
| `caret-position:431` | caret should land after nested bold, not after "text", when typing inside italic | BUG-2: cursor lands at parent end |
| `caret-position:474` | caret should land after nested italic, not after "text", when typing inside bold | BUG-2: same |
| `inline-patterns:168` | should handle multiple italic elements inside bold | BUG-2: cursor lands at parent end after nested transform |
| `inline-patterns:207` | should handle multiple bold elements inside italic | BUG-2: same |
| `inline-patterns:359` | should convert `**_bold italic_**` to `<strong>` wrapping `<em>` | `handleInlineMarkEdges` intercepts `*` typed at `<em>` right edge |
| `inline-patterns:418` | should handle triple nesting: `***~~text~~***` | BUG-3 variant: intermediate `*<em>` transform absorbs outer `*` |

*(`:296` caret-position and `:78` caret-position: pass individually, occasionally fail in sequential runs due to shared FocusMarkManager state)*

### Fixed ✅ (span-fragile assertions + test logic)

| Test | Fix | Date |
|------|-----|------|
| `caret-position:52` | `innerHTML` → locator assertions | 2026-02-18 |
| `caret-position:78` | follow-up `innerHTML` → locator | 2026-02-18 |
| `caret-position:116` → `:117` | `innerHTML` → locator assertions | 2026-02-18 |
| `caret-position:266` | `ArrowLeft ×11` → `Control+Home`; `innerHTML` → locator | 2026-02-18 |
| `caret-position:297` | `innerHTML` → locator assertions | 2026-02-18 |
| `caret-position:310` | `innerHTML` → locator | 2026-02-18 |
| `caret-position:323` | removed unused `innerHTML`; `innerHTML` → locator | 2026-02-18 |
| `caret-position:338` | `innerHTML` → locator | 2026-02-18 |
| `caret-position:356` | `innerHTML` → locator | 2026-02-18 |
| `caret-position:366` | `innerHTML` → locator *(real bug remains: space inside strong)* | 2026-02-18 |
| `caret-position:394` | `innerHTML` → locator *(real bug BUG-1 remains)* | 2026-02-18 |
| `caret-position:420` | `innerHTML` → locator *(real bug BUG-2 remains)* | 2026-02-18 |
| `caret-position:459` | `innerHTML` → locator *(real bug BUG-2 remains)* | 2026-02-18 |
| `inline-patterns:86` | `innerHTML` → locator | 2026-02-18 |
| `inline-patterns:107` | `innerHTML` → locator | 2026-02-18 |
| `inline-patterns:325` | `innerHTML` → locator | 2026-02-18 |
| `inline-patterns:431` | `innerHTML` → locator | 2026-02-18 |
| `inline-patterns:546` | `innerHTML` → locator *(real bug remains)* | 2026-02-18 |
| `inline-patterns:613` | `innerHTML` → locator *(real bug remains)* | 2026-02-18 |

---

## Previous state (`merge-test` branch) — adjacent char consumption + smartReplaceChildren `!caretFound` fix

**Summary:** 33 passed / 28 failed / 61 total  *(net vs `c6ee77b`: +5 pass, −5 fail)*

### Changes applied on top of `c6ee77b`/`8bbb1fb`
- `focus-mark-manager.ts`: `unwrapAndReparseInline` now strips stray adjacent delimiter char from sibling text before reparse
- `focus-mark-manager.ts`: reverted `skipCaretCorrection` check in `injectInlineMarks` — `setCaretAtEnd` always runs when `atEnd`
- `focus-mark-manager.ts`: added `hasAdjacentDelimiterChar()` helper
- `smartReplaceChildren.ts`: Case D (`!caretFound`) now subtracts `newNode.textContent?.length` to consume pre-caret node offset

### Fixed ✅ (was failing in `c6ee77b`, now passing)
| Test reference | Description |
|----------------|-------------|
| `tests/e2e/rich-editor-caret-position.spec.ts:36` | caret should be preserved when pattern has text before it |
| `tests/e2e/rich-editor-caret-position.spec.ts:78` | caret should be after nested patterns |
| `tests/e2e/rich-editor-caret-position.spec.ts:241` | caret should be correct when adding markdown in the middle of a block |
| `tests/e2e/rich-editor-caret-position.spec.ts:340` | caret should handle long text with pattern in middle |
| `tests/e2e/rich-editor-caret-position.spec.ts:358` | caret should handle typing after pattern with no trailing space |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:66` | should prevent typing inside styled element after conversion |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:109` | should allow multiple characters after styled element |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:538` | Position-Dependent Nesting › should handle nested pattern in middle of line |

### Still failing vs `d137566` baseline (28 tests)

**Cluster A — Focus marks still showing after final delimiter completes pattern** (cursor placed inside element after transform; `onSelectionChange` never removes marks):
| Test reference | Description |
|----------------|-------------|
| `tests/e2e/rich-editor-inline-patterns.spec.ts:17` | should convert `**bold**` to `<strong>` |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:32` | should convert `*italic*` to `<em>` |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:66` | should prevent typing inside styled element |
| `tests/e2e/rich-editor-caret-position.spec.ts:94` | caret should handle multiple patterns in sequence |
| `tests/e2e/rich-editor-caret-position.spec.ts:196` | caret should handle pattern at end of line |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:355` | should convert `***bold italic***` |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:392` | should convert `_**italic bold**_` |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:409` | should convert `~~**deleted bold**~~` |

**Cluster B — Suffix/space typed inside element** (same root cause, character lands inside instead of after):
| Test reference | Description |
|----------------|-------------|
| `tests/e2e/rich-editor-caret-position.spec.ts:312` | caret should handle pattern with punctuation before it |

**Cluster C — Novel failures (different root cause)**
| Test reference | Description | Reason |
|----------------|-------------|--------|
| `tests/e2e/rich-editor-caret-position.spec.ts:115` | caret should handle backspace after pattern transformation | Backspace overshoots into focus span text, unwraps `<strong>` |
| `tests/e2e/rich-editor-caret-position.spec.ts:268` | caret should handle cursor BEFORE pattern start | ArrowLeft miscounts because focus mark span text inflates offset |
| `tests/e2e/rich-editor-caret-position.spec.ts:368` | caret should handle typing in middle then navigating away and back | Space typed inside `<strong>` triggers `onInlineBreakingEdits` unwrap |
| `tests/e2e/rich-editor-caret-position.spec.ts:396` | caret should handle underscore bold pattern | `__bold__` → `checkAndMirrorSpans` may not recognise `_`+`_`→`__` as strong |

**Cluster D — Complex nested typing / text lands in wrong element**
| Test reference | Description |
|----------------|-------------|
| `tests/e2e/rich-editor-inline-patterns.spec.ts:170` | should handle multiple italic elements inside bold |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:213` | should handle multiple bold elements inside italic |
| `tests/e2e/rich-editor-caret-position.spec.ts:422` | caret should land after each nested bold, when typing inside italic |
| `tests/e2e/rich-editor-caret-position.spec.ts:461` | caret should land after each nested italic, when typing inside bold |

**Cluster E — Nested format structure wrong / focus marks on inner element**
| Test reference | Description |
|----------------|-------------|
| `tests/e2e/rich-editor-inline-patterns.spec.ts:375` | should convert `**_bold italic_**` to `<strong>` wrapping `<em>` |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:426` | should convert `**~~bold deleted~~**` |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:443` | should handle triple nesting `***~~text~~***` |

**Cluster F — Position-Dependent Nesting**
| Test reference | Description |
|----------------|-------------|
| `tests/e2e/rich-editor-inline-patterns.spec.ts:502` | nested pattern at start of line (single word) |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:519` | nested pattern at end of line |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:560` | nested pattern with phrase at start |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:577` | nested pattern with phrase at end |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:618` | `**_text_**` nesting combinations *(test expectation may be wrong — code produces `<strong><em>` not `<em><strong>`)* |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:637` | `_**text**_` nesting combinations *(same nesting order issue)* |
| `tests/e2e/rich-editor-inline-patterns.spec.ts:656` | single character nested pattern |

---

## After commit `c6ee77b` (merged at `8bbb1fb`) — issue#80: removed `skipCaretCorrection`, rewrote `onInlineBreakingEdits`

**Summary:** 28 passed / 33 failed / 61 total  *(net vs previous: −16 pass, +16 fail)*

### Fixed ✅ (was failing in `d137566`, now passing)

| File | Test |
|------|------|
| caret-position | caret should handle backspace after pattern transformation `:115` |
| caret-position | caret should handle pattern with punctuation before it `:312` |
| caret-position | caret should handle pattern followed by space and text `:52` |
| inline-patterns | should handle mixed inline patterns `:128` |

### Regressions introduced ❌ (was passing in `d137566`, now failing)

| File | Test |
|------|------|
| caret-position | caret should be preserved when pattern has text before it `:36` |
| caret-position | caret should be after nested patterns `:78` |
| caret-position | caret should handle multiple patterns in sequence `:94` |
| caret-position | caret should handle pattern at end of line `:196` |
| caret-position | caret should be correct when adding markdown in the middle of a block `:241` |
| caret-position | caret should handle multiple patterns - cursor at end `:299` |
| caret-position | caret should handle long text with pattern in middle `:340` |
| inline-patterns | should convert `**bold**` markdown to `<strong>` element `:17` |
| inline-patterns | should convert `*italic*` markdown to `<em>` element `:32` |
| inline-patterns | should prevent typing inside styled element after conversion `:66` |
| inline-patterns | should allow multiple characters after styled element `:109` |
| inline-patterns | should convert `***bold italic***` to nested `<em><strong>` elements `:355` |
| inline-patterns | should convert `~~**deleted bold**~~` to `<del>` wrapping `<strong>` `:409` |
| inline-patterns | Position-Dependent Nesting › should handle nested pattern at start of line (single word) `:502` |
| inline-patterns | Position-Dependent Nesting › should handle nested pattern at end of line `:519` |
| inline-patterns | Position-Dependent Nesting › should handle nested pattern in middle of line (single word) `:538` |
| inline-patterns | Position-Dependent Nesting › should handle nested pattern with phrase at start `:560` |
| inline-patterns | Position-Dependent Nesting › should handle nested pattern with phrase at end `:577` |
| inline-patterns | Position-Dependent Nesting › should handle different nesting combinations at end: `_**text**_` `:637` |
| inline-patterns | Position-Dependent Nesting › should handle single character nested pattern `:656` |

### Unchanged failures (still failing, 13 tests)

| File | Test |
|------|------|
| caret-position | caret should handle cursor BEFORE pattern start `:268` |
| caret-position | caret should handle typing after pattern with no trailing space `:358` |
| caret-position | caret should handle typing in middle then navigating away and back `:368` |
| caret-position | caret should handle underscore bold pattern `:396` |
| caret-position | caret should land after each nested bold, not after "text", when typing inside italic `:422` |
| caret-position | caret should land after each nested italic, not after "text", when typing inside bold `:461` |
| inline-patterns | should handle multiple italic elements inside bold `:170` |
| inline-patterns | should handle multiple bold elements inside italic `:213` |
| inline-patterns | should convert `**_bold italic_**` to `<strong>` wrapping `<em>` `:375` |
| inline-patterns | should convert `_**italic bold**_` to `<em>` wrapping `<strong>` `:392` |
| inline-patterns | should convert `**~~bold deleted~~**` to `<strong>` wrapping `<del>` `:426` |
| inline-patterns | should handle triple nesting: `***~~text~~***` `:443` |
| inline-patterns | Position-Dependent Nesting › should handle different nesting combinations at start: `**_text_**` `:618` |

---

## After Merge — `newFindFirstMd` (commit `efb3c7f`)

**Summary:** 44 passed / 17 failed / 61 total  *(net: −2 pass, +2 fail)*

### Fixed by merge ✅ (was failing, now passing)

| File | Test |
|------|------|
| caret-position | caret should be correct when adding markdown in the middle of a block `:241` |
| caret-position | caret should handle typing after pattern with no trailing space `:358` |
| inline-patterns | Position-Dependent Nesting › should handle different nesting combinations at end: `_**text**_` `:637` |

### Regressions introduced ❌ (was passing, now failing)

| File | Test |
|------|------|
| caret-position | caret should handle multiple patterns - cursor at end `:299` |
| caret-position | caret should handle underscore bold pattern `:396` |
| inline-patterns | should handle mixed inline patterns `:128` |
| inline-patterns | should convert `_**italic bold**_` to `<em>` wrapping `<strong>` `:392` |
| inline-patterns | should convert `~~**deleted bold**~~` to `<del>` wrapping `<strong>` `:409` |

### Unchanged failures (still failing, 10 tests)

| File | Test |
|------|------|
| caret-position | caret should handle backspace after pattern transformation `:115` |
| caret-position | caret should handle cursor BEFORE pattern start `:268` |
| caret-position | caret should handle pattern with punctuation before it `:312` |
| caret-position | caret should handle typing in middle then navigating away and back `:368` |
| caret-position | caret should land after each nested bold, not after "text", when typing inside italic `:422` |
| caret-position | caret should land after each nested italic, not after "text", when typing inside bold `:461` |
| inline-patterns | should handle multiple italic elements inside bold `:170` |
| inline-patterns | should handle multiple bold elements inside italic `:213` |
| inline-patterns | should convert `**_bold italic_**` to `<strong>` wrapping `<em>` `:375` |
| inline-patterns | should convert `**~~bold deleted~~**` to `<strong>` wrapping `<del>` `:426` |
| inline-patterns | should handle triple nesting: `***~~text~~***` `:443` |
| inline-patterns | Position-Dependent Nesting › should handle different nesting combinations at start: `**_text_**` `:618` |

---

## After `handleNestedPatterns` fix (commit `d137566`)

**Summary:** 44 passed / 17 failed / 61 total  *(net: no change vs previous, but 2 fixed / 2 regressed)*

### Fixed ✅ (was failing after `newFindFirstMd`, now passing)

| File | Test |
|------|------|
| caret-position | caret should handle multiple patterns - cursor at end `:299` |
| inline-patterns | should convert `~~**deleted bold**~~` to `<del>` wrapping `<strong>` `:409` |

### Regressions introduced ❌ (was passing after `newFindFirstMd`, now failing)

| File | Test |
|------|------|
| caret-position | caret should handle pattern followed by space and text `:52` |
| caret-position | caret should handle typing after pattern with no trailing space `:358` |

### Unchanged failures (still failing, 13 tests)

| File | Test |
|------|------|
| caret-position | caret should handle backspace after pattern transformation `:115` |
| caret-position | caret should handle cursor BEFORE pattern start `:268` |
| caret-position | caret should handle pattern with punctuation before it `:312` |
| caret-position | caret should handle typing in middle then navigating away and back `:368` |
| caret-position | caret should handle underscore bold pattern `:396` |
| caret-position | caret should land after each nested bold, not after "text", when typing inside italic `:422` |
| caret-position | caret should land after each nested italic, not after "text", when typing inside bold `:461` |
| inline-patterns | should handle mixed inline patterns `:128` |
| inline-patterns | should handle multiple italic elements inside bold `:170` |
| inline-patterns | should handle multiple bold elements inside italic `:213` |
| inline-patterns | should convert `**_bold italic_**` to `<strong>` wrapping `<em>` `:375` |
| inline-patterns | should convert `_**italic bold**_` to `<em>` wrapping `<strong>` `:392` |
| inline-patterns | should convert `**~~bold deleted~~**` to `<strong>` wrapping `<del>` `:426` |
| inline-patterns | should handle triple nesting: `***~~text~~***` `:443` |
| inline-patterns | Position-Dependent Nesting › should handle different nesting combinations at start: `**_text_**` `:618` |

---

---

## rich-editor-caret-position.spec.ts

| # | Test | Result |
|---|------|--------|
| 1 | caret should be after `<strong>` when typing `**bold**` | ✅ pass |
| 2 | caret should be preserved when pattern has text before it | ✅ pass |
| 3 | caret should handle pattern followed by space and text | ✅ pass |
| 4 | caret should be preserved when typing pattern in middle of text | ✅ pass |
| 5 | caret should be after nested patterns | ✅ pass |
| 6 | caret should handle multiple patterns in sequence | ✅ pass |
| 7 | caret should handle backspace after pattern transformation | ❌ fail |
| 8 | caret should stay outside pattern when typing space after it | ✅ pass |
| 9 | caret should handle rapid typing after pattern conversion | ✅ pass |
| 10 | caret should be preserved with mixed patterns and text | ✅ pass |
| 11 | caret should handle pattern at start of line | ✅ pass |
| 12 | caret should handle pattern at end of line | ✅ pass |
| 13 | caret should handle strikethrough pattern | ✅ pass |
| 14 | caret should handle code pattern | ✅ pass |
| 15 | caret should be correct when adding markdown in the middle of a block | ❌ fail |
| 16 | caret should handle cursor BEFORE pattern start | ❌ fail |
| 17 | caret should handle multiple patterns - cursor at end | ✅ pass |
| 18 | caret should handle pattern with punctuation before it | ❌ fail |
| 19 | caret should handle pattern at very start of block | ✅ pass |
| 20 | caret should handle long text with pattern in middle | ✅ pass |
| 21 | caret should handle typing after pattern with no trailing space | ❌ fail |
| 22 | caret should handle typing in middle then navigating away and back | ❌ fail |
| 23 | caret should handle underscore bold pattern | ✅ pass |
| 24 | caret should handle single underscore italic pattern | ✅ pass |
| 25 | caret should land after each nested bold, not after "text", when typing inside italic | ❌ fail |
| 26 | caret should land after each nested italic, not after "text", when typing inside bold | ❌ fail |

---

## rich-editor-inline-patterns.spec.ts

| # | Test | Result |
|---|------|--------|
| 1 | should convert `**bold**` markdown to `<strong>` element | ✅ pass |
| 2 | should convert `*italic*` markdown to `<em>` element | ✅ pass |
| 3 | should convert `` `code` `` markdown to `<code>` element | ✅ pass |
| 4 | should convert `~~strikethrough~~` markdown to `<del>` element | ✅ pass |
| 5 | should prevent typing inside styled element after conversion | ✅ pass |
| 6 | should handle space after styled element correctly | ✅ pass |
| 7 | should allow multiple characters after styled element | ✅ pass |
| 8 | should handle mixed inline patterns | ✅ pass |
| 9 | should prevent deletion of last `<p>` tag | ✅ pass |
| 10 | should handle multiple italic elements inside bold | ❌ fail |
| 11 | should handle multiple bold elements inside italic | ❌ fail |
| 12 | should handle nested-looking patterns correctly | ✅ pass |
| 13 | should preserve whitespace with break-spaces CSS | ✅ pass |
| 14 | should handle rapid typing after pattern conversion | ✅ pass |
| 15 | should allow continuing after space-only text node | ✅ pass |
| 16 | should handle Delete key similar to Backspace for `<p>` protection | ✅ pass |
| 17 | should maintain cursor position after pattern conversion | ✅ pass |
| 18 | should convert `***bold italic***` to nested `<em><strong>` elements | ✅ pass |
| 19 | should convert `**_bold italic_**` to `<strong>` wrapping `<em>` | ❌ fail |
| 20 | should convert `_**italic bold**_` to `<em>` wrapping `<strong>` | ✅ pass |
| 21 | should convert `~~**deleted bold**~~` to `<del>` wrapping `<strong>` | ✅ pass |
| 22 | should convert `**~~bold deleted~~**` to `<strong>` wrapping `<del>` | ❌ fail |
| 23 | should handle triple nesting: `***~~text~~***` | ❌ fail |
| 24 | should prevent typing inside nested styled elements after conversion | ✅ pass |
| 25 | should handle complex nested pattern with text around it | ✅ pass |
| **Position-Dependent Nesting** | | |
| 26 | should handle nested pattern at start of line (single word) | ✅ pass |
| 27 | should handle nested pattern at end of line | ✅ pass |
| 28 | should handle nested pattern in middle of line (single word) | ✅ pass |
| 29 | should handle nested pattern with phrase at start | ✅ pass |
| 30 | should handle nested pattern with phrase at end | ✅ pass |
| 31 | should handle nested pattern with phrase in middle | ✅ pass |
| 32 | should handle different nesting combinations at start: `**_text_**` | ❌ fail |
| 33 | should handle different nesting combinations at end: `_**text**_` | ❌ fail |
| 34 | should handle single character nested pattern | ✅ pass |
| 35 | should handle nested pattern followed immediately by text | ✅ pass |

---

## Failure Details

### rich-editor-caret-position.spec.ts

**`caret should handle backspace after pattern transformation`** `:115`
```
Expected: not.toContain('xyz')
Received: innerHTML still contains 'xyz' after 3 backspaces
```

**`caret should be correct when adding markdown in the middle of a block`** `:241`
```
Expected: 'test <strong>mid</strong> xsentence'
Received: different cursor position after typing 'x'
```

**`caret should handle cursor BEFORE pattern start`** `:268`
```
Expected: 'xhello <strong>bold</strong>'
Received: cursor landed in wrong position
```

**`caret should handle pattern with punctuation before it`** `:312`
```
Expected: 'hello, <strong>world</strong>!x'
Received: 'x' ended up in wrong position
```

**`caret should handle typing after pattern with no trailing space`** `:358`
```
Expected: 'prefix <strong>bold</strong>suffix'
Received: different structure
```

**`caret should handle typing in middle then navigating away and back`** `:368`
```
Expected: 'start<strong>mid</strong> x end'
Received: different structure after navigation
```

**`caret should land after each nested bold, not after "text", when typing inside italic`** `:422`
```
Expected match: /<em>italic <strong>b<\/strong>x text<\/em>/
Received: no match — caret did not land after nested </strong>
```

**`caret should land after each nested italic, not after "text", when typing inside bold`** `:461`
```
Expected match: /<strong>bold <em>i<\/em>x text<\/strong>/
Received: no match — caret did not land after nested </em>
```

---

### rich-editor-inline-patterns.spec.ts

**`should handle multiple italic elements inside bold`** `:170`
```
Expected match: /<strong>bold <em>i<\/em> <em>i<\/em> text<\/strong>/
Received: second <em> not found or structure differs
```

**`should handle multiple bold elements inside italic`** `:213`
```
Expected match: /<em>italic <strong>b<\/strong> <strong>b<\/strong> text<\/em>/
Received: second <strong> not found or structure differs
```

**`should convert **_bold italic_** to <strong> wrapping <em>`** `:375`
```
Expected match: /<strong><em>bold italic<\/em><\/strong>/
Received: <em> not found inside <strong>
```

**`should convert **~~bold deleted~~** to <strong> wrapping <del>`** `:426`
```
Expected match: /<strong><del>bold deleted<\/del><\/strong>/
Received: <del> not found inside <strong>
```

**`should handle triple nesting: ***~~text~~***`** `:443`
```
Expected match: /<em><strong><del>all styles<\/del><\/strong><\/em>/
Received: <del> not found inside nested structure
```

**`should handle different nesting combinations at start: **_text_**`** `:618`
```
Expected: <em> inside <strong> containing 'bold italic'
Received: <em> not found inside <strong>
```

**`should handle different nesting combinations at end: _**text**_`** `:637`
```
Expected: <strong> inside <em> containing 'italic bold'
Received: <strong> not found inside <em>
```
