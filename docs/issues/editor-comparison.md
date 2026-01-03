# Rich Editor Architecture Comparison: Custom vs Edra/Tiptap

> **Created:** 2024-11-03

## Executive Summary

This document compares our custom markdown-first editor implementation with Edra, a popular Svelte-based rich text editor built on Tiptap/ProseMirror.

**Recommendation:** Continue with custom markdown-first approach for this project's requirements.

---

## 1. What is Edra?

Edra is a rich text editor component built specifically for Svelte developers, sitting on top of Tiptap (which wraps ProseMirror). It provides a batteries-included WYSIWYG editing experience with markdown support as a secondary feature.

**Key Stats:**
- ~490 GitHub stars
- 36 releases, actively maintained
- MIT licensed
- Copy-paste component (not npm package)
- Based on shadcn/svelte or headless

---

## 2. Philosophical Differences

### Edra/Tiptap: WYSIWYG-First

```
Markdown Input (optional)
    ↓
Tiptap Parser
    ↓
ProseMirror JSON Schema (SOURCE OF TRUTH)
    ↓
WYSIWYG Renderer
    ↓
Can export to: Markdown, HTML, JSON
```

**Key Characteristics:**
- ProseMirror schema is canonical
- Markdown is input/output format only
- Schema validation strips unsupported syntax
- Optimized for Google Docs-like editing

### Our Approach: Markdown-First

```
Markdown Input (SOURCE OF TRUTH)
    ↓
Remark Parser
    ↓
MDAST Tree (with hierarchical IDs)
    ↓
Remark-Rehype Bridge
    ↓
HAST Tree
    ↓
HTML Output for contenteditable
    ↓
Lazy Sync: DOM → Markdown
```

**Key Characteristics:**
- Markdown is canonical format
- Trees are representations of markdown
- Lossless round-tripping
- Custom syntax easily supported
- Optimized for markdown-fluent users

---

## 3. Tech Stack Comparison

| Component | Edra/Tiptap | Our Implementation |
|-----------|-------------|-------------------|
| **Editor Engine** | Tiptap v2.11.5 | Custom contenteditable |
| **Parser** | Tiptap extensions + tiptap-markdown | Remark v11 |
| **Markdown Support** | tiptap-markdown (lossy) | remark-parse/stringify (lossless) |
| **HTML Bridge** | Built into Tiptap | remark-rehype, rehype-stringify |
| **AST Format** | ProseMirror JSON | MDAST + HAST |
| **Syntax Highlighting** | Lowlight (built-in) | None (add via remark plugin) |
| **UI Framework** | Bits UI + Tailwind | Tailwind only |
| **Math Support** | KaTeX (built-in) | None (add via remark plugin) |
| **Bundle Size** | ~100+ KB | ~30 KB |
| **State Management** | ProseMirror state | Svelte 5 runes |

---

## 4. Markdown Fidelity

### Edra/Tiptap: Lossy Conversion

**Problem:** ProseMirror uses a strict schema. Any markdown syntax not in the schema is **stripped during conversion**.

**Example:**
```markdown
Input:  This is ==highlighted== text with ~~custom~~ syntax

Tiptap processes through schema...

Output: This is highlighted text with custom syntax
```

Custom syntax like `==highlight==` or any non-standard markdown is lost because it doesn't match ProseMirror's schema.

**Impact:**
- Cannot preserve custom markdown extensions
- Can't round-trip arbitrary markdown
- Limited to schema-defined syntax

### Our Approach: Lossless

**Advantage:** MDAST preserves **all** markdown syntax, including custom extensions.

**Example:**
```markdown
Input:  This is ==highlighted== text with ~~custom~~ syntax

Remark parses to MDAST (preserves everything)...
Add remark plugin for custom syntax...

Output: Exactly the same, byte-for-byte
```

**Impact:**
- Full markdown preservation
- Custom syntax via remark plugins
- Perfect round-tripping
- Markdown remains source of truth

---

## 5. Feature Comparison

### Edra Out-of-the-Box Features

