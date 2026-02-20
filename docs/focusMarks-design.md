# FocusMarks - Design Documentation

**Last Updated:** 2026-02-20

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
    ├── onBeforeInput → handleBlockMarkEdges() (block delimiter edge typing)
    ├── onBeforeInput → handleInlineMarkEdges() (inline delimiter edge typing)
    ├── onBeforeInput → applyMarks() (marks escape - exit formatting)
    ├── onInput → onEdit() (unified inline + block span editing)
    ├── onSelectionChange → refocus() (show/hide marks)
    ├── onBlur → unfocus() (clear marks)
    └── Sets skipNextFocusMarks flag after transformations

FocusMarkManager (Core Implementation)
├── Public API:
│   ├── refocus() - Main entry on selection change (handles inline + block)
│   ├── onEdit() - Unified handler for inline + block span editing (called on onInput)
│   ├── handleInlineMarkEdges() - Handle delimiter typing at inline mark span edges
│   ├── handleBlockMarkEdges() - Handle delimiter typing at block mark span edges
│   ├── unfocus() - Clear all marks
│   ├── unwrapAndReparseInline() - Unwrap active inline element and reparse
│   └── unwrapAndReparseBlock() - Unwrap active block element and reparse
│
├── State:
│   ├── activeInline/activeBlock - Currently focused elements
│   ├── inlineSpanRefs - Injected inline span references (array)
│   ├── blockSpanRefs - Injected block span references (array)
│   ├── activeInlineDelimiter - Current inline delimiter for mirroring
│   ├── activeBlockDelimiter - Current block delimiter for mirroring
│   └── skipNextFocusMarks - Suppress marks after transformations (inline only)
│
└── Internal Methods:
    ├── checkAndMirrorSpans(selection) - Detect modifications; mirror edits OR flatten invalid spans to text
    ├── hasAdjacentDelimiterChar() - Detect stray half-delimiter chars adjacent to active element
    ├── handleNestedPatterns() - Process patterns typed inside active elements
    ├── onInlineBreakingEdits() - Handle breaking delimiter edits (reparses whole parent block)
    ├── handleFocusedInline() - Orchestrate inline edit: mirror → reparse
    ├── handleFocusedBlock() - Orchestrate block edit: validate → flatten or reparse
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
└── wouldFormValidBlockDelimiter() - Validate block delimiter upgrade

Inline Patterns (inline-patterns.ts)
├── findFirstMdMatch() - CommonMark/mdast-based match (canonical, use this)
├── findFirstMarkdownMatch() - ⚠️ Deprecated regex-based match (being phased out)
└── SUPPORTED_INLINE_DELIMITERS - Set of valid delimiter strings

Block Patterns (block-patterns.ts)
└── isSupportedBlockDelimiter() - Validate block delimiter strings

DOM Utilities
├── dom.ts - Tag lists, tree walking, type guards
├── dom/util.ts - reparse(), getDomRangeFromContentOffsets(), getFirstTextNode()
├── dom/smartReplaceChildren.ts - Smart DOM reconciliation with AUTO caret restoration
└── selection.ts - setCaretAt() (supports element nodes), setCaretAtEnd()
```

### Data Flows

#### 1. Mark Lifecycle (Navigation & Display)
```
User moves cursor
  → onSelectionChange() → focusMarkManager.refocus()
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
  → onInput() → onEdit() → handleFocusedInline()
  → checkAndMirrorSpans() detects modification:
     - Valid delimiter → mirrors to paired span → unwrapAndReparseInline()
     - Invalid delimiter → flattens span to text node (inline, no reparse)
  → Result: <em> if valid, plain text if invalid

Edge delimiter (type * at |*italic*|):
  → onBeforeInput() → handleInlineMarkEdges()
  → Insert into delimiter span → handleFocusedInline() → mirror → transform
  → Result: *italic* → **bold**

Breaking delimiter (type * in *ita|lic*):
  → onInlineBreakingEdits() detects matchWhole.text !== activeInline.textContent
  → Gets spanless clone of parent block → reparse() whole block
  → smartReplaceChildren(parentBlock, ...) — whole block replaced
  → Result: <em>ita</em>lic* (first pattern wins)
