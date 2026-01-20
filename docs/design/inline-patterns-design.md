# Inline Pattern System

> Transforming markdown inline syntax (**, *, ~, `, etc.) into formatted HTML elements in real-time

## Overview

The inline pattern system detects and transforms markdown inline syntax as users type, providing instant visual feedback. When a user completes a markdown pattern like `**bold**`, the system replaces the text node with properly formatted HTML (`<strong>bold</strong>`).

### Architecture Flow

```
User Types: **text**
     ↓
onInput Event
     ↓
findFirstMarkdownMatch(text)
     ↓
Pattern Detected
     ↓
Convert block to Markdown
     ↓
Parse back to DOM (MDAST → HAST → HTML)
     ↓
Replace content + restore cursor
```

### Key Components

- **Pattern Definitions**: `src/lib/rich/utils/inline-patterns.ts` - Regex patterns for each markdown syntax
- **Detection Logic**: `richEditorState.onInput()` - Scans for patterns after each keystroke
- **Transformation**: Uses AST-based markdown ↔ HTML conversion for accurate formatting
- **History Integration**: `onBeforeInput()` - Breaks coalescing before delimiter completion

### Related Documentation

- **[history-design.md](history-design.md)** - Undo/redo system, break-before-delimiter strategy
- **[block-patterns-design.md](block-patterns-design.md)** - Block-level transformations, detection priority
- **[dom-selection-design.md](dom-selection-design.md)** - Cursor preservation during transformations

## Core Principles

### 1. First-Match Wins (Pattern Priority)

Patterns are checked in definition order. The first matching pattern is applied.

**Why**: Predictable behavior, faster than "best-match" algorithms, easier to reason about.

**Implementation**: Patterns are defined in a specific order in `inline-patterns.ts:51-77`:
- Double-char delimiters first (`**`, `==`, `__`)
- Single-char delimiters second (`*`, `_`, `^`, `~`)
- Complex patterns last (links, images, wiki links)

**Note**: Strikethrough uses single tilde (`~`) as the normalized delimiter. While both `~` and `~~` are accepted during parsing, serialization always outputs single `~`.

### 2. Nesting Prevention for Single-Character Delimiters

Single-character delimiters (`*`, `_`, `~`, `^`) use negative lookahead/lookbehind to prevent matching when part of a longer sequence.

**Example**:
```markdown
Input:  **bo*ld*text**
Output: <strong>bo*ld*text</strong>
        (NOT <strong>bo<em>ld</em>text</strong>)
```

**Why**: Avoids ambiguous syntax, matches markdown conventions, meets user expectations.

**Implementation**: `createInlinePattern()` with `preventNesting=true` generates:
```typescript
(?<!\*)\*(?!\*).+?(?<!\*)\*(?!\*)
// Don't match * if preceded or followed by another *
```

### 3. Break-Before-Delimiter Strategy

History is saved BEFORE the final delimiter is typed, allowing users to undo incomplete patterns.

**Flow**:
```
State 1: **make bold*        (user types first *)
         ↑ onBeforeInput detects delimiter completion
         ↑ history.breakCoalescing() saves state
State 2: **make bold**       (user types second *)
         ↑ transformation triggers
State 3: <strong>make bold</strong>
```

**Why**: Users can undo to `**make bold*` instead of losing all typing.

**Integration**: `richEditorState.onBeforeInput()` lines 209-230 calls `endsWithValidDelimiter()`.

### 4. Text Node Traversal Only

Pattern matching only occurs within text nodes, not element nodes.

**Why**: Prevents re-matching already transformed content, maintains semantic HTML structure.

## Implementation Details

### Location

**Primary**: `src/lib/rich/utils/inline-patterns.ts`
**Integration**: `src/lib/rich/richEditorState.svelte.ts` (onInput handler, lines 179-203)

### Pattern Creation System

**Function**: `createInlinePattern(delimiter, allowSpaceAfterOpening, preventNesting)`

Creates parameterized regex patterns to avoid code repetition.

**Parameters**:
- `delimiter`: The markdown syntax (`**`, `*`, `~`, `` ` ``, etc.)
- `allowSpaceAfterOpening`: Whether to allow space after opening delimiter (true for code blocks)
- `preventNesting`: Whether to add negative lookahead/lookbehind (true for single-char delimiters)

