I want to develop a new feature for my editor.

---

## Implementation Status

### ✅ Completed & Working
- **FocusMarkManager class** - Detection, injection, and ejection logic fully implemented
- **Integration** into richEditorState.svelte.ts via onSelectionChange
- **CSS styling** for .pd-focus-mark spans (subtle gray #888, monospace, 0.9em, 70% opacity)
- **Type checking** passes with no errors
- **Tested successfully** via Chrome DevTools:
  - ✅ Inline marks (bold `**`, italic `*`) appear when cursor enters
  - ✅ Block marks (heading `#`) appear when cursor enters
  - ✅ Marks eject cleanly when cursor leaves
  - ✅ Nested formatting handled correctly (e.g., bold within heading)
  - ✅ Visual styling works as intended

### 🚧 Next Steps (TODOs)
1. **Implement span stripping in onInput** - Strip .pd-focus-mark spans before pattern detection and markdown conversion (lines 200-220 in richEditorState.svelte.ts)
   - This prevents marks from being treated as content during transformations
   - Required for proper "unwrap" behavior when user edits marks
2. **Test editing marks** - Verify changing `**` to `*` properly unwraps formatting
3. **Test with lists** - Verify list item marks (`-`, `1.`) work correctly
4. **Verify history behavior** - Ensure marks don't trigger unwanted history saves

---

## Design Evolution

### Abandoned Design #1: Pre-injected Hidden Spans
**Approach**: Inject `<span class="pd-mark">**</span>` during HTML generation, hide with `display: none`, show with CSS when focused.

**Why Rejected**:
- ❌ Pollutes DOM with thousands of spans (2 per formatted element)
- ❌ Interferes with block transformations and serialization
- ❌ Every `htmlBlockToMarkdown()` call must filter them out
- ❌ Wastes memory on spans that are never shown (99% hidden)
- ❌ Cursor can accidentally land inside hidden spans

### Abandoned Design #2: Data Attributes on Elements
**Approach**: Add `data-pd-mark="**,**"` during markdown→HTML transformation, use attributes to lookup delimiters.

**Why Reverted**:
- ❌ Cannot preserve original syntax (`**` vs `__`, `*` vs `_`)
- ❌ Both `**text**` and `__text__` become `<strong>` - lost delimiter info after HAST conversion
- ❌ Requires modifying transformation pipeline unnecessarily
- ❌ Created `mark-decorator.ts` file that was ultimately not needed

### ✅ Confirmed Design: Dynamic Injection with Reverse-Engineering
**Approach**: When cursor enters formatted element, convert element back to markdown to extract delimiters, then inject editable spans.

**Why This Works**:
- ✅ **Preserves original syntax** - `htmlToMarkdown(<strong>text</strong>)` returns actual delimiter used
- ✅ **Clean DOM 99% of time** - max 4 spans total (1 inline pair + 1 block pair)
- ✅ **No transformation changes** - works with existing pipeline
- ✅ **Performance acceptable** - converting 1 element per selection change (~0.1-0.5ms) is negligible
- ✅ **Editable marks** - user can modify `**` to unwrap formatting

---

This is the new feature:

```markdown

### ✨ feature: FocusMarks

1. observe current block for any caret/selection updates
2. detect presense in any _marked_ span of text.
   > Almost everything has marks in markdown syntax except normal text in P (verify this)
   > i.e. bold has \*\* marks, but is not visible in dom post transformation.
3. This feature would reinject them (and make them editable) when the caret is within the html tag bounds.
4. However, the elements would stay stylized (in their dom element) and would not _de-transform_;
   > unless the user deletes the delimiter(s).
5. The delimiters would de-inject again when the node loses caret focus
6. There can only be a maximum of 2 *FocusMarks* visible at a time; one for each type inline/block
  > if caret in a bold string, within a quote block; the bold \*\* marks and the quote \> chevron would be visible
  > There cannot be more than one delimeter type visible for each of block/inline. If wrapped in nested blocks/inlines, the closest parent's formatting marks will show for each type.

##### Examples

> - block elements like headers would also show their correct no. of #'s
> - codeblocks would show their ticks (inline \` or block \```)
>   todo: analyze the efficiency and feasability

#### Proposed approach
1. Have two state vars for each; one for the block, one for the inline.
2. Let `OnSelectionChange` handle setting them. 
  - **Inline**: right now the function correctly finds (all) inline parents (whom the caret is at the edge of) to exit them with marks. We simply need the closest parent element (regardless of where the caret is)
  - **Block**: the closest parent block can be identified by the existing `getMainParentBlock` in `/dom.ts`
3. inject delimeters before/around the identified/focused nodes with identifiable spans that can be ignored (so as to not trigger pattern matching)
4. eject the focusMarks (i.e. remove the spans) when focused inline/block element changes.

```

Give me the feasibility of this approach; if feasible provide the dev steps to have it complete, if not tell me why.

# Feasibility Analysis: FocusMarks

## Verdict: Feasible with High Complexity

This feature is **feasible** within your current architecture, but it introduces significant complexity regarding **cursor preservation** and **DOM stability**.

Your current architecture is well-suited for this because:
1.  **AST-First**: You already handle HTML $\leftrightarrow$ Markdown conversion robustly.
2.  **Centralized State**: `RichEditorState` has clear hooks for `onSelectionChange` and `onInput`.
3.  **Selection Utils**: You already have path-based selection serialization (`serializeSelection`), which is crucial here.

### Key Challenges & Solutions

1.  **Cursor Jumps**: When you inject `**` spans, the text offsets shift.
    *   *Solution*: You must snapshot the cursor relative to the *text content* before injection, and restore it relative to the *text node* (not the parent element) after injection.
2.  **History Pollution**: Every cursor movement could technically change the DOM (injecting spans).
    *   *Solution*: These mutations **must not** trigger the history stack. The history system should strip these "phantom" marks before saving, or the marks must be purely visual (though you requested them to be editable, implying they must be in the DOM).
3.  **Round-trip parsing**: If `<strong><span class="mark">**</span>text...</strong>` is passed to `htmlToMarkdown`, it might produce `******text...**`.
    *   *Solution*: The `FocusMark` spans must be treated as transparent during Markdown conversion, or the injection logic must place them *outside* the semantic tag (e.g., text node `**` before the `<strong>`). Placing them *inside* (as you suggested) is cleaner visually but requires careful handling during the `onInput` -> `markdown conversion` loop.

---

## Development Plan

### Phase 1: Infrastructure & Utils

Create a dedicated `FocusMarkManager` to avoid cluttering `RichEditorState`.

1.  **Define Mark Configuration**: Map tag names to their delimiters.
    ```typescript
    const MARK_DEFINITIONS = {
      STRONG: '**',
      EM: '*',
      CODE: '`',
      // Blocks
      H1: '# ',
      BLOCKQUOTE: '> '
      // ...
    }
    ```
2.  **Create "Phantom" DOM Utils**:
    *   `injectMarks(element, type)`: Wraps text in specific spans.
    *   `ejectMarks(element)`: Removes the spans and normalizes text nodes.
    *   **Crucial**: These spans need a class like `.posedown-mark` with `pointer-events: none;` (initially) or specific styling to look like metadata.

### Phase 2: Selection Observation Logic

Modify `RichEditorState` to use the manager.

1.  **Track State**:
    *   `currentFocusedInline: HTMLElement | null`
    *   `currentFocusedBlock: HTMLElement | null`
2.  **Hook `onSelectionChange`**:
    *   Compare `event.target` ancestor with `currentFocusedInline`.
    *   If different:
        1.  `ejectMarks(currentFocusedInline)`
        2.  `currentFocusedInline = newTarget`
        3.  `injectMarks(newTarget)`
        4.  **Restore Cursor**: The tricky part. You need to calculate where the cursor *should* be in the new structure.

### Phase 3: Block Handling (The `#` and `>`)

