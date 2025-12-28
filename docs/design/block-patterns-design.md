# Block Pattern & List System

> Transforming markdown block syntax (headings, lists, blockquotes, etc.) into semantic HTML elements

## Overview

The block pattern system detects and transforms block-level markdown syntax as users type. Unlike inline patterns which operate within text, block patterns determine the semantic structure of paragraphs, headings, lists, and other block elements.

### Architecture Flow

```
User Types: ## Heading<Space>
     ↓
onInput Event
     ↓
isBlockPattern(text)
     ↓
Pattern Detected: heading
     ↓
Convert block to Markdown
     ↓
Parse to MDAST → HAST → HTML
     ↓
Replace <p> with <h2>
     ↓
Save data-raw-md="## Heading"
     ↓
Restore cursor + save history
```

### Key Components

- **Pattern Definitions**: `src/lib/rich/utils/block-patterns.ts` - Regex patterns for block syntax
- **Block Utilities**: `src/lib/rich/utils/block-marks.ts` - Block tag identification, height preservation
- **List Handlers**: `src/lib/rich/utils/list-handler.ts` - Enter/Backspace behavior in lists
- **Detection Logic**: `richEditorState.onInput()` - Scans for patterns before inline patterns
- **History Integration**: "Before and After" pattern for structural changes

### Related Documentation

- **[history-design.md](history-design.md)** - Undo/redo system, "Before and After" pattern for block operations
- **[inline-patterns-design.md](inline-patterns-design.md)** - Inline formatting, detection order
- **[dom-selection-design.md](dom-selection-design.md)** - Block boundary detection, cursor restoration

## Core Principles

### 1. Block-First Detection

Block patterns are checked BEFORE inline patterns to ensure structural transformations take precedence.

**Order** (`richEditorState.onInput()` lines 180-183):
```typescript
const hasBlockPattern = isBlockPattern(block.textContent)
const hasInlinePattern = findFirstMarkdownMatch(block?.textContent || '')

if (hasBlockPattern || hasInlinePattern) {
    // Transform...
}
```

**Why**: Block syntax like `# **bold** heading` should become `<h1><strong>bold</strong> heading</h1>`, not `<p># <strong>bold</strong> heading</p>`.

### 2. Metadata Preservation

Original markdown syntax is stored in the `data-raw-md` attribute for headings.

**Implementation** (`block-marks.ts` headingHandler lines 27-40):
```typescript
export const headingHandler: Handler = (state, node) => {
    const result = defaultHandlers.heading(state, node)
    const rawMd = stringifyMdastToMarkdown(node).trim()

    result.properties = {
        ...result.properties,
        dataRawMd: rawMd
    }
    return result
}
```

**Why**: Preserves user's choice of `#` vs `##` syntax when editing, allows lossless conversion back to markdown.

**Example**:
```html
<h2 data-raw-md="## My Heading">My Heading</h2>
```

### 3. Height Preservation

Empty block elements must contain a `<br>` tag to maintain height in contenteditable.

**Function**: `ensureBlockHeight(element)` (block-marks.ts lines 46-65)

**Why**: Without `<br>`, empty blocks collapse to zero height, making them uneditable.

**Example**:
```html
<!-- Before -->
<p></p>              <!-- Height: 0, unclickable -->

<!-- After -->
<p><br></p>          <!-- Height: 1 line, editable -->
```

### 4. List Special Handling

Lists delegate Enter and Backspace behavior to specialized handlers in `list-handler.ts`.

**Integration Points**:
- Enter key: `handleEnterKey()` → `handleEnterInListItem()` (dom.ts line 223)
- Backspace key: `handleBackspaceKey()` → `handleBackspaceInListItem()` (dom.ts line 277)

**Why**: List interaction is complex (create item, exit list, split list) and warrants dedicated logic.

## Implementation Details

### Pattern Definitions

**Location**: `src/lib/rich/utils/block-patterns.ts`

**All patterns test against line start** (`^` anchor):

```typescript
export const blockPatterns = {
    // ATX Headings: # to ######
    heading: /^#{1,6} /,

    // Unordered lists: -, *, +
    unorderedList: /^[-*+] /,

    // Ordered lists: 1., 2., etc.
    orderedList: /^\d+\. /,

    // Task lists: - [ ], - [x]
    taskList: /^[-*+] \[([ xX])\] /,

    // Blockquotes: >
    blockquote: /^> /,

    // Code blocks: ```
    codeBlock: /^```/,

    // Horizontal rules: ---, ___
    horizontalRule: /^(---+|(_\s*){3,})$/,

    // Tables: | header |
    table: /^\|(.+\|)+/,
}
```

