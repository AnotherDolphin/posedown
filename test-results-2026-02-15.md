# Test Results — 2026-02-15

**Run:** `npx playwright test tests/e2e/rich-editor-caret-position.spec.ts tests/e2e/rich-editor-inline-patterns.spec.ts`

**Current:** 49 passed / 7 failed / 61 total *(`:296` caret-position occasionally flaky in sequential runs)*

| Test | Description | Bug |
|------|-------------|-----|
| `caret:404` | `__bold__` → `<strong>` | BUG-1 |
| `caret:431` | nested bold inside italic | BUG-2 |
| `caret:474` | nested italic inside bold | BUG-2 |
| `inline:168` | multiple italic inside bold | BUG-2 |
| `inline:207` | multiple bold inside italic | BUG-2 |
| `inline:359` | `**_bold italic_**` → `<strong><em>` | BUG-4 |
| `inline:418` | `***~~text~~***` triple nesting | BUG-3 |

```bash
npx playwright test \
  "tests/e2e/rich-editor-caret-position.spec.ts:404" \
  "tests/e2e/rich-editor-caret-position.spec.ts:431" \
  "tests/e2e/rich-editor-caret-position.spec.ts:474" \
  "tests/e2e/rich-editor-inline-patterns.spec.ts:168" \
  "tests/e2e/rich-editor-inline-patterns.spec.ts:207" \
  "tests/e2e/rich-editor-inline-patterns.spec.ts:359" \
  "tests/e2e/rich-editor-inline-patterns.spec.ts:418" \
  --reporter=list
```

---

## Confirmed Source-Code Bugs

### BUG-1 — `__bold__` creates `<em>` instead of `<strong>`
At char 7 of `__bold__`, CommonMark parses `__bold_` as `_` + `<em>bold</em>`. The 8th `_` triggers `unwrapAndReparseInline` which serialises `<em>` as `*bold*` (ast-utils always uses `*`, never `_`). Reparse of `_*bold*_` produces another `<em>`, not `<strong>`. Fix: suppress single-delimiter intermediate matches flanked by the same delimiter char at `transform.ts` site 1 (see `findFirstMdMatch-regression-tracker.md` Option C).

**Failing tests:** `caret:404`

### BUG-2 — Cursor jumps to parent end after nested inner-element transform
When typing a nested pattern (e.g. `**b**`) inside an existing `<em>`, `injectInlineMarks` calls `setCaretAtEnd` on the new inner `<strong>`, which resolves to the end of the **parent** `<em>` because `getLastTextDescendant` descends into the last child recursively. The inner `<strong>` ends up placed outside `<em>` in the final DOM.

**Failing tests:** `caret:431`, `caret:474`, `inline:168`, `inline:207`

### BUG-3 — `***word***` / `***~~text~~***` lose outer `*`
At char 6 of `***word***`, the intermediate `*<em>word</em>` fires. The final `*` triggers `checkAndMirrorSpans` on the `<em>`, mirroring → `**`, then `unwrapAndReparseInline`. Reparse sees `**word**` not `***word***` — outer `*` is lost, result is `<strong>` with no `<em>`.

**Failing tests:** `inline:418` (`***~~text~~***`); `caret:78` + `caret:404` show related symptoms

### BUG-4 — `**_bold italic_**` blocked by `handleInlineMarkEdges` at `<em>` right edge
When typing `**_bold italic_**`, the `_bold italic_` fires and creates `<em>`. Subsequent `*` keystrokes are intercepted by `handleInlineMarkEdges` (cursor is at the right edge of `<em>`), preventing `findAndTransform` from seeing the complete `**...**` pattern.

**Failing tests:** `inline:359`

---

## Finalized Tests — `rich-editor-caret-position.spec.ts`

23 pass / 3 fail (+ `:78` and `:296` flaky in suite)