**Examples**:
```typescript
bold: createInlinePattern('**')
// Generates: /\*\*(?!\s).+?\*\*/g

italic: createInlinePattern('*', false, true)
// Generates: /(?<!\*)\*(?!\*).+?(?<!\*)\*(?!\*)/g

code: createInlinePattern('`', true)
// Generates: /`.+?`/g (allows spaces after opening `)
```

### Pattern Types

**CommonMark Basic**:
- `**bold**` → `<strong>`
- `*italic*` → `<em>`
- `_italic_` → `<em>` (alternative syntax)
- `` `code` `` → `<code>`

**GitHub Flavored Markdown**:
- `~strikethrough~` → `<del>` (single tilde, see Design Decision 5)

**Extended Syntax**:
- `==highlight==` → `<mark>`
- `~subscript~` → `<sub>`
- `^superscript^` → `<sup>`
- `__underline__` → `<u>`

**Links & Media**:
- `[text](url)` → `<a href="url">text</a>`
- `![alt](url)` → `<img src="url" alt="alt">`
- `[[wiki]]` → `<a href="/wiki">wiki</a>` (wiki-style links)

### Detection Flow

**Location**: `richEditorState.svelte.ts` onInput handler (lines 179-203)

```typescript
private onInput = (e: InputEvent) => {
    // Get current block element
    const block = getMainParentBlock(selection.anchorNode, this.editableRef)

    // Check for inline patterns
    const hasInlinePattern = findFirstMarkdownMatch(block?.textContent || '')

    if (hasInlinePattern) {
        // Convert block to markdown
        const contentInMd = htmlBlockToMarkdown(block)

        // Parse back to DOM
        const { fragment } = markdownToDomFragment(contentInMd)

        // Replace content and restore cursor
        smartReplaceChildren(block, fragment)

        // Save history after transformation
        this.history.push(this.editableRef)
    } else {
        // Regular typing - coalesced history
        this.history.pushCoalesced(this.editableRef)
    }
}
```

### Helper Functions

**`findFirstMarkdownMatch(text)`** (lines 144-163):
- Iterates through all patterns in order
- Returns first match with position info
- Returns `null` if no patterns match

**`hasInlineSyntax(text)`** (lines 98-105):
- Quick check if text contains any inline markdown
- Used for optimization (avoid unnecessary processing)

**`matchingPatterns(text)`** (lines 111-118):
- Returns array of all matching pattern names
- Useful for debugging and analysis

**`extractMatches(text, patternName)`** (lines 123-138):
- Extracts all occurrences of a specific pattern
- Returns array of match objects with capture groups

## Pattern Examples

### Example 1: Bold Transformation

```
State 1: <p>Hello **world|</p>
User types: * (second asterisk)
         ↓
         onBeforeInput detects "**" completion
         history.breakCoalescing() saves state
         ↓
State 2: <p>Hello **world**|</p>
         onInput event fires
         findFirstMarkdownMatch() → detects "**world**"
         ↓
State 3: <p>Hello <strong>world</strong>|</p>
         Cursor restored after <strong>
```

### Example 2: Preventing Nested Single-Char Delimiters

```markdown
Input:  **bo*ld*text**

Detection:
- First pass: "**bo*ld*text**" matches bold pattern
- Inside <strong>: "*ld*" does NOT match italic pattern
  (negative lookahead prevents matching * preceded by *)

Output: <strong>bo*ld*text</strong>

Correct behavior: Single * is literal text inside double **
```

### Example 3: Double-Char Nesting Allowed

```markdown
Input:  **_both_**

Detection:
- First pass: "**_both_**" matches bold pattern
- Parse content: "_both_" matches italic pattern

Output: <strong><em>both</em></strong>

Reason: Different delimiters don't interfere
```

### Example 4: Code Blocks with Spaces

```markdown
Input:  `code with  spaces`

Pattern: createInlinePattern('`', true)
         // allowSpaceAfterOpening = true

Output: <code>code with  spaces</code>