✅ Rich formatting (bold, italic, underline, strikethrough, colors)
✅ Block elements (headings, paragraphs, blockquotes, lists, task lists)
✅ Code blocks with syntax highlighting (Lowlight)
✅ Tables with cell manipulation
✅ Media (images, video, audio with resize/alignment)
✅ Search & replace
✅ Drag-and-drop nodes
✅ Slash commands
✅ Math/LaTeX support (KaTeX)
✅ Emoji support
✅ Bubble menus and floating toolbar
✅ Collaboration features (via ProseMirror)
✅ Two UI implementations (headless + shadcn-based)

### Our Implementation

**Current:**
- ✅ Markdown ↔ HTML conversion
- ✅ DOM observation system
- ✅ Hierarchical ID mapping
- ✅ Lazy sync mechanism
- ✅ Lossless round-tripping
- ✅ Custom syntax support

**To Add (as needed):**
- ⏳ Syntax highlighting (via remark plugin)
- ⏳ Tables (via remark plugin)
- ⏳ Math (via remark plugin)
- ⏳ Formatting UI
- ⏳ Undo/redo
- ⏳ Collaboration (custom implementation)

---

## 6. Architecture Deep Dive

### Edra's ProseMirror State Model

```typescript
// Editor maintains internal state
const editor = new Editor({
  extensions: [StarterKit, Markdown],
  content: markdown
})

// All edits update ProseMirror state
editor.commands.setBold()

// Export to markdown
editor.storage.markdown.getMarkdown()
```

**Characteristics:**
- Single source of truth (ProseMirror state)
- Immediate state updates
- Schema validation on every change
- Rich plugin ecosystem
- Complex state management

### Our Observer-Based Lazy Sync

```typescript
// Markdown is source of truth
const state = new RichEditorState(markdown)

// DOM runs freely
contenteditable.innerHTML = state.html

// Observer tracks changes
MutationObserver watches DOM

// Lazy sync (debounced or on-demand)
state.syncToTrees() // DOM → Markdown → Rebuild trees
```

**Characteristics:**
- Markdown is source of truth
- DOM has freedom to edit
- No constant re-parsing
- Sync only when needed
- Simple state management

---

## 7. Performance Comparison

### Edra/Tiptap

**Pros:**
- Optimized ProseMirror engine
- Efficient state updates
- Battle-tested performance

**Cons:**
- Heavy initial bundle (~100+ KB)
- Schema validation overhead
- Complex plugin coordination

### Our Approach

**Pros:**
- Lightweight bundle (~30 KB)
- No overhead during typing (lazy sync)
- Simple pipeline (unified)

**Cons:**
- Sync operation cost (HTML → Markdown)
- Need to tune debounce timing
- Must handle contenteditable quirks

---

## 8. Extensibility

### Edra/Tiptap Plugins

```typescript
import { Extension } from '@tiptap/core'

const CustomExtension = Extension.create({
  name: 'custom',
  addCommands() {
    return {
      setCustom: () => ({ commands }) => {
        // Custom behavior
      }
    }
  }
})
```

**Characteristics:**
- Rich plugin API
- Hundreds of community extensions
- Must fit ProseMirror schema
- Complex for deep customization

### Our Remark Plugins

```typescript
import { visit } from 'unist-util-visit'

const remarkCustomSyntax: Plugin = () => (tree) => {
  visit(tree, 'text', (node) => {
    // Transform markdown AST
    // Full control over structure
  })
}
```

**Characteristics:**
- Simple plugin system
- Direct AST manipulation
- No schema constraints
- Easier to understand

---

## 9. Use Case Suitability

### When to Choose Edra/Tiptap

✅ **WYSIWYG experience** is primary goal
✅ Need **collaboration** features out-of-box
✅ Want **rich features** immediately (tables, math, syntax highlighting)
✅ Users prefer **Google Docs-like** editing
✅ Markdown is an **export format**, not source
✅ Team has **ProseMirror expertise**
✅ Don't need custom markdown syntax

### When to Choose Our Approach

✅ **Markdown is source of truth**
✅ Need **custom markdown syntax**
✅ Want **lossless preservation**
✅ Users are **markdown-fluent**
✅ Need **lightweight** implementation
✅ Want **full control** over editor behavior
✅ Building **content-first** workflow
✅ Avoid ProseMirror complexity

---

## 10. Tradeoffs Summary

### Edra/Tiptap