1.  **Headings**: Currently, you hide the `#` via `htmlBlockToMarkdown` but store it in `data-raw-md`.
    *   You will need to pull `data-raw-md`, extract the prefix, and insert it as a span at the start of the `H1-6`.
2.  **Lists**: This is the hardest part.
    *   `<li>` usually uses a CSS marker. To make it editable, you must hide the CSS marker (`list-style: none`) and inject a span `<span>- </span>` at the start of the `<li>`.

---

## Implementation Guide

Here is the code structure to implement this.

### 1. New File: `src/lib/core/utils/focus-marks.ts`

```typescript
import { isBlockTagName } from './block-marks'

export const FOCUS_MARK_CLASS = 'pd-focus-mark'

const INLINE_DELIMITERS: Record<string, string> = {
    STRONG: '**',
    EM: '*',
    CODE: '`',
    S: '~~',
    DEL: '~~',
    U: '__'
}

// Helper to check if node is already marked
const isMarked = (el: HTMLElement) => el.querySelector(`.${FOCUS_MARK_CLASS}`)

export class FocusMarkManager {
    private activeInline: HTMLElement | null = null
    private activeBlock: HTMLElement | null = null

    /**
     * Called on selection change. 
     * Manages the lifecycle of marks based on current selection.
     */
    update(selection: Selection, root: HTMLElement) {
        if (!selection.anchorNode) return

        // 1. Identify Targets
        const textNode = selection.anchorNode.nodeType === Node.TEXT_NODE 
            ? selection.anchorNode 
            : selection.anchorNode.childNodes[selection.anchorOffset]
            
        if (!textNode) return

        // Find closest inline parent
        let inlineParent: HTMLElement | null = null
        let curr: Node | null = textNode
        while (curr && curr !== root && !isBlockTagName(curr.nodeName as any)) {
            if (curr instanceof HTMLElement && INLINE_DELIMITERS[curr.tagName]) {
                inlineParent = curr
                break // Only closest parent as requested
            }
            curr = curr.parentNode
        }

        // Find closest block parent
        // (You can use your existing dom.ts helper here)
        // let blockParent = ... 

        // 2. Handle Transitions
        if (this.activeInline && this.activeInline !== inlineParent) {
            this.ejectInline(this.activeInline)
        }
        
        if (inlineParent && inlineParent !== this.activeInline) {
            // Save cursor position relative to text content before mutating
            const savedPos = this.saveRelativeCursor(selection, inlineParent)
            
            this.injectInline(inlineParent)
            
            // Restore cursor
            this.restoreRelativeCursor(selection, inlineParent, savedPos)
        }

        this.activeInline = inlineParent
        // Repeat logic for blocks...
    }