Reason: Code blocks preserve whitespace literally
```

### Example 5: Link Transformation

```markdown
Input:  [Click here](https://example.com)

Pattern: /\[([^\]]+)\]\(([^)]+)\)/g
         Capture groups: [1]=text, [2]=url

Output: <a href="https://example.com">Click here</a>
```

## Design Trade-offs

### Regex vs. Full Parser

**✅ Regex Approach** (current):
- Fast execution (single pass)
- Simple to understand and maintain
- Works for 99% of use cases
- Low memory overhead

**❌ Full Parser Alternative**:
- More theoretically correct
- Handles all edge cases
- Slower (multi-pass)
- Overkill for inline patterns

**Decision**: Use regex with carefully crafted patterns. Edge cases are rare and acceptable.

### Nesting Prevention Strategy

**✅ Prevent Single-Char Nesting**:
- Avoids ambiguous `*` usage
- Follows CommonMark spec
- Clear user expectations

**✅ Allow Double-Char Nesting**:
- `**_both_**` is intuitive
- Matches markdown conventions
- Different delimiters don't conflict

**Decision**: Use negative lookahead/lookbehind for single-char only.

### First-Match vs. Best-Match

**✅ First-Match** (current):
- Predictable behavior
- Faster (stops at first hit)
- Easier to reason about ordering

**❌ Best-Match Alternative**:
- Find all matches, choose "best"
- Complex scoring algorithm needed
- Slower, harder to debug

**Decision**: Order patterns by specificity (double-char before single-char).

### AST-Based Transformation vs. Direct DOM Manipulation

**✅ AST-Based** (current):
- Consistent with block transformations
- Handles complex nesting correctly
- Reuses markdown parsing logic
- Preserves semantic HTML

**❌ Direct DOM Manipulation Alternative**:
- Faster (no parse/serialize)
- More fragile (hard to handle nesting)
- Duplicate logic

**Decision**: Use AST conversion for correctness and consistency.

### Single Tilde for Strikethrough

**Decision**: Use single tilde (`~`) as the normalized delimiter for strikethrough/delete elements.

**Primary Benefit - Span Mirroring UX**:
Single backspace unwraps `<del>` cleanly via mirroring (both spans empty). With `~~`, deleting one `~` creates invalid `~text~~` - spans disconnect before mirroring completes, leaving 3 tildes for manual deletion.

**Implementation**:
- **Input**: Both `~text~` and `~~text~~` create `<del>` elements (gfm extension supports both)
- **Core/Serialization**: Always normalizes to single `~` via custom delete handler (ast-utils.ts:43-61)
- **Focus Marks**: Display single `~` when cursor enters `<del>` elements

**Trade-offs**:
- ✅ Better focus mark editing UX (1 manual deletion vs 3)
- ✅ Less visual clutter
- ⚠️ Deviates from official GFM spec (but GitHub-compatible)

**Related**: See [focusMarks-design.md](../focusMarks-design.md#decision-7-single-tilde-delimiter) for focus mark implications.

## Known Limitations

### 1. Overlapping Patterns

**Issue**: Cannot handle intentionally overlapping delimiters
```markdown
Input:  **bold*italic***
Output: <strong>bold*italic*</strong>  (both * are literal)
Expected by some: <strong>bold<em>italic</em></strong>
```

**Reason**: First-match wins, `**...**` pattern matches first.
**Acceptable**: Extremely rare edge case, unclear intent.

### 2. No Escape Sequences

**Issue**: Cannot escape delimiters
```markdown
Input:  \*not italic\*
Output: *not italic* (backslashes remain)
Expected: *not italic* (backslashes removed)
```

**Reason**: Not implemented, not needed for typical use.
**Acceptable**: Users can use code blocks for literal syntax.

### 3. Wiki Links in Code

**Issue**: `[[array]]` in code might be interpreted as wiki link
```markdown
Input:  `array[[0]]`
Output: May incorrectly match wiki link pattern
```

**Reason**: Pattern order, wiki links checked after code.
**Mitigation**: Code pattern is checked first, should work correctly.
**Acceptable**: Edge case, users can add spaces to disambiguate.

### 4. Performance with Very Long Text

**Issue**: Regex matching on large text blocks (10,000+ chars) can be slow

**Reason**: Backtracking in regex `.+?` with many patterns.
**Mitigation**: Block-level transformation limits scope.
**Acceptable**: Users rarely type 10k chars in a single paragraph.

## Testing Strategy

### Manual Testing

**Test Pattern Transformations**:
1. Type each pattern: `**bold**`, `*italic*`, `~strike~`, `` `code` ``
2. Verify immediate transformation to HTML
3. Check cursor position after transformation

**Test Nesting Prevention**:
1. Type: `**bo*ld***`
2. Verify output: `<strong>bo*ld*</strong>`
3. Confirm: Single `*` is NOT transformed to `<em>`

**Test History Integration**:
1. Type: `**incomplete pattern*`
2. Press Ctrl+Z
3. Verify: Undo returns to `**incomplete pattern*` (not empty)

**Test Cursor Position**:
1. Type: `Hello **world** text`
2. Verify cursor positions correctly after each transformation
3. Test typing immediately after transformed element

**Test Edge Cases**:
1. Empty delimiters: `****` (no content between)
2. Whitespace: `** text**` (space after opening delimiter)
3. Multi-line: Patterns should NOT span multiple paragraphs
4. Nested delimiters: `**_both_**`, `**bo*ld***`

### Automated Testing

**Unit Tests** (to be implemented):
```typescript
describe('Inline Patterns', () => {
  test('bold pattern matches correctly', () => {
    expect(findFirstMarkdownMatch('**text**')).toBeTruthy()
  })

  test('single * does not match inside **', () => {
    expect(patterns.italic.test('**bo*ld**')).toBeFalsy()
  })

  test('double-char nesting allowed', () => {
    const html = markdownToHtml('**_both_**')
    expect(html).toContain('<strong><em>both</em></strong>')
  })
})
```

### Integration Testing

**Test with History System**:
- Verify `onBeforeInput` breaks coalescing before delimiter completion
- Test undo/redo after inline transformations
- Verify cursor restoration after undo

**Test with Block Patterns**:
- Inline patterns should process AFTER block patterns
- Verify: `# **bold** heading` becomes `<h1><strong>bold</strong> heading</h1>`

