# FocusMarks - Design Documentation

**Last Updated:** 2026-02-09

> **For current implementation status and test results**, see [focusMarks-status.md](./issues/focusMarks-status.md)

---

**HOW TO UPDATE THIS DOCUMENT:**
This is an **architecture and design reference**, not a changelog. Document the current system state only.
- Update architecture sections when implementations change (new classes, APIs, data flows)
- Keep descriptions current with actual code behavior
- Remove outdated design decisions when superseded
- For status updates, bug fixes, and history → use [focusMarks-status.md](./issues/focusMarks-status.md)
- For issue tracking and temporal context → use [focusmark-notes.md](./issues/focusmark-notes.md)

---

## Overview

FocusMarks temporarily reveals markdown syntax delimiters when the cursor enters formatted elements.

**Core Behavior:**
- Cursor enters formatted element → delimiters appear
- Cursor leaves → delimiters disappear
- Delimiters are editable → user can modify to change formatting

**Examples:**
- `<strong>bold</strong>` → shows `**bold**`
- `<em>italic</em>` → shows `*italic*`
- `<h2>heading</h2>` → shows `## heading`
- Edit `**` to `*` → transforms bold → italic
- Edit `#` to `##` → transforms H1 → H2 (block editing)

## Architecture

See [focus-mark-manager.ts](../src/lib/core/utils/focus-mark-manager.ts) and [richEditorState.svelte.ts](../src/lib/svelte/richEditorState.svelte.ts)

### Component Structure

```
richEditorState.svelte.ts (Integration Layer)
└── Delegates to FocusMarkManager via:
    ├── onBeforeInput → tryHandleEdgeInput() (edge delimiter typing)
    ├── onBeforeInput → applyMarks() (marks escape - exit formatting)
    ├── onInput → handleActiveInline() (inline span editing, nested patterns)
    ├── onInput → handleActiveBlock() (block span editing, heading upgrades/downgrades)
    ├── onSelectionChange → update() (show/hide marks)
    ├── onBlur → unfocus() (clear marks)
    └── Sets skipNextFocusMarks flag after transformations

FocusMarkManager (Core Implementation)
├── Public API:
│   ├── update() - Main entry on selection change (handles inline + block)
│   ├── handleActiveInline() - Orchestrates inline span editing
│   ├── handleActiveBlock() - Orchestrates block span editing (NEW)
│   ├── tryHandleEdgeInput() - Handle delimiter typing at focus mark edges
│   ├── unfocus() - Clear all marks
│   └── unwrapAndReparse() - Convert element to markdown and reparse (separate inline/block)
│
├── State:
│   ├── activeInline/activeBlock - Currently focused elements
│   ├── inlineSpanRefs - Injected inline span references (array)
│   ├── blockSpanRefs - Injected block span references (array, NEW)
│   ├── activeInlineDelimiter - Current inline delimiter for mirroring
│   ├── activeBlockDelimiter - Current block delimiter for mirroring (NEW)
│   └── skipNextFocusMarks - Suppress marks after transformations (inline only)
│
└── Internal Methods:
    ├── checkAndMirrorSpans() - Detect modifications, mirror edits, track invalid changes
    ├── handleNestedPatterns() - Process patterns inside active elements
    ├── handleBreakingDelimiters() - Handle delimiter typed in middle
    ├── handleInvalidSpanChanges() - Handle edits that invalidate the pattern
    ├── findFocusedInline/Block() - Find focused elements (with edge detection)
    ├── injectInlineMarks/injectBlockMarks() - Mark lifecycle
    └── ejectMarks() - Remove marks from any element

Focus Utilities (Extracted helpers in focus/utils.ts)
├── extractInlineMarks() - Reverse-engineer inline delimiters (**, *, etc.)
├── extractBlockMarks() - Reverse-engineer block delimiters (#, ##, >, etc.)
├── createMarkSpan(text, isBlock?) - Create styled delimiter span (adds BLOCK_FOCUS_MARK_CLASS if isBlock=true)
├── atEdgeOfFormatted() - Check if cursor at edge with formatted sibling
├── getSpanlessClone() - Clone element without focus mark spans
├── wouldFormValidDelimiter() - Validate inline delimiter upgrade
└── wouldFormValidBlockDelimiter() - Validate block delimiter upgrade (NEW)

Block Patterns (block-patterns.ts)
└── isSupportedBlockDelimiter() - Validate block delimiter strings

DOM Utilities
├── dom.ts - Tag lists, tree walking, type guards
├── dom/util.ts - reparse(), getDomRangeFromContentOffsets(), getFirstTextNode()
├── dom/smartReplaceChildren.ts - Smart DOM reconciliation with AUTO caret restoration
└── selection.ts - setCaretAt() (now supports element nodes), setCaretAtEnd()
```

