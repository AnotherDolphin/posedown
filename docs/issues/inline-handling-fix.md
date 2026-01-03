# Inline Transformation & Caret Restoration

> **Created:** 2024-12-25

## Problem
Initial marker-based approach (using `\uE000`) interfered with markdown pattern recognition. The marker wasn't being stripped—its presence prevented patterns from being detected.

## Final Solution: Two-Part Design

### 1. Inline Transformation Design
**Function:** `smartReplaceChildren` (src/lib/rich/utils/dom.ts:440-520)

**Approach:**
- Compares old DOM nodes with new fragment nodes using `isEqualNode()`
- Preserves unchanged nodes (avoids unnecessary DOM churn)
- Only replaces nodes that differ
- Minimizes re-rendering and maintains node references where possible

**Flow:**
1. User types markdown pattern (e.g., `**bold**`)
2. Block serialized to markdown via `htmlBlockToMarkdown`
3. Markdown parsed back to DOM via `markdownToDomFragment`
4. `smartReplaceChildren` diffs old vs new nodes
5. Unchanged nodes preserved, changed nodes replaced

### 2. Caret Position Fix
**Problem:** When a text node splits during transformation (e.g., `"hello world bold"` → `Text("hello world ") + <strong>bold</strong>`), caret offset becomes invalid because it was measured against the original single node.

**Solution:** Offset accumulation across node boundaries (src/lib/rich/utils/dom.ts:498-512)

**How it works:**
- Captures original caret offset before transformation
- As new nodes are processed, subtracts each node's text length from the offset
- When offset falls within a node's bounds, places caret there
- Fallback: if offset exceeds all nodes, place at end of last node

**Example:**
```
Before: "hello world bold|" (offset 17)
After:  [Text("hello world ", len=12), <strong>bold</strong> (len=4)]

Processing:
- Node 1: offset 17 > 12? Yes → offset = 17 - 12 = 5, continue
- Node 2: offset 5 > 4? Yes → offset = 5 - 4 = 1, continue
- Fallback: Place at end of last node ✓
```

## Deferred Approach: Adjacent Node Tracking

**Proposed but not implemented:** 4-level fallback strategy using adjacent node references.

**Why deferred:**
- Current offset accumulation solution handles text node splits correctly
- Adjacent tracking adds complexity without clear benefit for current use cases
- Can be added later if more precise positioning is needed

**If implemented, would provide:**
1. Caret at end of preserved beforeNode (if it exists)
2. Caret at start of preserved afterNode (if beforeNode gone)
3. Caret at end of newly created node (if both destroyed)
4. Fallback to end of block

## Critical Files
- **richEditorState.svelte.ts** (lines 180-201) - onInput handler that triggers transformations
- **utils/dom.ts** (lines 440-520) - smartReplaceChildren with offset tracking
- **utils/selection.ts** - setCaretAtEnd helper

## Test Coverage
- **rich-editor-inline-patterns.spec.ts** - Pattern transformation correctness
- **rich-editor-caret-position.spec.ts** - Caret position after transformations (14 tests)
