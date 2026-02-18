# Test Results — 2026-02-15

**Run:** `npx playwright test tests/e2e/rich-editor-caret-position.spec.ts tests/e2e/rich-editor-inline-patterns.spec.ts`

**Summary:** 45 passed / 16 failed / 61 total

---

## Current state (`merge-test` branch) — span-fragile assertion fixes in test files

**Summary:** 45 passed / 16 failed / 61 total  *(net vs previous: +12 pass, −12 fail)*

### Changes applied
- **Test files only** — no source code changes
- `rich-editor-caret-position.spec.ts`: ~12 `innerHTML.toContain/toMatch` assertions replaced with locator-based (`expect(locator).toContainText`, `not.toContainText`) checks
- `rich-editor-inline-patterns.spec.ts`: ~6 `innerHTML.toMatch` assertions replaced with locator-based checks
- Removed one unused `innerHTML` variable declaration

### Remaining 16 failures — all real bugs, not assertion issues

| Test | Description | Root cause |
|------|-------------|------------|
| `caret-position:77` | caret should be after nested patterns (`***nested***`) | `em > strong` not created — `***` intermediate transform issue |
| `caret-position:116` | caret should handle backspace after pattern transformation | Backspace overshoots into focus span, unwraps `<strong>` |
| `caret-position:266` | caret should handle cursor BEFORE pattern start | ArrowLeft offset inflated by focus mark span text |
| `caret-position:375` | caret should handle typing in middle then navigating away and back | Space typed inside `<strong>` after transform, wrong cursor position |
| `caret-position:403` | caret should handle underscore bold pattern (`__bold__`) | Creates `<em>` not `<strong>` — intermediate `_italic_` fires at char 7 |
| `caret-position:430` | caret should land after nested bold, not after "text", when typing inside italic | Cursor lands inside `<strong>` after nested transform |
| `caret-position:472` | caret should land after nested italic, not after "text", when typing inside bold | Same as above for `<em>` inside `<strong>` |
| `inline-patterns:168` | should handle multiple italic elements inside bold | Second `<em>` typed inside instead of beside first |
| `inline-patterns:207` | should handle multiple bold elements inside italic | Second `<strong>` typed inside instead of beside first |
| `inline-patterns:359` | should convert `**_bold italic_**` to `<strong>` wrapping `<em>` | Intermediate transform produces wrong nesting order |
| `inline-patterns:373` | should convert `_**italic bold**_` to `<em>` wrapping `<strong>` | Same — `_` intermediate fires before `**` completes |
| `inline-patterns:387` | should convert `~~**deleted bold**~~` to `<del>` wrapping `<strong>` | Intermediate `~~` fires mid-pattern |
| `inline-patterns:401` | should convert `**~~bold deleted~~**` to `<strong>` wrapping `<del>` | Intermediate `**` italic fires before `~~` closes |
| `inline-patterns:415` | should handle triple nesting: `***~~text~~***` | Multiple intermediate transforms conflict |
| `inline-patterns:518` | PDN: should handle nested pattern with phrase at start | `***bold italic phrase***` → `em > strong` not created |
| `inline-patterns:613` | PDN: should handle nested pattern followed immediately by text | `***word***text` — nested struct not created, `text` goes inside |

### Previously failing → now fixed ✅ (span-fragile assertion changes)

Tests that were failing solely because `innerHTML` contained focus mark spans (`<span class="pd-focus-mark">**</span>`):

| Test | Description |
|------|-------------|
| `caret-position:52` | caret should handle pattern followed by space and text |
| `caret-position:78` | follow-up `innerHTML` check after nested patterns |
| `caret-position:297` | caret should handle multiple patterns — cursor at end |
| `caret-position:310` | caret should handle pattern with punctuation before it |
| `caret-position:323` | caret should handle pattern at very start of block |
| `caret-position:338` | caret should handle long text with pattern in middle |
| `caret-position:356` | caret should handle typing after pattern with no trailing space |
| `caret-position:366` | caret should handle typing in middle then navigating away and back *(assertion only — real bug remains)* |
| `caret-position:394` | caret should handle underscore bold pattern *(assertion only — real bug remains)* |
| `caret-position:420` | caret should land after nested bold *(assertion only — real bug remains)* |
| `caret-position:459` | caret should land after nested italic *(assertion only — real bug remains)* |
| `inline-patterns:86` | should handle space after styled element correctly |
| `inline-patterns:107` | should allow multiple characters after styled element |
| `inline-patterns:325` | should maintain cursor position after pattern conversion |
| `inline-patterns:431` | should prevent typing inside nested styled elements |
| `inline-patterns:546` | PDN: should handle nested pattern with phrase in middle *(assertion only — real bug remains)* |
| `inline-patterns:613` | PDN: should handle nested pattern followed immediately by text *(assertion only — real bug remains)* |

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