### Data Flows

#### 1. Mark Lifecycle (Navigation & Display)
```
User moves cursor
  → onSelectionChange() → focusMarkManager.update()
  → findFocusedInline() + findFocusedBlock()
  → Compare with activeInline/activeBlock
  → ejectMarks(old) + injectMarks(new) if changed
  → Block marks: only ejected if block element changes (preserves state during inline transforms)

User types **bold**
  → Pattern detection creates <strong>
  → Set skipNextFocusMarks = true
  → onSelectionChange() skips mark injection
  → Marks don't appear until user exits and re-enters
```

#### 2. Inline Editing (Delimiters, Mirroring, Transformations)
```
Standard editing (change ** to *):
  → onInput() → handleActiveInline()
  → checkAndMirrorSpans() detects & mirrors to paired span
  → unwrapAndReparse() → markdown → parse → new element
  → Result: <em> if valid, plain text if invalid

Edge delimiter (type * at |*italic*|):
  → onBeforeInput() → tryHandleEdgeInput()
  → Insert into delimiter span → mirror → transform
  → Result: *italic* → **bold**

Breaking delimiter (type * in *ita|lic*):
  → handleBreakingDelimiters() detects pattern break
  → unwrapAndReparse() → *ita* matches first
  → Result: <em>ita</em>lic*
```

#### 3. Block Editing (Heading Levels)
```
User types # inside "# " delimiter span
  → onInput() → handleActiveBlock()
  → Detects modification in blockSpanRefs
  → Validates new delimiter (## )
  → unwrapBlockAndReparse() + buildBlockFragmentWithReplacement()
  → smartReplaceChildren() with auto caret restoration
  → Result: H1 → H2 transformation
```

#### 4. Caret Management (Auto-Restoration)
```
smartReplaceChildren() intelligently handles caret:
  → Preserves text offset before DOM replacement
  → Checks if activeInline.isConnected:
     - Disconnected (edit case): restore caret to offset
     - Connected (navigation): skip correction
  → No manual correction in focus-mark-manager needed
```

## Design Decisions

### 1. Mark Injection & Lifecycle

**Dynamic Injection:** Marks injected on-demand via `onSelectionChange`, not pre-baked into DOM
- Clean DOM 99% of time (max 6 spans: 4 inline + 2 block)
- No serialization interference, ~0.2-0.4ms overhead
- `skipNextFocusMarks` flag prevents marks after pattern creation (reappear on re-entry)

**Delimiter Extraction:** Reverse-engineer via `htmlToMarkdown(element) → split(textContent)`
- Normalizes syntax: `__bold__` and `**bold**` both show as `**`
- Simple, leverages existing infrastructure

**Span Stripping:** `getSpanlessClone()` removes `.pd-focus-mark` spans before pattern detection
- Prevents interference with markdown parsing

**CSS Classes:** Focus mark spans use dual classification
- All marks: `.pd-focus-mark` (base styling, selection in getSpanlessClone)
- Block marks only: `.pd-focus-mark-block` (additional class for preservation during inline transforms)
- Separate class prevents `findAndTransform()` from stripping block marks during inline pattern detection

### 2. UX Principles

**Editable Marks:** Delimiters inherit `contentEditable`, user can modify/delete them
- Markdown-first philosophy: edit `**` → `*` changes bold to italic
- `checkAndMirrorSpans()` detects edits, mirrors to paired span, triggers `unwrapAndReparse()`

**Show Closest Only:** Maximum two active marks (one inline + one block)
- Reduces clutter, matches mental model
- Example: `<blockquote><em><strong>text</strong></em></blockquote>` shows `**` and `>`, not `*`

**Single Tilde:** Normalize `<del>` to `~text~` (not `~~text~~`)
- Better editing: single backspace unwraps cleanly
- Trade-off: Deviates from GFM spec (but GitHub-compatible)

### 3. Caret Positioning

