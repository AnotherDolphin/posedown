# `data-delimiter` — Feature Design

**Status:** Planning
**Related:** [findFirstMdMatch-regression-tracker.md](../findFirstMdMatch-regression-tracker.md), [focusMarks-design.md](../focusMarks-design.md)

---

## Overview

When a user types `__bold__`, the editor currently produces `**bold**` in `rawMd` and shows
`**bold**` in focus marks — even though the user typed `__`. The cause is `emphasis: '*'`
normalization in `ast-utils`, which collapses all emphasis/strong to `*` during serialization.

This feature attaches `data-delimiter="<char>"` to formatted DOM elements at the moment of
creation, so that:

1. `syncToTrees()` reads the attribute when serializing the DOM to `rawMd`, producing
   `__bold__` instead of `**bold**`
2. `injectInlineMarks` reads the attribute instead of re-deriving the delimiter via
   `htmlToMarkdown(element)`, showing `__bold__` in focus marks

No new parallel data structure. The DOM element is the carrier; `syncToTrees()` is the reader.
The attribute is set once at creation and re-set after any reparse cycle that rebuilds the element.

**Two attachment directions:**

1. **Markdown → DOM** (initial load, markdown panel edits, paste): The MDAST parser knows
   which delimiter was used (from `node.position.start.offset` in the source text). Inject
   `data-delimiter` via `hProperties` during MDAST→HAST conversion in `markdownToDomFragment`.
   This is the most comprehensive attachment point — every element created from markdown gets
   the attribute automatically.

2. **Typing → DOM** (per-keystroke transforms via `findAndTransform`): The `domToMarkdown`
   step normalizes `__` → `**` before `markdownToDomFragment` sees it, so the MDAST path
   produces `*` even when the user typed `_`. For this path, use `findFirstMdMatch` on the
   original spanless text (which still has `__`) and attach `data-delimiter` after
   `smartReplaceChildren` via set difference.

---

## Contingent Files

| File | What changes |
|------|-------------|
| `src/lib/core/utils/inline-patterns.ts` | Add `delimiterChar` to `findFirstMdMatch` return type |
| `src/lib/core/transforms/ast-utils.ts` | `markdownToDomFragment`: inject `data-delimiter` via MDAST `hProperties` during md→DOM conversion; configure DOMPurify `ADD_ATTR: ['data-delimiter']` in `htmlToMarkdown` |
| `src/lib/core/transforms/transform.ts` | Attach `data-delimiter` after `smartReplaceChildren` at site 1 (pre-copy + set difference) |
| `src/lib/core/dom/util.ts` | Re-attach `data-delimiter` after `reparse()` rebuilds an element |
| `src/lib/core/utils/focus-mark-manager.ts` | `injectInlineMarks`: read from `element.dataset.delimiter` instead of `extractInlineMarks` where present; `unwrapAndReparseInline`: update/clear attribute after user edits |
| `src/lib/svelte/richEditorState.svelte.ts` | `syncToTrees()`: use `data-delimiter` when serializing to `rawMd` |

---

## Implementation Steps

The implementation will be incrementally integrated:

0. Inject `data-delimiter` during markdown → DOM conversion (MDAST `hProperties`)
   — covers initial load, markdown panel edits, and any `markdownToDomFragment` call
1. Save `data-delimiter` attribute value on new patterns typed in the editor
   — per-keystroke path via `transform.ts` (pre-copy + set difference)
2. Read the attribute value on element focus to display the corresponding focus mark
3. Update the attributes for nodes that were altered due to reparse
4. Make sure refocusing correctly reads up to date attributes
5. Implement the sync-to-markdown flow (`syncToTrees`)
6. Explore edge cases and design fallbacks

---

## Design Decisions

### 0. Injecting `data-delimiter` during markdown → DOM conversion

When markdown is parsed into a DOM fragment (initial load, markdown panel edits, paste),
the MDAST parser already knows which delimiter was used — `node.position.start.offset`
points to the delimiter character in the source text. Inject `data-delimiter` before
HAST→DOM conversion via the MDAST `data.hProperties` mechanism:

```ts
// In markdownToDomFragment or its pipeline, after parsing MDAST:
import { visit } from 'unist-util-visit'

visit(mdast, ['emphasis', 'strong'], (node) => {
    const delimChar = markdown[node.position.start.offset]
    node.data = { ...(node.data || {}), hProperties: { 'data-delimiter': delimChar } }
})
```

`hProperties` causes `hast-util-to-dom` to set the attribute on the resulting HTML
element automatically. Every `<em>` and `<strong>` created from markdown gets
`data-delimiter` for free — no post-hoc querySelector needed.

This covers:
- **Initial load** — editor opens markdown → DOM elements tagged immediately
- **Markdown panel edits** — user edits `rawMd` → DOM re-renders with attributes
- **`processMarkdownInTextNodes`** (paste, site 2) — if it uses `markdownToDomFragment`

Does **not** cover: per-keystroke transforms (step 1), because `domToMarkdown`
normalizes `__` → `**` before `markdownToDomFragment` sees it.

---

### 1. Saving `data-delimiter` at transform time

`findFirstMdMatch` will return `delimiterChar` in `MatchResult` (e.g. `"_"`, `"*"`, `` "`" ``).
After `smartReplaceChildren` reconciles the block DOM, the newly created element needs the
attribute attached. Pre-existing elements that `smartReplaceChildren` preserved already carry
their `data-delimiter` from when they were first created.

**Approach — set difference:** Snapshot the block's formatted elements before
`smartReplaceChildren`, then after replacement find elements not in the snapshot:

```ts
const existing = new Set(block.querySelectorAll('strong, em, code, del, s'))
smartReplaceChildren(block, fragment, selection, hasInlinePattern)
for (const el of block.querySelectorAll('strong, em, code, del, s')) {
    if (!existing.has(el)) {
        el.dataset.delimiter = hasInlinePattern.delimiterChar
        break
    }
}
```

This depends on `smartReplaceChildren` preserving unchanged nodes (and their attributes)
during reconciliation. See **smartReplaceChildren analysis** below for verification.

---

### 2. Reading `data-delimiter` in `injectInlineMarks`

Currently `injectInlineMarks` calls `extractInlineMarks(element)` which runs
`htmlToMarkdown(element)` to reverse-engineer the delimiter string.

**Approach:** If `element.dataset.delimiter` is set, use it directly and skip
`extractInlineMarks`. Fall back to `extractInlineMarks` for elements without the
attribute (paste, programmatic content, old content). Log a diagnostic warning on
fallback to surface gaps in coverage.

---

### 3. Re-attachment after reparse

`reparse()` in `dom/util.ts` destroys the element and rebuilds from markdown. The new
element has no `data-delimiter`.

**Approach — caller responsibility:** In `unwrapAndReparseInline`, `handleNestedPatterns`,
etc.: read `activeInline.dataset.delimiter` before calling `reparse`, then attach to the
returned element. No change to `reparse()` itself. The delimiter is always available in
`FocusMarkManager` state (`activeInlineDelimiter`) or from the element being reparsed.

**Stale delimiter handling:** When the user edits `__` → `_` (bold → italic) via focus
marks, `unwrapAndReparseInline` fires and produces a new `<em>`. The re-attachment should
use the *new* delimiter from the edited span text (available from `checkAndMirrorSpans`),
not the old stored value.

---

### 4. Refocus correctness

After any DOM reconciliation or reparse, `refocus()` may re-enter the same or a new
element. `injectInlineMarks` must read the current `data-delimiter` from the live DOM
element — not from cached state. This is naturally correct if Decision 2 reads from
`element.dataset.delimiter` at injection time.

Verify: `refocus()` → `findFocusedInline()` → `injectInlineMarks(element)` →
`element.dataset.delimiter` is read fresh each time. No caching concern.

---

### 5. `syncToTrees` delimiter-aware serialization (deferred)

`syncToTrees` calls `htmlToMarkdown(editableRef.innerHTML)` — a string pipeline that
loses all DOM attribute context before reaching the markdown stringifier.

**Options under consideration:**

| Option | Description | Complexity |
|--------|-------------|------------|
| A | Pre-walk DOM, build element→delimiter map, post-process markdown string | Fragile offset matching |
| B | `ADD_ATTR: ['data-delimiter']` in DOMPurify + custom HAST→MDAST handler | ~20 lines, stays in pipeline |
| C | Custom serializer that walks DOM directly for `data-delimiter` elements | Bypasses pipeline |
| D | Store delimiter in MDAST node via custom handler + stringify | Cleanest, most plumbing |