**Strengths:**
- Feature-complete immediately
- Battle-tested reliability
- Rich plugin ecosystem
- Collaboration support
- Professional UI/UX
- Undo/redo built-in
- Selection handling solved

**Weaknesses:**
- Not markdown-first
- Lossy conversion
- Heavy bundle size
- Schema constraints
- ProseMirror complexity
- Opinionated structure

### Our Custom Approach

**Strengths:**
- True markdown-first
- Lossless round-tripping
- Custom syntax support
- Lightweight bundle
- Full architectural control
- Simple to understand
- Composable (unified ecosystem)

**Weaknesses:**
- Must build features ourselves
- Need DOM→Markdown sync
- Contenteditable quirks
- Collaboration not built-in
- Undo/redo to implement
- Selection handling complexity

---

## 11. Our Unique Advantages

### Hierarchical ID System

Our custom ID system (`0.1.2.3`) enables:

```typescript
// Direct node lookup (O(n) where n = depth)
const hastNode = tree.getHastNodeById('0.1.2')

// DOM mapping via data-token-id
<p data-token-id="0.1">
  <strong data-token-id="0.1.0">text</strong>
</p>

// Precise change tracking
const changedNode = findByDataTokenId(mutatedElement)
```

**Benefits:**
- Faster than full tree traversal
- Enables precise DOM↔Tree mapping
- Better change tracking than Tiptap
- Supports lazy sync model

**Tiptap doesn't have this** - it relies on ProseMirror positions (character offsets), which are less intuitive for markdown-native workflows.

---

## 12. Lazy Sync Strategy

### Our Implementation

```typescript
// 1. DOM edits freely (no overhead)
contenteditable.innerHTML = "<p>User types here...</p>"

// 2. Observer detects changes
MutationObserver → onTextChange()

// 3. Mark dirty + debounce
isDirty = true
setTimeout(syncToTrees, 500ms)

// 4. Sync when needed
onBlur() → syncToTrees()
beforeSave() → getCurrentMarkdown() → syncToTrees()
```

**Performance:**
- Zero overhead during typing
- Sync only 2x: after typing stops + before save
- Can adjust debounce based on performance

**Tiptap:**
- Every keystroke updates ProseMirror state
- Schema validation on each change
- More overhead, but immediate consistency

---

## 13. Markdown Preservation Examples

### Custom Syntax Example

**Input Markdown:**
```markdown
This is ==highlighted== text with ^^superscript^^ and custom [[wiki-links]].
```

**Edra/Tiptap Result:**
```markdown
This is highlighted text with superscript and custom wiki-links.
```
❌ Custom syntax lost (not in schema)

**Our Approach Result:**
```markdown
This is ==highlighted== text with ^^superscript^^ and custom [[wiki-links]].
```
✅ Perfect preservation (with appropriate remark plugins)

---

## 14. Bundle Size Impact

### Edra/Tiptap Dependencies

```
@tiptap/core: ~45 KB
@tiptap/starter-kit: ~30 KB
@tiptap/extension-markdown: ~15 KB
tiptap-markdown: ~10 KB
lowlight: ~200 KB (syntax highlighting)
katex: ~300 KB (math)
+ UI components: ~50 KB

Total: ~650 KB (minified, not gzipped)
```

### Our Dependencies

```
unified: ~5 KB
remark-parse: ~10 KB
remark-stringify: ~8 KB
remark-rehype: ~5 KB
rehype-stringify: ~3 KB
rehype-parse: ~5 KB
rehype-remark: ~5 KB

Total: ~41 KB (minified, not gzipped)
```

**15x smaller** before features. Even with added remark plugins, likely stays under 100 KB.

---

## 15. Real-World Tradeoffs

### Scenario: Adding Tables Support

**Edra/Tiptap:**
```typescript
import { Table } from '@tiptap/extension-table'
editor.use(Table) // ✅ Done!
```

**Our Approach:**
```typescript
import remarkGfm from 'remark-gfm'
processor.use(remarkGfm) // ✅ Markdown tables supported
// ❌ But: Need to build table UI for editing
```

**Reality:** Edra wins for feature velocity, we win for markdown fidelity.

---

## 16. Collaboration Considerations

### Edra/Tiptap