**Text Offset Mapping:** `getDomRangeFromContentOffsets()` traverses DOM depth-first, accumulates character count
- Used in `smartReplaceChildren()` and `unwrapAndReparse()`
- Handles arbitrary nesting and element nodes

### 4. Input Handling Consolidation

**onBeforeInput Priority:** All text input in one handler with clear precedence
1. Edge delimiter typing (`tryHandleEdgeInput`)
2. Marks escape (`applyMarks`)
3. History coalescing

**Edge Delimiter Typing:** Intercept delimiter input at edge of focus mark spans
- Type `*` at edge of `*italic*` → upgrades to `**bold**`
- `wouldFormValidDelimiter()` validates before transformation

**Breaking Delimiters:** Typing delimiter inside element breaks pattern and rematches
- Example: `*italic*` + type `*` in middle → `*ita*lic*` → `<em>ita</em>lic*`
- First pattern wins (markdown semantics)

### 5. Block Marks Editing

**Separate Architecture:** Block edits affect DOM structure (element type), not just content
- `handleActiveBlock()` detects edits in `blockSpanRefs`
- `unwrapBlockAndReparse()` + `buildBlockFragmentWithReplacement()` create new block element
- Single prefix delimiter (no paired closing)
- Different validation: heading levels (1-6), blockquote/list prefixes

**Status:**
- ✅ Headings (H1-H6): Full upgrade/downgrade
- 🚧 Blockquotes: Display works, editing shows on separate line
- 🚧 Lists: Display works, needs UX redesign

### 6. Architecture Improvements (2026-02)

**Utility Extraction:** Pure functions moved to `focus/utils.ts` for better modularity
- Delimiter extraction, span creation, edge detection, validation
- Separation of concerns: stateful manager vs. pure functions
- Easier testing and maintenance

**SmartReplace Auto Caret Restoration:** Eliminated fragile manual correction
- Old: `setCaretAtEnd` hack, relied on stale selection state, asymmetric
- New: `smartReplaceChildren` auto-restores based on text offset
- `skipCaretCorrection` inferred from DOM (`activeInline.isConnected`), not selection
- More robust, simpler, single source of truth

## Technical Details

### Tag Lists

Defined in [dom.ts](../src/lib/core/utils/dom.ts):

```typescript
INLINE_FORMATTED_TAGS = ['STRONG', 'EM', 'CODE', 'S', 'DEL']
BLOCK_FORMATTED_TAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI']
```

### Special Handling

**List Items:** `<li>` needs parent context for delimiter (`<ul>` → `-`, `<ol>` → `1.`)
- Create temporary wrapper with parent list type before markdown conversion

**Performance:**
- ~0.2-0.4ms per selection change
- ~1 KB peak memory (max 6 spans: 4 inline + 2 block)
- Early returns if unchanged, `isConnected` checks

## Known Limitations

**Architectural constraints (by design):**

1. **Block mark editing partial** - Headings work fully, blockquotes/lists need fixes
   - Block edits affect DOM structure, not just content
2. **List depth not shown** - Would require tree walking, unclear user need
3. **Ordered lists show "1."** - Matches markdown convention (auto-numbering)
4. **Multi-line code blocks** - Unclear UX for multi-line marks
5. **Single cursor only** - Browser limitation (multi-cursor needs arrays)

## Integration Points

See implementations:
- [richEditorState.svelte.ts](../src/lib/svelte/richEditorState.svelte.ts) - Integration layer
- [focus-mark-manager.ts](../src/lib/core/utils/focus-mark-manager.ts) - Core orchestration logic (~800 lines)
- [focus/utils.ts](../src/lib/core/focus/utils.ts) - **NEW** Extracted pure utilities (224 lines)
- [block-patterns.ts](../src/lib/core/utils/block-patterns.ts) - **NEW** Block delimiter validation (50 lines)
- [dom/util.ts](../src/lib/core/dom/util.ts) - DOM utilities (reparse, cursor positioning)
- [smartReplaceChildren.ts](../src/lib/core/dom/smartReplaceChildren.ts) - **Enhanced** Smart reconciliation with auto caret restoration
- [selection.ts](../src/lib/core/utils/selection.ts) - **Enhanced** setCaretAt now supports element nodes
- [block-transformation.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/block-transformation.spec.ts) - Block type conversions (756 lines)
- [TEST-INDEX.md](../../tests/e2e/focus-marks/TEST-INDEX.md) - Test organization by behavior categories
