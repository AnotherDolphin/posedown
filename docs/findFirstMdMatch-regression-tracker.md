# `findFirstMdMatch` Replacement — Regression Tracker

Tracks known regressions, fixes, and open questions from replacing `findFirstMarkdownMatch`
(regex-based) with `findFirstMdMatch` (CommonMark/mdast-based) across all call sites.

**Tested:** 2026-02-13
**Branch:** main
**Baseline commits:** `5de7ac0`, `3f291f8`, `7e6ac32`

---

## Call Sites

| # | File | Function | Current state |
|---|------|----------|---------------|
| 1 | `src/lib/core/transforms/transform.ts:50` | `findAndTransform` — guard + cursor | `findFirstMdMatch` |
| 2 | `src/lib/core/utils/dom.ts:446` | `processMarkdownInTextNodes` — paste only | `findFirstMdMatch` |
| 3 | `src/lib/core/utils/focus-mark-manager.ts:355` | `unwrapAndReparseInline` — cursor | `findFirstMdMatch` |
| 4 | `src/lib/core/utils/focus-mark-manager.ts:453` | `handleNestedPatterns` — cursor | `findFirstMarkdownMatch` (old) |
| 5 | `src/lib/core/utils/focus-mark-manager.ts:490` | `onInlineBreakingEdits` — `text !==` check | `findFirstMarkdownMatch` (old) |

---

## Test Matrix (targeted 16-test run, 3 configurations)

✅ pass  ❌ fail

| Test | ALL OLD | CURRENT (1,2,3=new) | ALL NEW | Verdict |
|------|:-------:|:-------------------:|:-------:|---------|
| `detection.spec.ts:256` | ✅ | ❌ | ❌ | Regressed by site 3 |
| `span-persistence.spec.ts:100` | ✅ | ❌ | ❌ | Regressed by site 3 |
| `inline-mirroring.spec.ts:320` | ✅ | ❌ | ❌ | Regressed by site 3 |
| `inline-mirroring.spec.ts:1378` | ✅ | ❌ | ❌ | Regressed by site 3 |
| `inline-mirroring.spec.ts:636` | ✅ | ✅ | ❌ | Regressed by site 5 only |
| `list-behavior.spec.ts:95` | ✅ | ❌ | ❌ | Cause unknown — see below |
| `list-behavior.spec.ts:247` | ✅ | ❌ | ❌ | Cause unknown — see below |
| `list-behavior.spec.ts:739` | ✅ | ❌ | ❌ | Cause unknown — see below |
| `list-tab-behavior.spec.ts:104` | ✅ | ❌ | ❌ | Cause unknown — see below |
| `list-behavior.spec.ts:617` | ❌ | ❌ | ❌ | Pre-existing — unrelated |
| `caret-position.spec.ts:165` | ❌ | ✅ | ✅ | **FIXED** by new function |
| `caret-position.spec.ts:312` | ❌ | ✅ | ✅ | **FIXED** by new function |
| `inline-patterns.spec.ts:340` | ❌ | ✅ | ✅ | **FIXED** by new function |
| `caret-position.spec.ts:36` | ✅ | ✅ | ✅ | False positive — flaky in full suite |
| `caret-position.spec.ts:325` | ✅ | ✅ | ✅ | False positive — flaky in full suite |
| `rich-editor-history.spec.ts:331` | ✅ | ✅ | ✅ | False positive — flaky in full suite |

---

## Regressions Detail

### Group A — `__bold__` / underscore normalization cluster (site 3)

Affects: `detection:256`, `inline-mirroring:320`, `inline-mirroring:1378`, `span-persistence:100`

**What they test:**
- Type `__bold__` → transforms to `<strong>bold</strong>`
- Click the element → focus mark spans injected as `**` (normalized from `__`)
- Further: edit opening span, delete one `*` → mirrors to `*` → rewraps as `<em>italic</em>`

**Why they fail:**
`unwrapAndReparseInline` (site 3) calls `findFirstMdMatch(parentBlock.textContent)` and
passes the result to `smartReplaceChildren` for cursor restoration. `smartReplaceChildren`
uses only `{ start, end, delimiterLength }`. The hypothesis (conpus) is that the new function
returns slightly different `start`/`end` for edge-case inputs inside a block with surrounding
text, placing the cursor off by one, which cascades into broken focus mark activation.

**To investigate:**
Add `console.log` of `parentBlock.textContent` and the result of both functions at the
`unwrapAndReparseInline` call site when these tests fail. Confirm whether `start`/`end`
actually differ between old and new for the specific text being passed.

**Likely fix:** Adjust cursor offset math in `smartReplaceChildren` to account for the
more accurate positions returned by `findFirstMdMatch`. The regex was calibrated to the
old function's positions.

---

### Group B — Breaking delimiter upgrade (site 5)

Affects: `inline-mirroring:636`

**What it tests:**
While cursor is inside `*italic*` with focus marks visible, type `*` → should upgrade
delimiter from `*` to `**` and rewrap as `<strong>italic</strong>` (or `<em><strong>`).