### Block Tag Names

**Location**: `block-marks.ts` lines 8-24

**Recognized block elements**:
```typescript
export const BLOCK_TAG_NAMES = [
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI'
] as const
```

**Utility**: `isBlockTagName(tagName)` - Type guard for block elements

### List Behavior

**Location**: `src/lib/rich/utils/list-handler.ts`

#### Enter Key in List Items

**Function**: `handleEnterInListItem(selection, listItem)` (lines 58-130)

**Behavior**:

| Context | Action |
|---------|--------|
| Empty list item (end of list) | Exit list → Create `<p>` after list |
| Empty list item (middle of list) | Exit list → Split list, insert `<p>` between |
| Non-empty list item | Create new `<li>` after current |

**Example - Exit from Middle**:
```html
<!-- Before: Empty item in middle -->
<ul>
  <li>Item 1</li>
  <li>|</li>  <!-- Cursor here, empty -->
  <li>Item 2</li>
</ul>

<!-- After: Press Enter -->
<ul>
  <li>Item 1</li>
</ul>
<p>|</p>  <!-- Cursor here -->
<ul>
  <li>Item 2</li>
</ul>
```

#### Backspace Key in Empty List Items

**Function**: `handleBackspaceInListItem(selection, listItem)` (lines 15-47)

**Behavior**:

| Context | Action |
|---------|--------|
| Empty list item | Convert to `<p>` → Remove `<li>` → Remove `<ul>`/`<ol>` if empty |
| Non-empty list item | Return false (default backspace behavior) |

**Example**:
```html
<!-- Before -->
<ul>
  <li>Item 1</li>
  <li>|</li>  <!-- Empty, cursor here -->
</ul>

<!-- After: Press Backspace -->
<ul>
  <li>Item 1</li>
</ul>
<p>|</p>  <!-- Converted to paragraph -->
```

### Detection Flow

**Location**: `richEditorState.svelte.ts` onInput handler (lines 179-203)

```typescript
private onInput = (e: InputEvent) => {
    const block = getMainParentBlock(selection.anchorNode, this.editableRef)

    // Check block pattern FIRST
    const hasBlockPattern = isBlockPattern(block.textContent)
    const hasInlinePattern = findFirstMarkdownMatch(block?.textContent || '')

    if (hasBlockPattern || hasInlinePattern) {
        // Break history before transformation
        this.history.breakCoalescing(this.editableRef)

        // Convert HTML → MD → AST → HTML
        const contentInMd = htmlBlockToMarkdown(block)
        const { fragment } = markdownToDomFragment(contentInMd)

        // Replace and restore cursor
        smartReplaceChildren(block, fragment)

        // Ensure empty blocks have <br>
        ensureBlockHeight(fragment)

        // Save history after transformation
        this.history.push(this.editableRef)
    } else {
        // Regular typing
        this.history.pushCoalesced(this.editableRef)
    }
}
```

### Helper Functions

**`isBlockPattern(content)`** (block-patterns.ts lines 42-44):
- Tests if content matches ANY block pattern
- Returns boolean
- Used for quick detection before transformation

**`extractPatternPrefix(content)`** (block-patterns.ts lines 82-90):
- Extracts the markdown prefix (e.g., `"# "`, `"- "`, `"1. "`)
- Returns string or null
- Useful for debugging and pattern analysis

**`ensureBlockHeight(element)`** (block-marks.ts lines 46-65):
- Recursively adds `<br>` to empty block elements
- Special handling for `<pre><code>` (BR inside CODE)
- Critical for contenteditable usability

## Pattern Examples

### Example 1: Heading Creation

```
State 1: <p>## My Heading|</p>
User types: <Space>
         ↓
         isBlockPattern("## My Heading ") → true
         ↓
State 2: History breaks (before transformation)
         Convert to MD: "## My Heading "
         Parse to AST → HAST → HTML
         ↓
State 3: <h2 data-raw-md="## My Heading">My Heading|</h2>
         History saves (after transformation)
```

### Example 2: List Creation

```
State 1: <p>- First item|</p>
User types: <Space>
         ↓
         isBlockPattern("- First item ") → true
         ↓
State 2: <ul><li>First item|</li></ul>
         ↓
User presses: Enter
         ↓
State 3: <ul>
           <li>First item</li>
           <li>|</li>
         </ul>
```

### Example 3: List Exit (Empty Item at End)