| Line | Description | Status |
|------|-------------|--------|
| `:20` | caret after `**bold**` | ✅ |
| `:36` | pattern with text before it | ✅ |
| `:52` | pattern + space + text | ✅ |
| `:65` | pattern in middle of text | ✅ |
| `:78` | `***nested***` caret position | ⚠️ flaky (BUG-3 in suite) |
| `:94` | multiple patterns in sequence | ✅ |
| `:117` | backspace after pattern | ✅ |
| `:132` | space after pattern stays outside | ✅ |
| `:156` | rapid typing after pattern | ✅ |
| `:166` | mixed patterns preserved | ✅ |
| `:186` | pattern at start of line | ✅ |
| `:197` | pattern at end of line | ✅ |
| `:211` | strikethrough pattern | ✅ |
| `:226` | code pattern | ✅ |
| `:241` | markdown in middle of block | ✅ |
| `:266` | cursor BEFORE pattern start | ✅ |
| `:296` | multiple patterns, cursor at end | ⚠️ flaky |
| `:313` | pattern with punctuation before it | ✅ |
| `:327` | pattern at very start of block | ✅ |
| `:342` | long text, pattern in middle | ✅ |
| `:362` | typing after pattern (no trailing space) | ✅ |
| `:375` | navigate away and back | ✅ |
| `:418` | single underscore italic `_italic_` | ✅ |
| `:404` | `__bold__` → `<strong>` | ❌ BUG-1 |
| `:431` | nested bold inside italic | ❌ BUG-2 |
| `:474` | nested italic inside bold | ❌ BUG-2 |

---

## Finalized Tests — `rich-editor-inline-patterns.spec.ts`

26 pass / 4 fail. Six tests previously mis-listed as failures (`:373`, `:387`, `:401`, `:518`, `:568`, `:613`) were state-contamination artefacts; user confirmed all pass with `// review: passes` comments.

| Line | Description | Status |
|------|-------------|--------|
| `:17` | `**bold**` → `<strong>` | ✅ |
| `:31` | `*italic*` → `<em>` | ✅ |
| `:43` | `` `code` `` → `<code>` | ✅ |
| `:54` | `~~deleted~~` → `<del>` | ✅ |
| `:65` | prevent typing inside styled element | ✅ |
| `:86` | space after styled element stays outside | ✅ |
| `:107` | multiple chars after styled element | ✅ |
| `:126` | mixed inline patterns | ✅ |
| `:143` | prevent deletion of last `<p>` | ✅ |
| `:168` | multiple italic inside bold | ❌ BUG-2 |
| `:207` | multiple bold inside italic | ❌ BUG-2 |
| `:244` | `**bold *italic* text**` nested | ✅ |
| `:259` | whitespace break-spaces CSS | ✅ |
| `:269` | rapid typing after conversion | ✅ |
| `:285` | space-only text node continuation | ✅ |
| `:304` | Delete key `<p>` protection | ✅ |
| `:325` | cursor position after conversion | ✅ |
| `:343` | `***bold italic***` → `<em><strong>` | ✅ |
| `:359` | `**_bold italic_**` → `<strong><em>` | ❌ BUG-4 |
| `:374` | `_**italic bold**_` → `<em><strong>` | ✅ |
| `:389` | `~~**deleted bold**~~` → `<del><strong>` | ✅ |
| `:404` | `**~~bold deleted~~**` → `<strong><del>` | ✅ |
| `:418` | triple nesting `***~~text~~***` | ❌ BUG-3 |
| `:434` | prevent typing inside nested after conversion | ✅ |
| `:457` | complex nested with text around | ✅ |
| `:475` | PDN: `***word***` at start | ✅ |
| `:489` | PDN: `text ***word***` at end | ✅ |
| `:504` | PDN: `before ***word***` in middle | ✅ |
| `:522` | PDN: `***bold italic phrase***` at start | ✅ |
| `:536` | PDN: `start ***bold italic phrase***` at end | ✅ |
| `:551` | PDN: phrase in middle | ✅ |
| `:573` | PDN: `**_text_**` at start | ✅ |
| `:589` | PDN: `start _**italic bold**_` at end | ✅ |
| `:604` | PDN: single char `***x***` | ✅ |
| `:619` | PDN: `***word***` + immediate text | ✅ |

---

## Test fixes applied (span-fragile assertion cleanup)

| Test | Fix |
|------|-----|
| `caret:52`, `caret:78`, `caret:117`, `caret:266`, `caret:297`, `caret:310`, `caret:323`, `caret:338`, `caret:356`, `caret:366`, `caret:394`, `caret:420`, `caret:459` | `innerHTML.toContain/toMatch` → locator-based assertions |
| `caret:266` | `ArrowLeft ×11` → `Control+Home` (focus-mark-sensitive navigation) |
| `inline:86`, `inline:107`, `inline:325`, `inline:431`, `inline:546`, `inline:613` | `innerHTML.toMatch` → locator-based assertions |