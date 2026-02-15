# `findFirstMdMatch` Replacement — Regression Tracker

Tracks regressions, root-cause findings, and advice from replacing `findFirstMarkdownMatch`
(regex-based) with `findFirstMdMatch` (CommonMark/mdast-based) across all call sites.

**Last updated:** 2026-02-13
**Branch:** main
**Baseline commits:** `5de7ac0`, `3f291f8`, `7e6ac32`

---

## Call Sites

| # | File | Function | Current state |
|---|------|----------|---------------|
| 1 | `src/lib/core/transforms/transform.ts:52` | `findAndTransform` — guard + inline transform | `findFirstMdMatch` (new) |
| 2 | `src/lib/core/utils/dom.ts:446` | `processMarkdownInTextNodes` — paste only | `findFirstMdMatch` (new) |
| 3 | `src/lib/core/utils/focus-mark-manager.ts:355` | `unwrapAndReparseInline` — cursor | `findFirstMdMatch` (new) |
| 4 | `src/lib/core/utils/focus-mark-manager.ts:453` | `handleNestedPatterns` — cursor | `findFirstMarkdownMatch` (old) |
| 5 | `src/lib/core/utils/focus-mark-manager.ts:490` | `onInlineBreakingEdits` — `text !==` check | `findFirstMarkdownMatch` (old) |

---

## Root Cause Discovery

### The `preventNesting` guard and what it was secretly doing

The old `findFirstMarkdownMatch` uses `preventNesting` for all single-char delimiters
(`*`, `_`, `~`, `^`). For `_`:

```
(?<!_)_(?![_\s]).+?_(?!_)
```

This prevents `_` from matching when it is preceded by another `_` (opening) or when the
closing `_` is followed by another `_`. Designed to stop `_italic_` from matching inside
`__bold__`, but it had a critical **side effect**: it also blocked matches on **incomplete
double-delimiter sequences** typed character by character.

### Intermediate state problem

Site 1 (`transform.ts` / `findAndTransform`) runs on **every keystroke**. When a user types
`__bold__` or `**bold**` one character at a time, there is a dangerous intermediate state at
the 7th character:

| Sequence | Intermediate (7 of 8) | CommonMark parses as | Old regex result |
|---|---|---|---|
| `__bold__` | `__bold_` | `_` (text) + `_bold_` (emphasis) | **null** — `preventNesting` blocks |
| `**bold**` | `**bold*` | `*` (text) + `*bold*` (emphasis) | **null** — `preventNesting` blocks |

`findFirstMdMatch` correctly follows CommonMark and **does return an emphasis match** for both
intermediate states. This triggers a premature DOM transform before typing is complete.

### The asymmetry: why `**` self-heals but `__` does not

When a premature `<em>` is created, the cursor is repositioned after it. The user then types
the final delimiter. At that point `findAndTransform` calls `domToMarkdown` on the current DOM
and re-parses it. The outcome depends entirely on how `ast-utils` serializes `<em>`:

**`ast-utils` always serializes `<em>` as `*...*` (asterisk), never `_..._`.**

| Delimiter | Premature DOM | `domToMarkdown` output | Re-parse result | Outcome |
|---|---|---|---|---|
| `**bold**` | `*` + `<em>bold</em>` + `*` | `**bold**` | `<strong>bold</strong>` | ✅ self-heals |
| `__bold__` | `_` + `<em>bold</em>` + `_` | `_*bold*_` | `<em>*bold*</em>` or similar | ❌ broken |

The `*` case produces matching outer delimiters (`*` + `*bold*` + `*` = `**bold**`).
The `_` case produces **mismatched outer delimiters** (`_` + `*bold*` + `_` = `_*bold*_`)
because `ast-utils` normalizes `<em>` to `*` rather than preserving `_`. The round-trip
never recovers a `<strong>`.

This was verified empirically with e2e tests:
- `detection.spec.ts:256` — `__bold__`: intermediate `<em>` visible ✓ (expected CommonMark
  behavior), final `<strong>` missing ✗ (broken round-trip)
- `detection.spec.ts:285` — `**bold**`: intermediate `<em>` visible ✓ (same CommonMark
  behavior), final `<strong>` present ✓ (self-healed)