**Why it fails (ALL NEW only):**
`onInlineBreakingEdits` checks:
```ts
const matchWhole = findFirstMdMatch(this.activeInline.textContent || '')
const hasBreakingChange = matchWhole && matchWhole.text !== this.activeInline.textContent
```
`this.activeInline.textContent` includes the focus mark span text (the delimiter chars).
The new function's `text` slice (via `text.slice(start, end)`) might differ from the
regex match[0] for combined delimiters like `***` or in scenarios where the outer element
already has partial delimiters. When it disagrees, `hasBreakingChange` fires incorrectly
(or fails to fire), breaking the upgrade flow.

**Note:** Passes in CURRENT (site 5 still on old). Only fails when site 5 is switched to new.

**To investigate:**
Log `this.activeInline.textContent`, `matchWhole.text`, and both function results at the
`onInlineBreakingEdits` call site during the test.

---

### Group C — Mysterious list failures (cause unknown)

Affects: `list-behavior:95`, `list-behavior:247`, `list-behavior:739`, `list-tab:104`

**What they test:**
- `:95` — exit unordered list by pressing Enter on empty item twice
- `:247` — split a list item containing `**bold**` text at mid-point
- `:739` — escape ordered list via Backspace → produces a paragraph
- `:104` — Tab on second item appends to existing nested list

**Why they're mysterious:**
- Pure list logic lives in `handleEnterKey`/`handleBackspaceKey` in dom.ts — none of which use the inline match function
- `processMarkdownInTextNodes` (site 2, dom.ts) is paste-only (confirmed)
- `unwrapAndReparseInline` (site 3) only fires on focus mark edits, not on Enter/Backspace
- Both functions return `null` for "First item" (no inline syntax)
- The diff of `focus-mark-manager.ts` contains no structural changes beyond the function swaps

**Remaining hypotheses:**
1. **Performance**: `parseMarkdownToMdast` (full unified/remark pipeline) is significantly
   slower than a regex. The extra latency in `findAndTransform` (site 1) during the typing
   phase of these tests could cause browser input handling timing issues.
2. **Module side effect**: Importing `parseMarkdownToMdast` at the top of `inline-patterns.ts`
   (which loads early) might affect module initialization order in a subtle way.
3. **Cursor position cascade**: Site 1 places the cursor differently on `**bold**` in `:247`,
   which then causes the Enter-to-split to split at the wrong position, cascading into `:95`/`:739`
   if those run in the same browser context.

**To investigate:**
1. Revert only site 1 (`transform.ts`) to old function, re-run these 4 tests → if they pass,
   confirms site 1 is the cause
2. If site 1 is the cause, add timing measurement (`performance.now()`) around both function
   calls to check if latency is the factor

---

## Fixes Already Delivered

### `caret-position:165` — mixed `**bold** *italic*` patterns
Was failing with old regex. Fixed by new function in CURRENT and ALL NEW.
The old regex's greedy `**bold**` first match was computing a `start` offset that made
`smartReplaceChildren` place the caret inside the second pattern rather than after it.

### `caret-position:312` — `hello, **world**!` punctuation adjacent
Was failing with old regex. Fixed by new function.
Old regex matched up to and including the `!` in certain positions. CommonMark parser
correctly excludes trailing punctuation from the match boundary.

### `inline-patterns:340` — `**~~bold deleted~~**` nested
Was failing with old regex. Fixed by new function.
Pattern priority: old regex found `bold` at definition order position 1, but when the
outer `**` is not yet closed during char-by-char typing, it fell through to `strikethrough`
at the wrong time. The AST parser resolves nesting structurally, getting the right
outer/inner nesting order.

---

## Run Command (16 targeted tests)

```bash
npx playwright test \
  "tests/e2e/focus-marks/activation/detection.spec.ts:256" \
  "tests/e2e/focus-marks/activation/span-persistence.spec.ts:100" \
  "tests/e2e/focus-marks/delimiter-editing/inline-mirroring.spec.ts:320" \
  "tests/e2e/focus-marks/delimiter-editing/inline-mirroring.spec.ts:636" \
  "tests/e2e/focus-marks/delimiter-editing/inline-mirroring.spec.ts:1378" \
  "tests/e2e/list-behavior.spec.ts:95" \
  "tests/e2e/list-behavior.spec.ts:247" \
  "tests/e2e/list-behavior.spec.ts:617" \
  "tests/e2e/list-behavior.spec.ts:739" \
  "tests/e2e/list-tab-behavior.spec.ts:104" \
  "tests/e2e/rich-editor-caret-position.spec.ts:36" \
  "tests/e2e/rich-editor-caret-position.spec.ts:165" \
  "tests/e2e/rich-editor-caret-position.spec.ts:312" \
  "tests/e2e/rich-editor-caret-position.spec.ts:325" \
  "tests/e2e/rich-editor-history.spec.ts:331" \
  "tests/e2e/rich-editor-inline-patterns.spec.ts:340" \
  --reporter=line
```

**Expected baseline with CURRENT state (sites 1,2,3=new; 4,5=old):** 9 fail, 7 pass
**Target after fixes:** 0 fail (all 16 pass, including the 3 that were pre-broken)
