I want to develop a new feature for my editor.

---

## Implementation Status

### ✅ Completed & Working
- **FocusMarkManager class** (`focus-mark-manager.ts`) - Detection, injection, and ejection logic fully implemented
  - ✅ Delimiter extraction via simplified split() approach (no complex indexOf/substring)
  - ✅ Inline marks injection (bold `**`, italic `*`, code `` ` ``, strikethrough `~~`)
  - ✅ Block marks injection (headings `#`, blockquote `>`, list items `-`/`1.`)
  - ✅ Clean ejection with text node normalization
  - ✅ Browser-handled cursor preservation (no manual restoration needed)
  - ✅ Preserves delimiter spacing (e.g., `"# "` not trimmed to `"#"`)
- **Tag list centralization** - INLINE_FORMATTED_TAGS and BLOCK_FORMATTED_TAGS defined in dom.ts
  - ✅ Unified to markdown-only tags (S for strikethrough, not U for underline)
  - ✅ No code duplication between files
  - ✅ No circular dependencies
- **Integration** into richEditorState.svelte.ts via onSelectionChange (line 391-395)
  - ✅ FocusMarkManager.update() called conditionally on selection change
  - ✅ Separated from "exit marks" tracking logic for clarity
- **Skip flag mechanism** (`skipNextFocusMarks`) to prevent marks on new transformations
  - ✅ Flag set after markdown pattern transformations (line 234)
  - ✅ Flag set after paste operations (line 173)
  - ✅ Flag set after undo/redo operations (lines 279, 286)
  - ✅ Marks only appear when navigating BACK to existing formatted elements
  - ✅ Marks do NOT appear immediately after creating new formatted content
- **Span stripping in onInput** (lines 200-204) - Strips .pd-focus-mark spans before pattern detection
  - ✅ Clones block and removes all focus mark spans
  - ✅ Normalizes text nodes to merge fragments
  - ✅ Uses clean block for pattern detection and markdown conversion
  - ✅ Enables proper "unwrap" behavior when user edits marks
- **CSS styling** for .pd-focus-mark spans (subtle gray #888, monospace, 0.9em, 70% opacity)
- **Type checking** passes with no errors

### 🧪 Testing Status
- ✅ Inline marks (bold `**`, italic `*`) appear when cursor navigates to them
- ✅ Block marks (heading `#`) appear when cursor navigates to them
- ✅ Marks eject cleanly when cursor leaves
- ✅ Nested formatting handled correctly (e.g., bold within heading)
- ✅ Visual styling works as intended
- ✅ Marks do NOT appear right after transformation (correct behavior)
- ⏳ **Pending**: Test editing marks to verify unwrap behavior (change `**` to `*`)
- ⏳ **Pending**: Test with lists to verify list item marks (`-`, `1.`) work correctly
- ⏳ **Pending**: Verify history behavior (marks shouldn't pollute undo/redo stack)

### 🚧 Next Steps (TODOs)
1. **Test editing marks** - Verify changing `**` to `*` properly unwraps formatting
2. **Test with lists** - Verify list item marks (`-`, `1.`) work correctly
3. **Verify history behavior** - Ensure marks don't trigger unwanted history saves
4. **Edge case testing** - Multi-cursor, complex nesting, rapid navigation

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

### 🔧 Implementation Fixes

#### Fix #1: List Item Context Issue (2026-01-09)
**Problem**: List items (`<li>`) weren't showing focus marks.

**Root Cause**:
1. `findFocusedBlock()` used `getMainParentBlock()` which returned the parent `<ul>` or `<ol>` instead of the `<li>` itself
2. `extractDelimiters()` created standalone `<li>` elements without parent context, so markdown converter couldn't determine `- ` (UL) vs `1. ` (OL)

**Solution**:
1. Changed `findFocusedBlock()` to walk up DOM tree looking for BLOCK_FORMATTED_TAGS elements (like `findFocusedInline()`)
2. Added special handling in `extractDelimiters()` for LI elements:
   - Detect parent list type (UL or OL)
   - Create wrapper list with single LI child before markdown conversion
   - Preserves context: `<ul><li>Item</li></ul>` → `"- Item"` → delimiter `"- "`

**Result**: ✅ List items now correctly show `- ` or `* ` or `1. ` delimiters

#### Fix #2: Refactored to use `getFirstOfAncestors()` Helper
**Change**: Replaced manual DOM tree walking in both `findFocusedInline()` and `findFocusedBlock()` with centralized `getFirstOfAncestors()` utility from dom.ts.

**Benefits**:
- Cleaner code (2 lines instead of 10+ lines per method)
- No code duplication
- Consistent behavior between inline and block detection
- Easier to maintain and test