    private injectInline(el: HTMLElement) {
        if (isMarked(el)) return

        const delim = INLINE_DELIMITERS[el.tagName]
        if (!delim) return

        // Create spans
        const startSpan = this.createMarkSpan(delim)
        const endSpan = this.createMarkSpan(delim)

        // Prepend and Append
        el.prepend(startSpan)
        el.append(endSpan)
    }

    private ejectInline(el: HTMLElement) {
        if (!el.isConnected) return // Node might have been deleted

        const marks = el.querySelectorAll(`.${FOCUS_MARK_CLASS}`)
        marks.forEach(m => m.remove())
        
        // Normalize text nodes to prevent fragmentation
        el.normalize() 
    }

    private createMarkSpan(text: string) {
        const span = document.createElement('span')
        span.className = FOCUS_MARK_CLASS
        span.textContent = text
        span.style.color = '#888' // Or use CSS class
        span.dataset.ignoreParse = 'true' // Flag for parser if needed
        return span
    }

    // Complexity: Relative cursor calculation
    private saveRelativeCursor(selection: Selection, container: HTMLElement) {
        // Logic to calculate offset ignoring focus marks
        // Returns { nodeIndex, textOffset }
        // For simple cases, it's just the offset in the text node
        return { 
            offset: selection.anchorOffset, 
            node: selection.anchorNode 
        }
    }

    private restoreRelativeCursor(selection: Selection, container: HTMLElement, saved: any) {
        // After injection, the structure is: [SPAN] [TEXT] [SPAN]
        // If cursor was at 0 of TEXT, it should still be at 0 of TEXT
        // But TEXT is now childNodes[1]
        
        // Simplified restoration logic:
        const textNode = Array.from(container.childNodes).find(n => n.nodeType === Node.TEXT_NODE)
        if (textNode) {
            selection.collapse(textNode, Math.min(saved.offset, textNode.textContent?.length || 0))
        }
    }
}
```

### 2. Update `ast-utils.ts`

You need to ensure `htmlToMarkdown` handles these marks correctly. Since you want them editable, they should be treated as text during the conversion process so that if the user deletes a char, the AST sees the change.

However, `dompurify` might strip custom spans.

**Action**: Add the class or attributes to DOMPurify whitelist.

```typescript
// ast-utils.ts
const cleanHtml = DOMPurify.sanitize(html, {
    ADD_TAGS: ['span'],
    ADD_ATTR: ['class'] 
})
```

If the user *edits* the mark (e.g., changes `**` to `*`), `htmlToMarkdown` will parse `*text**`.
1.  Remark parses `*text**`.
2.  It's invalid bold syntax.
3.  It becomes plain text.
4.  The editor re-renders as plain text.
**This works as intended.**

### 3. CSS Updates (`RichEditor.svelte`)

Add styles for the marks to differentiate them.

```css
:global(.pd-focus-mark) {
    color: #a3a3a3;
    font-weight: normal;
    font-family: monospace;
    font-size: 0.9em;
}
```

### 4. Integration in `richEditorState.svelte.ts`

```typescript
// Initialize manager
private focusMarks = new FocusMarkManager()

// In onSelectionChange
private onSelectionChange = (e: Event) => {
    // ... existing code ...
    
    const selection = window.getSelection()
    if (selection && this.editableRef) {
        // This handles the injection/ejection
        this.focusMarks.update(selection, this.editableRef) 
    }
}

// In onInput
private onInput = (e: Event) => {
    // Critical: Before we parse HTML to Markdown, we must strip the marks?
    // Actually NO. If we strip them, we lose the edits if the user edited the marks.
    // We let them pass through to htmlToMarkdown.
    
    // ... existing code ...
}
```

## Special Note on Lists & Headers

For **Headers**, your `htmlBlockToMarkdown` currently relies on `data-raw-md`.
If you implement FocusMarks for headers:
1.  You inject `<span>## </span>` into the H2.
2.  User edits it to `###`.
3.  `onInput` fires.
4.  `htmlBlockToMarkdown` checks `data-raw-md`. It says `## ...`.
5.  **Conflict**: You need to update `htmlBlockToMarkdown` to prefer the *current text content* over `data-raw-md` if it detects a FocusMark span was present/edited, OR ensure `FocusMarkManager` updates `data-raw-md` on ejection.

**Recommendation**: For the MVP, stick to **Inline Elements** first. Block elements require changing your `data-raw-md` strategy.