# Implementation Plan: History Break Before Pattern Completion

> **Created:** 2024-12-25

## Objective
Save editor state BEFORE the final character that completes a markdown pattern, so undo can return to `**make bold*` instead of `**make bold**`.

## Problem Analysis
Currently, the history is saved in `onInput` AFTER the transformation occurs. This means:
1. User types `**make bold*` (no pattern match yet)
2. User types final `*` → DOM now has `**make bold**`
3. `onInput` fires, detects complete pattern, transforms to bold
4. History saved with already-transformed state

We need to break coalescence BEFORE step 2.

## ✅ Selected Approach: Local Pattern Delimiter Detection

**Why this approach:**
- Detects valid markdown delimiters (like `**`, `- `, `# `) at cursor position
- Avoids false positives (won't break on "cost-benefit" or standalone `-`)
- Simpler than full pattern prediction (no regex on whole block)
- Smarter than character-based (only breaks on valid delimiters)
- ~15 lines of code vs 50+ for full prediction

**How it works:**
Check text at the anchor node to see if typing the next character would complete a valid delimiter:
- `*` → break (valid italic delimiter)
- `**` → break (valid bold delimiter)
- `-` alone → NO break (requires space for list)
- `- ` → break (valid list marker)
- `#` alone → NO break (requires space for heading)
- `# ` → break (valid heading marker)

## Implementation Steps

### 1. Create Delimiter Detection Utility
**File**: `src/lib/rich/utils/delimiter-detection.ts` (new file)

Create a function that checks if text ends with a valid markdown delimiter:

```typescript
/**
 * Detects if text ends with a valid markdown delimiter
 * Used to break history coalescence before delimiter completion
 *
 * @param text - Text to check (typically text before cursor + next char)
 * @returns true if text ends with a complete, valid markdown delimiter
 */
export function endsWithValidDelimiter(text: string): boolean {
  // Symmetric inline delimiters (can be opener or closer)
  const symmetricDelimiters = [
    '**',   // Bold
    '*',    // Italic
    '__',   // Underline
    '_',    // Italic (underscore)
    '~~',   // Strikethrough
    '`',    // Code
    '==',   // Highlight
    '^',    // Superscript
    '~'     // Subscript
  ]

  // Block markers (require space after)
  const blockDelimiters = [
    '# ',     // H1
    '## ',    // H2
    '### ',   // H3
    '#### ',  // H4
    '##### ', // H5
    '###### ',// H6
    '- ',     // Unordered list
    '+ ',     // Unordered list (alt)
    '* ',     // Unordered list (alt)
    '> '      // Blockquote
  ]

  // Ordered list pattern: /\d+\. $/
  if (/\d+\. $/.test(text)) return true

  // Check symmetric delimiters
  if (symmetricDelimiters.some(d => text.endsWith(d))) return true

  // Check block delimiters
  if (blockDelimiters.some(d => text.endsWith(d))) return true

  return false
}
```

**Key details**:
- No external dependencies (standalone utility)
- Detects complete delimiters only (not `-` alone, only `- ` with space)
- Covers all inline and block patterns
- Very fast (string endsWith checks)

### 2. Implement `onBeforeInput` Handler
**File**: `src/lib/rich/richEditorState.svelte.ts`

Update the `onBeforeInput` handler (currently at line 206-210):

```typescript
private onBeforeInput = (e: InputEvent) => {
  if (e.inputType !== 'insertText' || !e.data || !this.editableRef) return

  const selection = window.getSelection()
  if (!selection?.anchorNode) return

  const anchorNode = selection.anchorNode
  if (anchorNode.nodeType !== Node.TEXT_NODE) return

  // Get text before cursor in the anchor node
  const textContent = anchorNode.textContent || ''
  const cursorPos = selection.anchorOffset
  const textBeforeCursor = textContent.substring(0, cursorPos)

  // Check if adding this character would complete a delimiter
  const afterInsert = textBeforeCursor + e.data

  if (endsWithValidDelimiter(afterInsert)) {
    this.history.breakCoalescing(this.editableRef)
  }
}
```

**Key details**:
- Only process `insertText` events
- Work with anchor node text (local context, not whole block)
- Check text before cursor + incoming character
- Break coalescence if delimiter completes
- Let event proceed normally (no preventDefault)

### 3. Update Imports
**File**: `src/lib/rich/richEditorState.svelte.ts`

Add import for the new utility:
```typescript
import { endsWithValidDelimiter } from './utils/delimiter-detection'
```

### 4. Ensure `onInput` Saves Post-Transformation State
**File**: `src/lib/rich/richEditorState.svelte.ts` (line 199)

The flow will be:
1. `onBeforeInput` detects delimiter → breaks coalescence → saves pre-delimiter state
2. Character inserted into DOM
3. `onInput` detects complete pattern and transforms
4. `onInput` calls `push()` to save post-transformation state (line 199)

This creates two history snapshots:
- Before: `**make bold*` (incomplete pattern)
- After: Bold rendered text (transformed)

## Critical Files
- **New**: `src/lib/rich/utils/delimiter-detection.ts`
- **Modified**: `src/lib/rich/richEditorState.svelte.ts` (onBeforeInput handler)

## Edge Cases Handled
1. **Non-text input**: Only process `insertText` events
2. **Missing selection**: Guard against null selections
3. **Non-text nodes**: Only process TEXT_NODE types
4. **Complex patterns**: Both inline (bold, italic) and block (headings, lists) patterns are checked

## Testing Scenarios
1. **Type `**bold**`**:
   - State after `**make bold*`: History coalesced (rapid typing)
   - Type final `*`: `beforeinput` predicts completion → breaks coalescence → saves `**make bold*`
   - `onInput` transforms to bold → saves transformed state
   - Result: 2 undo snapshots (incomplete + complete)

2. **Type `# Heading `**:
   - State after `# Heading`: History coalesced
   - Type space: `beforeinput` predicts heading → breaks coalescence → saves `# Heading`
   - `onInput` transforms to H1 → saves transformed state
   - Result: 2 undo snapshots

3. **Type `*italic*`**:
   - Similar to bold: breaks before final `*`

4. **Rapid typing without patterns**:
   - Should coalesce normally (no extra history)
   - Only one undo point per 500ms coalescing window

5. **Typing "cost-benefit"**:
   - `-` alone doesn't trigger (no space after)
   - No false breaks in regular prose

6. **Typing inside existing bold**:
   - Delimiters trigger at anchor node, but transformation won't happen
   - Safe false positive (extra history snapshot but no harm)

## Expected Undo Behavior
For `**make bold**` example:
- **Undo once**: See `**make bold*` (incomplete pattern, pre-transformation)
- **Undo twice**: See text before starting the pattern
- User can see exactly when the transformation occurred

## Performance Considerations
- `endsWithValidDelimiter` runs on every `insertText` event
- Very lightweight: ~15 string `endsWith` checks + 1 regex test per keystroke
- No DOM manipulation in `beforeinput`
- Negligible performance impact (<0.1ms per keystroke)