---

## Test Matrix (targeted run, 3 configurations)

✅ pass  ❌ fail

| Test | ALL OLD | ALL NEW | Verdict |
|------|:-------:|:-------:|---------|
| `detection.spec.ts:256` | ✅ | ❌ | Broken: `__bold__` → `_*bold*_` round-trip failure |
| `detection.spec.ts:285` | ✅ | ✅ | Passes: `**bold**` self-heals via `*` normalization |
| `span-persistence.spec.ts:100` | ✅ | ❌ | Same `_` round-trip issue |
| `inline-mirroring.spec.ts:320` | ✅ | ❌ | Same `_` round-trip issue |
| `inline-mirroring.spec.ts:1378` | ✅ | ❌ | Same `_` round-trip issue |
| `inline-mirroring.spec.ts:636` | ✅ | ❌ | `onInlineBreakingEdits` (site 5) mismatch |
| `list-behavior.spec.ts:95` | ✅ | ❌ | Likely site-1 cursor cascade (ignored for now) |
| `list-behavior.spec.ts:247` | ✅ | ❌ | Likely site-1 cursor cascade (ignored for now) |
| `list-behavior.spec.ts:617` | ❌ | ❌ | Pre-existing — unrelated |
| `list-tab-behavior.spec.ts:104` | ✅ | ❌ | Likely site-1 cursor cascade (ignored for now) |
| `caret-position.spec.ts:165` | ❌ | ✅ | **FIXED** by new function |
| `caret-position.spec.ts:312` | ❌ | ✅ | **FIXED** by new function |
| `inline-patterns.spec.ts:340` | ❌ | ✅ | **FIXED** by new function |

---

## Fixes Already Delivered

### `caret-position:165` — mixed `**bold** *italic*` patterns
Old regex greedy match computed a wrong `start` offset, placing caret inside the second
pattern. CommonMark parser uses structural boundaries, fixed by new function.

### `caret-position:312` — `hello, **world**!` punctuation adjacent
Old regex included trailing `!` in the match. CommonMark correctly excludes punctuation from
delimiter boundaries.

### `inline-patterns:340` — `**~~bold deleted~~**` nested
Old regex matched `strikethrough` before `bold` in definition order when `**` was incomplete.
AST parser resolves nesting structurally.

---

## Quick Regression Command

```bash
npx playwright test \
  "tests/e2e/focus-marks/activation/detection.spec.ts:256" \
  "tests/e2e/focus-marks/activation/detection.spec.ts:285" \
  "tests/e2e/focus-marks/delimiter-editing/inline-mirroring.spec.ts:320" \
  "tests/e2e/focus-marks/delimiter-editing/inline-mirroring.spec.ts:1378" \
  --reporter=line
```

**Expected with ALL NEW (current):** 3 fail (detection:256, mirroring:320, mirroring:1378), 1 pass (detection:285)
**Target after fix:** 0 fail

---

## Advice / Strategic Options

*Reviewed by conpus, 2026-02-13.*

### Recommendation: Option C — Pre-transform guard at site 1

**Go with a thin post-parse filter at `transform.ts` site 1 only.** The other options are worse:

- **Revert site 1 to old function (Option A):** Throws away the 3 bug fixes already shipped. Old regex has fundamental precedence bugs (e.g. `***bold**` cases). Bad trade.
- **Fix `ast-utils` to preserve `_` delimiter identity (Option B):** `mdast-util-to-markdown` uses a single global `emphasis: '*'` option — not per-node. Threading source-delimiter metadata through the full parse-serialize pipeline is disproportionate plumbing and would still be fragile. Do not touch `ast-utils`.
- **Hybrid flag in `findFirstMdMatch` (Option D):** Just adds indirection. The function's job is to report correct CommonMark matches. UI-timing concerns belong at the call site.

### How to implement

The problem is narrow: at site 1 (per-keystroke), a single-delimiter emphasis match may be
an incomplete double-delimiter sequence (`__bold_`, `**bold*`). The fix is a small wrapper
that suppresses emphasis matches that are flanked by their own delimiter character:

```ts
// In transform.ts or inline-patterns.ts
function findFirstMdMatchForTransform(text: string): MatchResult | null {
  const match = findFirstMdMatch(text)
  if (!match) return null

  // Suppress emphasis matches that look like incomplete double-delimiter sequences.
  // e.g. "__bold_" parses as valid <em> but the user is mid-way through "__bold__".
  if (match.delimiterLength === 1 && (match.patternName === 'italic' || match.patternName === 'italicUnderscore')) {
    const delimChar = text[match.start]
    const charBefore = match.start > 0 ? text[match.start - 1] : ''
    const charAfter = match.end < text.length ? text[match.end] : ''
    if (charBefore === delimChar || charAfter === delimChar) {
      return null // Half-typed **bold** or __bold__ — suppress
    }
  }

  return match
}
```

This is the exact semantic `preventNesting` provided in the old regex, expressed as a post-filter
on a correct parse result rather than baked into the regex. ~10 lines, no other call site touched.

### Execution order

| Step | Action | Risk |
|------|--------|------|
| 1 | Add `findFirstMdMatchForTransform` wrapper; use at site 1 (`transform.ts:52`) | Very low — only suppresses, never adds matches |
| 2 | Verify `detection:256`, `mirroring:320`, `mirroring:1378` go green | — |
| 3 | Migrate sites 4 & 5 (`focus-mark-manager.ts`) to `findFirstMdMatch` as follow-up | Medium — test carefully, especially `mirroring:636` |

Sites 2 and 3 stay on `findFirstMdMatch` unchanged.

---

## Moi suggestion

Instead of a post-parse filter, preserve focus marks in the **original user-input delimiter format** by storing the delimiter used (e.g. `data-delimiter="__"`) as data attached to the formatted DOM node. When focus marks are injected for that node, use the stored `__` instead of the normalized `**`. The hypothesis: if the marks display `__`, editing them would produce `__bold__` text in the round-trip, not the mismatched `_*bold*_`, sidestepping the normalization asymmetry entirely.

*Conpus review below.*

### Conpus response

**The suggestion relocates the root cause rather than removing it.** The problem has two independent parts, and the suggestion only addresses part of part B while missing part A entirely:

**Part A — Premature transform at site 1.**
`findAndTransform` strips focus mark spans at line 46 of `transform.ts` *before* calling `findFirstMdMatch` at line 52. Focus marks are not present when the per-keystroke detection runs. More critically, the premature transform fires mid-typing — there is no `<strong>` element yet when `__bold_` is being typed, so there is nothing to attach `data-delimiter` to. Storing original delimiters on rendered elements does not prevent the premature `<em>` from being created in the first place.