```

#### 3. Block Editing (Heading Levels)
```
User types # inside "# " delimiter span
  → onInput() → onEdit() → handleFocusedBlock()
  → Detects modification in blockSpanRefs
  → Validates new delimiter (## ):
     - Valid → unwrapAndReparseBlock() → preserves spans in new element
     - Invalid (e.g. delete all #) → flattens to <p>, refocuses
  → Result: H1 → H2 transformation (or H1 → <p>)
```

#### 4. Caret Management (Auto-Restoration)
```
smartReplaceChildren() intelligently handles caret:
  → Preserves text offset before DOM replacement
  → Checks if activeInline.isConnected:
     - Disconnected (edit case): restore caret to offset
     - Connected (navigation): skip correction
  → No manual correction in focus-mark-manager needed

injectInlineMarks() corrects to end:
  → Calculates clean cursor offset before injecting spans
  → If offset === element.textContent.length (at end): setCaretAtEnd()
  → Always applied (skipCaretCorrection parameter removed)
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

**Undo/Redo Resilience:** `injectInlineMarks()` and `injectBlockMarks()` handle DOM restoration
- If spans exist in element AND delimiter matches current: reassign `spanRefs` and `activeDelimiter` from them
- If spans exist but delimiter is stale (left by `onInlineBreakingEdits`): remove them and reinject fresh
- Required because undo/redo restores previous DOM (including spans) but leaves refs stale

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
1. Block edge delimiter typing (`handleBlockMarkEdges`)
2. Inline edge delimiter typing (`handleInlineMarkEdges`)
3. Marks escape (`applyMarks`)
4. History coalescing

**Edge Delimiter Typing:** Intercept delimiter input at edge of focus mark spans
- Type `*` at edge of `*italic*` → upgrades to `**bold**`
- `wouldFormValidDelimiter()` validates before transformation
- Separate handlers for inline (`handleInlineMarkEdges`) and block (`handleBlockMarkEdges`)

**Breaking Delimiters:** Typing delimiter inside element breaks pattern and rematches
- Example: `*italic*` + type `*` in middle → `*ita*lic*` → `<em>ita</em>lic*`
- `onInlineBreakingEdits()` reparses the whole **parent block** (not just the inline element)
- First pattern wins (markdown semantics)

**Pattern Detection:** `findFirstMdMatch()` (CommonMark/mdast) is canonical
- `findFirstMarkdownMatch()` (regex) is deprecated — still used at focus-mark-manager sites 4 & 5 pending migration
- See `findFirstMdMatch-regression-tracker.md` for known regressions and fix strategy

### 5. Block Marks Editing

**Separate Architecture:** Block edits affect DOM structure (element type), not just content
- `handleFocusedBlock()` detects edits in `blockSpanRefs`
- Valid delimiter → `unwrapAndReparseBlock()` preserves and transplants block spans into new element
- Invalid delimiter (e.g. delete all `#`) → flattens directly to `<p>` without reparse
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
- `skipCaretCorrection` parameter removed from `injectInlineMarks` — always corrects when at end

**Stray Delimiter Cleanup:** `hasAdjacentDelimiterChar()` + `unwrapAndReparseInline()`
- Detects when active inline element has a sibling text node starting/ending with its own delimiter char
- Symptom: intermediate parsing produces `*<em>word</em>` when typing `**word**`
- On reparse: strips exactly one delimiter char from each adjacent sibling before reparsing
- Prevents ghost delimiters after bold/italic upgrades via edge typing

**Invalid Span Flattening:** `checkAndMirrorSpans()` now handles invalid edits inline
- Previously returned a status flag; caller would then reparse
- Now: if edit is not mirrorable, flattens span to text node directly with caret preservation
- Keeps the happy path (mirror + reparse) for valid delimiter edits

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

**Trailing BR Stripping:** `htmlToMarkdown()` removes trailing `<br>` tags before AST conversion
- Chrome inserts trailing `<br>` after new block patterns; without removal this serializes as `\` in markdown
- `removeTrailingBr()` in `ast-utils.ts` strips them recursively before `toMdast()`

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
- [focus-mark-manager.ts](../src/lib/core/utils/focus-mark-manager.ts) - Core orchestration logic (~864 lines)
- [focus/utils.ts](../src/lib/core/focus/utils.ts) - Extracted pure utilities (224 lines)
- [inline-patterns.ts](../src/lib/core/utils/inline-patterns.ts) - `findFirstMdMatch()` (canonical) + deprecated `findFirstMarkdownMatch()`
- [block-patterns.ts](../src/lib/core/utils/block-patterns.ts) - Block delimiter validation (50 lines)
- [dom/util.ts](../src/lib/core/dom/util.ts) - DOM utilities (reparse, cursor positioning)
- [smartReplaceChildren.ts](../src/lib/core/dom/smartReplaceChildren.ts) - Smart reconciliation with auto caret restoration
- [selection.ts](../src/lib/core/utils/selection.ts) - `setCaretAt()` (supports element nodes), `setCaretAtEnd()`
- [block-transformation.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/block-transformation.spec.ts) - Block type conversions (756 lines)
- [inline-mirroring.spec.ts](../../tests/e2e/focus-marks/delimiter-editing/inline-mirroring.spec.ts) - Inline mirroring/editing (364 lines)
- [TEST-INDEX.md](../../tests/e2e/focus-marks/TEST-INDEX.md) - Test organization by behavior categories
- [findFirstMdMatch-regression-tracker.md](./issues/findFirstMdMatch-regression-tracker.md) - Migration regressions + fix strategy
