# Pattern Matching Order - Reverted Fix

## Issue

Should `findFirstMarkdownMatch` return the first pattern that matches, or the earliest-appearing pattern in text?

## Original Implementation

```typescript
export function findFirstMarkdownMatch(text: string) {
  for (const [name, pattern] of Object.entries(patterns)) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (match && match.index !== undefined) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        patternName: name,
        delimiterLength: delimiters[name].length
      }
    }
  }
  return null
}
```

Returns first matching pattern based on iteration order (object key order).

## Attempted Fix

```typescript
export function findFirstMarkdownMatch(text: string) {
  let bestMatch = null
  let earliestIndex = Infinity

  for (const [name, pattern] of Object.entries(patterns)) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (match && match.index !== undefined) {
      // Prefer earlier matches, and for same position prefer longer delimiters
      if (match.index < earliestIndex ||
          (match.index === earliestIndex && bestMatch && delimiter.length > bestMatch.delimiterLength)) {
        earliestIndex = match.index
        bestMatch = { /* ... */ }
      }
    }
  }
  return bestMatch
}
```

Returns earliest pattern in text, with longer delimiters winning ties.

## Hypothetical Problem: Nested Patterns

**Example:** `_**text**_` (underscore wrapping bold)

With original implementation:
1. `bold` pattern checked first → matches `**text**` at position 1
2. Returns immediately, never checks for `_**text**_` at position 0
3. Transforms inner `**text**` first, leaving `_<strong>text</strong>_` (broken)

With fix:
1. Checks all patterns:
   - `bold`: `**text**` at position 1
   - `italicUnderscore`: `_**text**_` at position 0
2. Returns position 0 (earlier)
3. Transforms outer pattern first (correct)

## Why Not Actually Needed

**During Typing (Incremental Input)**

When typing `_**text**_` character by character:
1. Type `_**text**` with one more `*` → `**text**` completes first
   - Transforms to `_<strong>text</strong>` in DOM
   - textContent becomes `_text`
2. Type final `_` → `_text_` completes
   - Transforms to `<em>text</em>`

Only ONE pattern completes at a time. Inner patterns transform before outer delimiters close.

**Pattern Order Already Correct**

```typescript
export const patterns = {
  bold: createInlinePattern('**'),        // Longer delimiter, checked first
  italic: createInlinePattern('*', ...),  // Shorter delimiter, checked later
  // ...
}
```

Object insertion order in modern JS is deterministic. Longer delimiters come before shorter ones where needed.

## When It Would Matter

**Text-node-level processing during paste:**

If `processMarkdownInTextNodes` encounters text nodes with multiple complete patterns like `_**text**_` as plain text.

But:
1. The paste handler converts markdown → HTML before calling `processMarkdownInTextNodes`
2. Complete patterns are already transformed by `markdownToDomFragment`
3. `processMarkdownInTextNodes` only handles edge cases like `<strong>**code**</strong>` (markdown inside already-styled HTML)

## Conclusion

The fix doesn't affect the primary use case (incremental typing). It only matters for hypothetical edge cases that don't occur in practice.

Reverted to keep code simple and avoid premature optimization.