**Part B — Broken round-trip after premature transform.**
After the premature `<em>` is created (by the parser, not by the user's original transform), `domToMarkdown` serializes `_<em>bold</em>_`. The `<em>` has no `data-delimiter` attribute because it was just created mid-typing. Even if it did, `hast-util-to-mdast` and `mdast-util-to-markdown` do not read custom DOM attributes — they serialize based on node type alone. The normalization sits in `ast-utils.ts:37` (`emphasis: '*'`), not in focus mark injection.

**The suggestion does have a grain of truth at site 3** (`unwrapAndReparseInline`): if focus marks inject `__` instead of `**`, the flattened text becomes `__bold__` rather than `**bold**`, which parses differently in edge cases. But `unwrapAndReparseInline` calls a full reparse pipeline that runs through `ast-utils`, so the normalization happens again and the attribute is lost.

**Implementation concerns:**
- The `data-delimiter` attribute must survive every reparse cycle in `unwrapAndReparseInline` — each edit destroys and rebuilds the element from markdown. You would need to re-detect and re-attach it each time.
- Threading the original delimiter through `markdownToDomFragment` → `hast-util-to-dom` requires making stateless `ast-utils` functions stateful.
- User-edited delimiters (e.g. changing `__` to `**` via focus marks) would stale the stored attribute, requiring invalidation logic.
- Paste and programmatic content have no "original delimiter" — needs a fallback.

**Verdict:** This is a better idea as a **UX polish feature** (showing users the syntax they actually typed) than as a correctness fix. Option C (the ~10-line wrapper at site 1) directly prevents the premature transform that causes the cascade — no new state, no new invariants, one call site touched. The delimiter preservation idea should be tracked separately as a UX enhancement, not conflated with this bug.

---

### Moi clarification

The intermediate transform is not "premature" — it is correct CommonMark. The point is to **use the `<em>` that was just created** as the carrier of user intent. Attach `data-delimiter="_"` (or `"*"`) to that `<em>` at transform time (knowable from `text[match.start]` already returned by `findFirstMdMatch`). On the next keystroke, **before** falling through to `domToMarkdown`, check: does the block contain an `<em data-delimiter>` flanked by a matching text delimiter? If so, bypass the AST round-trip and produce `<strong>` directly. Metadata takes priority over custom round-trip conversion configs.

For `**bold*` → `*<em data-delimiter="*">bold</em>` → user types `*` → metadata `"*"` matches typed char → `<strong>bold</strong>` ✓
For `__bold_` → `_<em data-delimiter="_">bold</em>` → user types `_` → metadata `"_"` matches typed char → `<strong>bold</strong>` ✓

*Conpus re-review below.*

### Conpus re-review

**The mechanism is sound in the happy path.** The proposal is now more precise: `cloneNode(true)` does preserve `data-*` attributes, so the metadata would be readable on the clone that `findAndTransform` inspects at line 45. The check would go between lines 51 and 55 of `transform.ts`, inspecting the cleaned clone for `em[data-delimiter]` with flanking text nodes.

**Where the proposal is sound:**
- Correct delimiter is knowable at transform time: `text[match.start]` in `findFirstMdMatch` already gives it
- `cloneNode(true)` preserves `data-*` — clone-based check works
- Bypassing `domToMarkdown` for this specific case avoids the `emphasis: '*'` normalization entirely
- Works for both `*` and `_` symmetrically

**Where it is harder than it looks:**

1. **Metadata attachment point.** The `data-delimiter` must be set on the `<em>` inside the fragment produced by `markdownToDomFragment`, *after* `smartReplaceChildren` has committed it to the live DOM. A post-hoc `querySelector` on the live block after line 79 would do it, but this is non-trivial threading.

2. **DOMPurify.** `htmlToMarkdown` (`ast-utils.ts:86`) runs `DOMPurify.sanitize` which strips `data-*` by default. The attribute must survive any path that passes through `htmlToMarkdown`. Requires `ADD_ATTR: ['data-delimiter']` in the DOMPurify config, or the attribute is silently lost.

3. **Reparse cycles.** Every call to `unwrapAndReparseInline` destroys and rebuilds the element. The attribute is lost unless re-attached after each reparse. This means the detection and attachment logic must run on every transform, not just the initial one.

4. **Parallel transform path.** "Bypass `domToMarkdown` and produce `<strong>` directly" is a second transform path that must stay in sync with the main one — a maintenance surface.

5. **Stale metadata.** User edits the leading `_` to `*` after the `<em>` is created — the attribute is now wrong. Invalidation logic needed.

**Comparison to Option C:**

| | Option C | `data-delimiter` proposal |
|---|---|---|
| Lines of code | ~10, one file | ~30–50 across 2–3 files |
| New state | None | `data-delimiter` attribute, must survive reparse + DOMPurify |
| New failure modes | Narrow false suppression (flanking check is tight) | Stale attrs, lost attrs, parallel path divergence |
| Architectural fit | Stateless — matches the existing AST pipeline | Stateful — works against the stateless pipeline design |

**Revised verdict:** The clarified proposal is mechanically sounder than its first form, and the conceptual principle ("metadata over round-trip convention") is valid. But it requires cross-keystroke state in a codebase designed around stateless round-tripping, and every touchpoint (DOMPurify, reparse cycles, `smartReplaceChildren`, stale attr invalidation) is a new correctness invariant. Option C achieves identical user-visible results with none of that overhead.

If the owner wants to pursue the `data-delimiter` approach as a **longer-term architectural direction** — and possibly use it to also show users their original delimiter syntax in focus marks — it should be scoped as its own design spike, not a hotfix for the current regressions.