Built on ProseMirror, which has **excellent collaboration support**:
- Operational Transform (OT) built-in
- Y.js integration for CRDT
- Cursor tracking
- Conflict resolution

**Effort to add:** Low (use existing solutions)

### Our Approach

No built-in collaboration:
- Would need custom OT/CRDT implementation
- Markdown-based diff/merge
- Custom cursor tracking

**Effort to add:** High (significant engineering)

**Decision:** If collaboration is critical short-term → consider Tiptap. If it's long-term, our architecture can support it later.

---

## 17. Developer Experience

### Edra/Tiptap

**Learning Curve:** Moderate
- Must understand ProseMirror concepts (schema, state, transforms)
- Rich documentation
- Large community

**Debugging:**
- ProseMirror DevTools available
- Complex state to inspect
- Schema validation errors

### Our Approach

**Learning Curve:** Moderate
- Must understand unified/remark/rehype ecosystem
- Good documentation
- Smaller community (but active)

**Debugging:**
- Inspect MDAST/HAST trees directly
- Simpler pipeline
- Console logging sufficient

---

## 18. Testing Strategy

### Edra/Tiptap

```typescript
it('should make text bold', () => {
  const editor = new Editor({ content: 'text' })
  editor.commands.setBold()
  expect(editor.getHTML()).toBe('<strong>text</strong>')
})
```

**Characteristics:**
- Test commands
- Test state transitions
- Test HTML output

### Our Approach

```typescript
it('should round-trip markdown', () => {
  const tree = new RichEditorPipeline(markdown)
  const html = tree.toHtml()
  const result = RichEditorPipeline.htmlToMarkdown(html)
  expect(result).toBe(markdown)
})
```

**Characteristics:**
- Test transformations
- Test round-tripping
- Test markdown fidelity

---

## 19. Migration Path

### From Our Approach → Tiptap (if needed)

**Effort:** Moderate
- Markdown is preserved
- Can import markdown into Tiptap
- Lose hierarchical ID system
- Rebuild UI

**Risk:** Low (markdown is portable)

### From Tiptap → Our Approach

**Effort:** High
- Export markdown from Tiptap
- Rebuild editor state
- Implement custom features

**Risk:** Moderate (may lose some formatting)

---

## 20. Final Recommendation

### For This Project: Continue Custom Approach

**Reasons:**

1. **Markdown is non-negotiable** - It's your source format
2. **Custom syntax needed** - Blog might need extensions
3. **Lightweight priority** - Bundle size matters
4. **Already invested** - Hierarchical ID system is valuable
5. **Learning opportunity** - Understanding unified ecosystem is useful
6. **Flexibility** - Can add Tiptap later if requirements change

### Consider Edra/Tiptap If:

- Requirements change to prioritize WYSIWYG
- Collaboration becomes critical near-term
- Team lacks time to build features
- Users request Google Docs-like experience

---

## 21. Hybrid Approach Consideration

**Could we use both?**

Theoretically yes:
```
Markdown (source) → MDAST → Tiptap schema → Edit → MDAST → Markdown
```

**Reality:** This adds complexity without clear benefits. Better to commit to one approach.

---

## 22. Conclusion

Our custom markdown-first architecture is the right choice for a content-focused, markdown-native workflow. While Edra offers faster feature delivery, it fundamentally treats markdown as a secondary format, which contradicts our requirements.

**Key Advantages We Keep:**
- ✅ Lossless markdown preservation
- ✅ Custom syntax support
- ✅ Lightweight bundle
- ✅ Full architectural control
- ✅ Hierarchical ID system for precise tracking

**Path Forward:**
1. Complete lazy sync implementation ✅
2. Add features incrementally via remark plugins
3. Build minimal UI for markdown-centric editing
4. Monitor user feedback
5. Re-evaluate if requirements shift to WYSIWYG-first

The markdown-first approach aligns with our content strategy and provides a solid foundation for future enhancements.

---

## References

- Edra Repository: https://github.com/Tsuzat/Edra
- Tiptap Documentation: https://tiptap.dev/
- ProseMirror: https://prosemirror.net/
- Unified/Remark: https://unifiedjs.com/
- MDAST Specification: https://github.com/syntax-tree/mdast
- HAST Specification: https://github.com/syntax-tree/hast