Decision deferred until steps 1–4 are validated. DOMPurify config
(`ADD_ATTR: ['data-delimiter']`) is needed regardless of which option is chosen.

---

### 6. Edge cases and fallbacks (deferred)

- **Paste** (`processMarkdownInTextNodes`, site 2): If paste goes through
  `markdownToDomFragment`, step 0c handles it automatically. If it uses a
  different path, verify and add coverage.
- **Nested patterns** (`handleNestedPatterns`, site 4): Delimiter available from
  `findFirstMdMatch`. Should attach after reparse.
- **Duplicate elements:** `tagName:textContent` pre-copy key collides for identical
  elements in the same block (e.g. two `<em>italic</em>`). Revisit with positional
  fallback if this causes real issues.

---

## smartReplaceChildren Analysis

`smartReplaceChildren` uses `isEqualNode` (line 99) for its preservation check (Case C).
`isEqualNode` checks **all** attributes. This creates a critical interaction with
`data-delimiter`:

**Problem:** Once a `<strong data-delimiter="_">` exists in the block, the new fragment
from `markdownToDomFragment` produces `<strong>` without the attribute. `isEqualNode`
returns `false` → Case D fires → old node is **replaced** → attribute is lost.

**Solution — pre-copy before reconciliation:** Before calling `smartReplaceChildren`,
copy `data-delimiter` from existing formatted elements onto matching fragment elements.
Then `isEqualNode` sees matching attributes → Case C fires → old node preserved.

```ts
// In transform.ts, before smartReplaceChildren:
const delimiterMap = new Map<string, string>()
for (const el of block.querySelectorAll('strong, em, code, del, s')) {
    if ((el as HTMLElement).dataset.delimiter) {
        delimiterMap.set(`${el.tagName}:${el.textContent}`, (el as HTMLElement).dataset.delimiter!)
    }
}
for (const el of fragment.querySelectorAll('strong, em, code, del, s')) {
    const key = `${el.tagName}:${el.textContent}`
    if (delimiterMap.has(key)) {
        (el as HTMLElement).dataset.delimiter = delimiterMap.get(key)!
    }
}
```

Lookup key `tagName:textContent` matches elements by type + content. Duplicate
elements with identical tag and content could collide — acceptable for now;
revisit if it causes real issues.

**After pre-copy**, the set-difference approach for attaching `data-delimiter` to
newly created elements still works: pre-existing elements pass `isEqualNode` and
stay in the "existing" set; only the genuinely new element is outside it.

---

## Sequencing

| Step | Action | Files |
|------|--------|-------|
| 0a | Add `delimiterChar` to `findFirstMdMatch` return type | `inline-patterns.ts` |
| 0b | Configure DOMPurify `ADD_ATTR: ['data-delimiter']` | `ast-utils.ts` |
| 0c | Inject `data-delimiter` via MDAST `hProperties` in `markdownToDomFragment` | `ast-utils.ts` |
| 1 | Attach `data-delimiter` in `transform.ts` after `smartReplaceChildren` (pre-copy + set difference) | `transform.ts` |
| 2 | Read `data-delimiter` in `injectInlineMarks` with fallback to `extractInlineMarks` | `focus-mark-manager.ts` |
| 3 | Re-attach after `unwrapAndReparseInline` + `handleNestedPatterns` | `focus-mark-manager.ts` |
| 4 | Verify refocus reads fresh `data-delimiter` from live DOM | `focus-mark-manager.ts` |
| 5 | Implement `syncToTrees` delimiter-aware serialization (Decision 5) | `richEditorState.svelte.ts`, `ast-utils.ts` |
| 6 | Edge cases: nested patterns, stale delimiters, duplicate elements | various |

Step 0 (a–c) covers the md→DOM direction comprehensively. Steps 1–4 cover the
typing→DOM direction and focus marks. Steps 0–4 can ship before step 5 — the
marks will show correct delimiters and md→DOM will preserve them, before `rawMd`
fidelity on the DOM→md sync path is wired.