```
State 1: <ul>
           <li>Item 1</li>
           <li>|</li>  <!-- Empty, cursor here -->
         </ul>

User presses: Enter
         ↓
         handleEnterInListItem() detects empty item
         isEmpty = true, itemsAfter.length === 0
         ↓
State 2: <ul>
           <li>Item 1</li>
         </ul>
         <p>|</p>  <!-- Exited to paragraph -->
```

### Example 4: List Exit (Empty Item in Middle)

```
State 1: <ul>
           <li>Item 1</li>
           <li>|</li>  <!-- Empty, cursor here -->
           <li>Item 2</li>
         </ul>

User presses: Enter
         ↓
         handleEnterInListItem() detects empty item in middle
         isEmpty = true, itemsAfter.length > 0
         → Split list
         ↓
State 2: <ul>
           <li>Item 1</li>
         </ul>
         <p>|</p>  <!-- Paragraph between -->
         <ul>
           <li>Item 2</li>
         </ul>
```

### Example 5: Task List

```
State 1: <p>- [x] Done task|</p>
User types: <Space>
         ↓
         isBlockPattern("- [x] Done task ") → true
         Pattern: taskList
         ↓
State 2: <ul>
           <li><input type="checkbox" checked> Done task|</li>
         </ul>
```

### Example 6: Blockquote

```
State 1: <p>> Quote text|</p>
User types: <Space>
         ↓
         isBlockPattern("> Quote text ") → true
         ↓
State 2: <blockquote>
           <p>Quote text|</p>
         </blockquote>
```

## Design Trade-offs

### Raw Markdown Storage in data-raw-md

**✅ Store** (current):
- Preserves exact user syntax preference (`#` vs `##` vs `###`)
- Enables lossless markdown round-trip
- Useful for debugging and analysis

**❌ Don't Store**:
- Simpler HTML structure
- Slightly less memory usage
- Lose original markdown formatting

**Decision**: Store for headings, provides better editing experience.

**Limitation**: Only headings have `data-raw-md`, other blocks infer syntax from tag type.

### List Splitting on Exit

**✅ Split List** (current):
- Clean semantic HTML (no paragraphs inside lists)
- Follows HTML5 spec
- Better for screen readers and SEO

**❌ Keep Single List**:
- Simpler DOM structure
- Fewer elements to manage
- Invalid HTML (paragraph inside `<ul>`)

**Decision**: Split for correctness and accessibility.

### History "Before and After" Pattern

**✅ Before + After** (current):
- Clean undo boundaries
- Block creation is independently undoable
- Consistent with inline pattern transformations

**❌ After Only**:
- Fewer history entries
- Can't undo block creation separately
- Confusing UX (undo removes content + structure together)

**Decision**: Use before + after for all structural changes (Enter, Backspace in lists).