**Test with Paste Operations**:
- Pasted markdown should transform inline patterns
- Verify cursor position after paste + transform

## Integration Points

### With History System

**Location**: `richEditorState.onBeforeInput()` (lines 209-230)

```typescript
private onBeforeInput = (e: InputEvent) => {
    const afterInsert = getCurrentText() + e.data

    if (endsWithValidDelimiter(afterInsert)) {
        // Break coalescing BEFORE delimiter completion
        this.history.breakCoalescing(this.editableRef)
    }
}
```

**Pattern**: Break-before-transform ensures incomplete patterns are undoable.

**Details**: See [history-design.md](history-design.md#3-break-before-delimiter-strategy) for the full break-before-delimiter strategy.

### With Block Patterns

**Location**: `richEditorState.onInput()` (lines 179-203)

**Order**: Block patterns checked first, inline patterns second:
```typescript
const hasBlockPattern = isBlockPattern(block.textContent)
const hasInlinePattern = findFirstMarkdownMatch(block?.textContent || '')

if (hasBlockPattern || hasInlinePattern) {
    // Transform via AST conversion
}
```

**Reason**: Block-level syntax has higher precedence than inline.

**Details**: See [block-patterns-design.md](block-patterns-design.md#1-block-first-detection) for block pattern priority explanation.

### With AST Conversion

**Flow**: Inline patterns trigger full markdown round-trip:

```
HTML → Markdown → MDAST → HAST → HTML (with formatting)
```

**Why**: Ensures consistent transformation logic, handles complex nesting correctly.

**Cursor Preservation**: Uses node path serialization from [dom-selection-design.md](dom-selection-design.md#1-node-paths-over-references) to restore cursor after transformation.

## Future Enhancements

- [ ] Add escape sequence support (`\*` for literal asterisk)
- [ ] Implement best-match algorithm for overlapping patterns (low priority)
- [ ] Performance optimization for very long paragraphs (10k+ chars)
- [ ] Add more extended syntax (footnotes, definition lists)
- [ ] Pattern-specific configuration (enable/disable individual patterns)
- [ ] Custom pattern registration API for plugins
