# Mixed Delimiter Patterns - Reverted Fix

## Issue

`**b_i_**` does not render as nested emphasis: `<strong>b<em>i</em></strong>`

## Root Cause

**CommonMark Specification**: Underscores (`_`) cannot be used for emphasis inside strong (`**`).

Valid:
- `**b*i***` → `<strong>b<em>i</em></strong>` ✓
- `**bold**` → `<strong>bold</strong>` ✓
- `_italic_` → `<em>italic</em>` ✓

Invalid:
- `**b_i_**` → `<strong>b_i_</strong>` (no nested `<em>`)

This is per spec, not a bug.

## Attempted Fix (richEditorState.svelte.ts:205-227)

```typescript
const hasFormattedElements = fragment.querySelector('strong, em, code, ...')

if (hasFormattedElements || hasBlockPattern) {
  // Block-level conversion
  smartReplaceChildren(block, fragment, selection)
} else if (hasInlinePattern) {
  // FALLBACK: Text-node-level processing
  // Transforms each pattern independently, bypassing spec
  processMarkdownInTextNodes(block)
  setCaretAtEnd(block, selection)
}
```

**During typing `**b_i_**`:**

1. Type `**b_i_` (incomplete outer `**`)
   - Block parser fails (treats as plain text)
   - Fallback: `processMarkdownInTextNodes` finds `_i_` in isolation
   - Result: `**b<em>i</em>`

2. Type final `**` to complete
   - HTML: `**b<em>i</em>**`
   - Serializes to markdown: `**b*i***` (em becomes `*`)
   - Parses to: `<strong>b<em>i</em></strong>` ✓

## Why Reverted

**1. Violates CommonMark Spec**

The fix bypasses the parser during typing, producing results that contradict the spec:

```
Typing:  **b_i_**  → <strong>b<em>i</em></strong>  (via text-node processing)
Pasting: **b_i_**  → <strong>b_i_</strong>         (via spec-compliant parser)
```

Same markdown, different results. Breaks consistency.

**2. Hiding Spec Limitations**

Users typing `**b_i_**` would see nested emphasis, but:
- Pasting the same markdown produces different output
- Exporting to other markdown editors shows `_` as literal text
- Round-trip through markdown loses the nesting

Better to show spec-compliant behavior consistently.

## Conclusion

Mixed delimiters (`**` with `_`) are non-spec. Editor correctly rejects them.

**Correct syntax:** `**b*i***` for nested formatting.