**Implementation**: See [history-design.md](history-design.md#5-block-operations-pattern) for details.

### Block-First vs. Inline-First Detection

**✅ Block-First** (current):
- Structural transformations take precedence
- Matches markdown semantics (block determines paragraph type)
- Prevents ambiguous cases

**❌ Inline-First**:
- Heading syntax `#` might be treated as inline text first
- Wrong nesting: `<p># <strong>heading</strong></p>`

**Decision**: Always check block patterns before inline patterns.

## Known Limitations

### 1. Nested Lists Not Implemented

**Issue**: Cannot create nested lists via Tab/Shift+Tab

**Current**:
```markdown
- Item 1
- Item 2  <!-- Can't indent to create nested list -->
```

**Expected** (deferred):
```markdown
- Item 1
  - Nested item  <!-- Requires Tab key handler -->
```

**Reason**: Deferred to future release, complex interaction with selection/cursor.

### 2. Code Block Syntax Highlighting

**Issue**: Typed code blocks don't have syntax highlighting

**Current**:
```markdown
```js
function() {}
```
→ <pre><code>function() {}</code></pre>
```

**Expected**: Highlighting added on paste only (via PrismJS or similar).

**Reason**: Syntax highlighting requires language detection and parser integration.

### 3. Tables Only via Paste

**Issue**: Cannot type table syntax to create tables

**Current**: Table pattern detected but not transformed during typing.

**Workaround**: Paste markdown tables from external source.

**Reason**: Complex table editing UI requires dedicated component, deferred.

### 4. No Nested Blockquotes

**Issue**: Cannot create blockquotes within blockquotes

**Current**:
```markdown
> Level 1
> > Level 2  <!-- Not supported -->
```

**Reason**: Rarely used, adds complexity, deferred.

## Testing Strategy

### Manual Testing

**Test Block Transformations**:
1. Type each pattern: `# heading`, `## heading`, `- list`, `1. ordered`, `> quote`
2. Verify immediate transformation to semantic HTML
3. Check cursor position after transformation
4. Verify `data-raw-md` attribute on headings

**Test List Enter Behavior**:
1. Create list: `- Item 1<Space>`
2. Press Enter → New `<li>` created
3. Press Enter again (empty item) → Exit to `<p>`
4. Verify cursor position after exit

**Test List Exit with Split**:
1. Create list: `- Item 1<Enter>- Item 2<Enter>- Item 3`
2. Move to Item 2, delete all text
3. Press Enter (exit from middle)
4. Verify: List split into two with `<p>` between

**Test List Backspace**:
1. Create list: `- Item 1<Enter>`
2. Press Backspace in empty item
3. Verify: Converted to `<p>`, list removed if empty

**Test History Integration**:
1. Type: `## incomplete heading` (no space)
2. Press space → Transform to `<h2>`
3. Press Ctrl+Z → Should undo transformation
4. Press Ctrl+Z again → Should remove typing

**Test Height Preservation**:
1. Create heading: `# Title<Enter>`
2. Verify: Empty paragraph has `<br>` tag
3. Delete all heading text
4. Verify: Empty `<h1>` has `<br>` tag

### Integration Testing

**Test with Inline Patterns**:
1. Type: `# **bold** heading<Space>`
2. Verify: `<h1><strong>bold</strong> heading</h1>`
3. Confirm: Both block and inline patterns applied

**Test with History System**:
1. Create list with multiple items
2. Press Enter in empty item (exit list)
3. Press Ctrl+Z → Should restore list item
4. Press Ctrl+Z again → Should remove list item

**Test with Paste Operations**:
1. Paste markdown with mixed blocks and inline syntax
2. Verify: All patterns transformed correctly
3. Check cursor position after paste

### Automated Testing

**Unit Tests** (to be implemented):
```typescript
describe('Block Patterns', () => {
  test('heading pattern matches', () => {
    expect(isBlockPattern('# Heading')).toBe(true)
    expect(isBlockPattern('## Heading')).toBe(true)
  })

  test('list pattern matches', () => {
    expect(isBlockPattern('- item')).toBe(true)
    expect(isBlockPattern('1. item')).toBe(true)
  })

  test('task list pattern matches', () => {
    expect(isBlockPattern('- [ ] todo')).toBe(true)
    expect(isBlockPattern('- [x] done')).toBe(true)
  })
})
```

## Integration Points

### With Inline Pattern System

**Order**: Block patterns checked first, inline patterns second.

**Example Flow**:
```typescript
// richEditorState.onInput()
const hasBlockPattern = isBlockPattern(text)    // Check first
const hasInlinePattern = findFirstMarkdown(text) // Check second

if (hasBlockPattern || hasInlinePattern) {
    // Both processed in same AST transformation
}
```

**Result**: Heading with inline formatting:
```markdown
## **Bold** Heading
→ <h2 data-raw-md="## **Bold** Heading"><strong>Bold</strong> Heading</h2>
```

**Details**: See [inline-patterns-design.md](inline-patterns-design.md#with-block-patterns) for inline pattern detection order.

### With History System

**Pattern**: "Before and After" for structural changes.

**Implementation**:
1. **Before Enter/Backspace**: `history.breakCoalescing()` (richEditorState.ts lines 256, 269)
2. **Execute**: `handleEnterKey()` or `handleBackspaceKey()`
3. **After**: `history.push()` (richEditorState.ts lines 260, 273)

**Why**: Makes block creation/deletion independently undoable.

**Details**: See [history-design.md](history-design.md#5-block-operations-pattern).

### With DOM & Selection System

**Cursor Preservation**:
- Block transformations use `smartReplaceChildren()` to preserve cursor
- Selection serialized as node paths (survives DOM restructuring)
- After transformation: `restoreSelection()` based on paths

**Block Boundary Detection**:
- `getMainParentBlock()` finds enclosing block for transformations
- Used to determine transformation scope

**Details**: See [dom-selection-design.md](dom-selection-design.md).

## Future Enhancements

- [ ] Nested lists via Tab/Shift+Tab indentation
- [ ] Code block syntax highlighting during typing (not just paste)
- [ ] Table creation and editing UI
- [ ] Nested blockquotes support
- [ ] Definition lists (`term\n: definition`)
- [ ] Footnotes (`[^1]` references)
- [ ] Custom block pattern registration API
- [ ] Block-level templates (e.g., callouts, admonitions)
