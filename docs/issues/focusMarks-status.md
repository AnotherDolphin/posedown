# FocusMarks Feature - Current Status

**Last Updated:** 2026-01-20
**Session Focus:** Merged PR #1 with bug fixes, test refactoring, and caret handling improvements

---

## Executive Summary

FocusMarks is **partially functional** with the core inline features working and several critical bugs fixed. Recent improvements have addressed major issues, but some edge cases remain.

**Recent Fixes (2026-01-20 - PR #1):**
- ✅ **Issue #67 FIXED**: Delete before focus marks now correctly deletes only one mark instead of all marks
- ✅ **Space input FIXED**: Space now works correctly in formatted text
- ✅ **Code organization**: `smartReplaceChildren` refactored into dedicated module with enhanced utilities
- ✅ **Test suite**: Reorganized 721-line test file into 9 focused categories (80 tests total, 53 passing)
- ✅ **Improved caret handling**: Unified offsetToCaret logic for consistent caret tracking

**What's Working:**
- ✅ Basic inline mark injection/ejection (bold, italic, code, etc.)
- ✅ Span mirroring (editing opening span syncs to closing span)
- ✅ Real-time unwrapping and transformation
- ✅ Skip marks on newly typed formatted elements
- ✅ Edge detection for cursor adjacent to formatted elements
- ✅ issue#34 - Activates focusMarks when cursor directly before/after formatted elements in adjacent nodes
- ✅ **Delete/backspace before focus marks (issue #67)**

**What's Partially Working:**
- ⏳ Cursor positioning after span edits (improved, but edge cases remain)
- ⏳ Edge detection (implemented but unreliable in some scenarios)

**What's Broken:**
- ❌ Issue #10: Breaking delimiters (typing delimiter in middle of formatted text) - tests exist but many failing
- ❌ Some backspace/delete edge cases still inconsistent

**What's Not Implemented:**
- ⚠️ Block mark editing (headings, blockquotes, lists)
- ⚠️ List item focus behavior (should focus end, not span)
- ⚠️ Hide default LI HTML markers when markdown marks shown

---

## Architecture Changes Since Design Doc

### 1. Moved Span Editing to `onInput` (Temporary Development Strategy)

**Original Design (from design doc):**
- MutationObserver in FocusMarkManager detects span changes
- Observer calls `handleSpanEdit()` when mutations occur

**Current Implementation (Development):**
- Span editing handled **directly in `richEditorState.svelte.ts` onInput handler**
- FocusMarkManager's MutationObserver exists but is **commented out/disabled**
- Detection logic checks if cursor is inside `activeInline` or spans modified/disconnected

**Why Changed:**
> "observing the activeInline/activeBlock for childList changes fires after onInput, which is too late because spans must mirror before onInput works on the changed content"

MutationObserver fires **after** `onInput`, so mirroring happened too late. The browser's native `onInput` event is the earliest hook.

**Future Refactoring:**
Once behavior is stable and cursor positioning is fixed, this logic will be refactored back into `focus-mark-manager.ts` to maintain clean architecture and encapsulation.

**Location:** `richEditorState.svelte.ts` lines 197-261

**Current Flow:**
```typescript
onInput() fires
  ↓
Check if activeInline contains cursor OR spans modified/disconnected
  ↓ (yes)
1. Remove disconnected spans
2. Mirror edited span to its pair (if valid delimiter)
3. Convert activeInline to markdown (includes span contents)
4. Transform markdown back to HTML (fragment)
5. Find formatted element in fragment (if any)
6. Replace activeInline with fragment
7. Clear activeInline, spanRefs
8. Pattern detection continues below (NOT early return)
```

### 2. Added Edge Detection in `findFocusedInline()`

**Original Design:**
- Only detected when cursor was **inside** a formatted element
- Used `getFirstOfAncestors()` to walk up parent chain

**Current Implementation:**
- Also detects when cursor is **adjacent** to formatted elements
- Checks text node boundaries (offset 0 or end)
- Checks element node children (before/after cursor index)

**Location:** `focus-mark-manager.ts` lines 116-188

**Scenarios Handled:**
```typescript
// Case A: Text node edges
text|<em>word</em>     // cursor at end of text → checks nextSibling
<em>word</em>|text     // cursor at start of text → checks previousSibling

// Case B: Element-level cursor (e.g., after deletion in nested formats)
<p>|<em>word</em></p>  // anchorNode = P, offset = 0 → checks childNodes[0]
<p><em>word</em>|</p>  // anchorNode = P, offset = 1 → checks childNodes[0] (before cursor)
```

**Why Added:**
Addresses issue: "focusMarks must show if editing spans causes re-render but caret ends up just before/after them"

When deleting delimiters in nested formats (e.g., `__*word*__`), cursor often lands at P element level, not inside remaining formatted element.

### 3. Fixed issue#34: Adjacent Node Detection

**What Changed:**
`findFocusedInline()` now prioritizes formatted elements directly before/after cursor in adjacent nodes, even when cursor is inside a parent formatted element.

**Why:**
Improves precision - shows marks for the element closest to cursor position rather than always showing parent element marks.

### 4. Removed `forceShowMarksOnElement` Flag (Attempted)

**Attempted Solution:**
- Added `forceShowMarksOnElement` property to FocusMarkManager
- Set in `richEditorState.svelte.ts` after transformation
- Checked in `update()` to force mark injection regardless of cursor

**Replaced With:**
Edge detection in `findFocusedInline()` (see above)

**Why Replaced:**
Edge detection is more general and doesn't require manual flag management. However, **edge detection is unreliable** (see Known Issues below).

---

## Current Code Status

### richEditorState.svelte.ts

**Key Changes:**

1. **Lines 197-261: FOCUS MARK SPAN EDIT HANDLING**
   - Detects if `activeInline` contains cursor OR spans modified
   - Mirrors edited spans (lines 212-229)
   - Only mirrors if edited delimiter is in `SUPPORTED_INLINE_DELIMITERS`
   - Converts to markdown → HTML → replaces activeInline
   - **Does NOT set `skipNextFocusMarks`** (different from normal flow)
   - Early return prevents normal pattern detection from running again

2. **Lines 251: skipNextFocusMarks for Normal Flow**
   - **Uncommented** to prevent marks on newly typed formatted elements
   - Only applies to normal pattern transformations, not span edits

3. **Import INLINE_FORMATTED_TAGS** (line 30)
   - Needed to detect formatted elements in fragment after transformation

**Active Issues in This File:**
- Line 234: `console.log(fragment.childNodes)` - debug comment says "has leftover span if one was edited away"
- Lines 235-245: Logic to find `formattedElement` in fragment - currently **commented out at line 255**
- Lines 258-260: Cursor restoration commented out
- Line 228: `forceShowMarksOnElement` set on `editedSpan.parentElement` - but property doesn't exist

### focus-mark-manager.ts

**Key Changes:**

1. **Lines 116-188: Enhanced `findFocusedInline()`**
   - Added edge detection for text node boundaries
   - Added element-level cursor detection
   - Falls back to `null` if no match

2. **Lines 33-62: MutationObserver Constructor**
   - Observer exists but callback is mostly disabled
   - Line 45: `console.log('observe')` debug statement
   - Line 56: `this.handleSpanEdit(editedSpan, selection)` **commented out**
   - Observer is created but doesn't call anything meaningful

3. **Lines 141-166: `injectInlineMarks()` - PUBLIC now**
   - Changed from `private` to `public` (called from richEditorState)
   - Lines 163-164: Observes spans (but observer callback does nothing)

4. **Line 156: `activeDelimiter` Property**
   - Stores original delimiter when marks injected
   - Used in richEditorState for comparison during mirroring

5. **Lines 288-338: `handleSpanEdit()` - UNUSED**
   - Public method exists but is **never called**
   - Contains mirroring logic, unwrapping, cursor restoration
   - All this logic moved to richEditorState instead

**Active Issues in This File:**
- Observer code exists but doesn't work (disabled)
- `handleSpanEdit()` exists but unused (duplicate logic)
- `activeDelimiter` set but only used in richEditorState
- Properties `activeInline`, `activeBlock`, `spanRefs` made public (were private)

---

## Test Results (from focusmark-tests.md)

### ✅ Working Cases

**Case: `*italic*|` + Backspace**
- Unwrapping and formatting works
- FocusMarks of newly focused `strong` node shown correctly
- Cursor wrongly positioned but formatting correct

**Case: `**|text**` + Backspace (sometimes)**
- Correctly removes single `*` from each end
- Unwraps properly
- Cursor position wrong

**Case: `*|*text**` + Del**
- Correctly removes one `*` on each end
- Unwraps and transforms to italic
- Cursor at correct position
- FocusMarks not shown (✅ expected - skipNextFocusMarks)

### ❌ Broken Cases

**Case: `*italic|*` + Del**
- Unwrapping works
- **Cursor wrongly set to start of word: `|italic` instead of `italic|`**
- FocusMarks not shown (expected)

**Case: `*italic*|` + Backspace**
- Unwrapping works
- **Cursor wrongly set to start of sentence: `**|bold and ...` instead of after italic**
- FocusMarks shown (correct)

**Case: `**|text**` + Backspace (inconsistent)**
- Sometimes wrongly removes **both** `**` marks with one backspace
- Should only remove one `*`
- Inconsistent behavior

**Case: `*|*text**` + Backspace (inconsistent)**
- Sometimes wrongly removes both marks and unwraps as unformatted
- Should only remove one `*`

---

## Known Issues (from focusmark-notes.md)

### ✅ Resolved

1. **"focus spans must mirror one/another's edits"** ✅
   - Working via mirroring logic in richEditorState onInput (lines 212-229)

2. **"onSelection must mark to escape focusMarks like it did formatted elements"** ✅
   - Working via exit marks logic (lines 439-453)
   - Now detects further nesting to fix focus mark span issues

3. **"newly typed formatted nodes must not show (skip) their focusMarks initially"** ✅
   - Working via `skipNextFocusMarks = true` in normal flow (line 251)

4. **"editing inside spans must not mirror if NEW input && input is not supported md mark"** ✅
   - Working via `SUPPORTED_INLINE_DELIMITERS.has()` check (line 226)

5. **Issue #67: "caret before marks and del deletes all of them if delimiter length > 1"** ✅
   - **FIXED 2026-01-20**: Added `focusMarkManager.update(selection, editableRef)` after unwrapping (line 257)
   - Solution ensures marks are properly refreshed when selection doesn't trigger naturally
   - Fix confirmed working in manual testing

### ⏳ Partially Working

5. **"focusMarks must show if editing spans causes re-render but caret ends up just before/after"** ⏳
   - Edge detection implemented in `findFocusedInline()` (lines 116-188)
   - **BUT: User reports "it doesn't seem to always work"**
   - Inconsistent behavior, needs investigation

### ❌ Open Issues

6. **"backspacing on `**bold**..` makes the marker go after b `*b|old..`"** ❌
   - Not fixed
   - Related to cursor positioning after transformations

7. **"when formatting a new element by typing the last delimiter at word beginning `|italic*` the caret jumps forward"** ❌
   - Not fixed
   - Cursor jumps by delimiter length

8. **"clicking/focusing on a list item should focus the end not the focus span"** ❌
   - Not implemented

9. **"must hide and override default LI html marker; bad UX when md FocusMarks delimiter is also displayed"** ❌
   - Not implemented

10. **"encapsulate logic by reworking and calling `focus-mark-manager.ts` in main onInput"** ⚠️
    - **Intentionally deferred**: Logic temporarily in richEditorState for development
    - Will be refactored back to FocusMarkManager once behavior is stable
    - Current focus: Fix cursor positioning before architectural consolidation

11. **Issue #10: "adding same delimiters in the middle doesn't break and match the first half"** ❌
    - Implementation planned in `docs/issues/issue10-implementation.md` (marked as outdated)
    - Tests exist in `tests/e2e/focus-marks/breaking-delimiters.spec.ts`
    - Many tests failing (expected) - feature not fully implemented
    - Example: Typing `*` in middle of `*italic*` should break pattern and create new match
    - Status: In progress, non-blocking for current release

---

## Critical Problems

### 1. Cursor Positioning After Span Edits

**Symptoms:**
- Deleting from end: `*italic|*` + Del → cursor jumps to `|italic`
- Backspacing from adjacent: `*italic*|` + Backspace → cursor jumps to `**|bold...`

**Root Cause:**
Cursor restoration is **commented out** in richEditorState (line 260):
```typescript
// setCaretAfterExit(fragment, selection)
```

And `calculateCursorOffset`/`restoreCursor` only exist in FocusMarkManager's unused `handleSpanEdit()`.

**What's Needed:**
- Calculate cursor offset **before** `replaceWith(fragment)` (line 249)
- Restore cursor **after** replacement
- May need to traverse fragment to find correct text node

### 2. Inconsistent Backspace/Delete Behavior

**Symptoms:**
- Sometimes removes both delimiters with one keypress
- Sometimes removes one delimiter correctly
- Unpredictable

**Possible Causes:**
1. **Browser's native backspace** might be removing the entire span element before `onInput` fires
2. **Mirroring logic** might be setting both spans to empty string
3. **Race condition** between browser deletion and our mirroring

**Needs Investigation:**
- Add `onKeydown` handler to intercept backspace/delete
- Prevent default behavior when cursor is inside focus mark span
- Manually handle character deletion

### 3. Edge Detection Unreliable

**User Report:**
> "it doesn't seem to always work"

**Scenarios to Test:**
- Nested formats: `<strong><em>text</em></strong>` - delete outer, cursor lands where?
- Empty elements: `<em></em>` - cursor before/after
- Multiple adjacent formats: `<em>a</em><strong>b</strong>` - cursor between
- Different node types: what if sibling is a comment node, not element?

**Likely Issues:**
- Only checks immediate siblings (doesn't walk tree)
- Doesn't handle all node types (only ELEMENT_NODE and TEXT_NODE)
- Doesn't consider nested formatted elements

### 4. Current Development Architecture (Intentional Split)

**Strategy:** Logic temporarily split between two files to enable rapid iteration

**richEditorState.svelte.ts (Active Development):**
- Has complete span editing logic (lines 197-261)
- Mirrors spans
- Converts to markdown
- Replaces DOM
- **Missing: cursor restoration** (critical bug to fix)

**focus-mark-manager.ts (Reference Implementation):**
- Has `handleSpanEdit()` with mirroring, unwrapping, cursor restoration
- Contains working cursor restoration logic (not yet used)
- Has MutationObserver infrastructure (disabled due to timing issues)
- Will be the final home for this logic once refactored

**Why This Approach:**
- Allows testing span editing in the earliest event hook (onInput)
- Enables quick iteration without MutationObserver complexity
- Keeps reference implementation of cursor restoration logic available
- Plan: Consolidate back to FocusMarkManager once behavior is stable

### 5. Caret Style Persistence - Architectural Problem (2026-01-13)

**Discovery:** Focus mark spans exist INSIDE the formatted element being transformed.

**DOM Structure:**
```html
<strong>
  <span class="pd-focus-mark">**</span>
  content
  <span class="pd-focus-mark">**</span>
</strong>
```

**Problem:** When using `range.insertNode(fragment)` between spans (richEditorState.svelte.ts:251-253):
- We're inserting INSIDE the `<strong>` element
- Browser maintains that formatting context
- The `<strong>` wrapper never gets removed from the DOM
- Comment on line 256-257 confirms: "ejected <strong> parent not in frag but returns on range.insertNode"

**The Catch-22:**
1. **Must remove wrapper**: To escape the formatting context (remove `<strong>` tag)
2. **Must preserve spans**: To keep caret position in the DOM
3. **These conflict**: Removing the wrapper removes the spans that are inside it

**Attempted Solutions:**

1. ❌ **`replaceWith(fragment)`** - Removes entire `<strong>` including spans → loses caret
2. ❌ **Unwrap with `insertBefore` loop** - Moving nodes might cause browser to lose Selection reference
3. ❌ **Current approach** - Insert between spans keeps us inside formatting context
4. ⏳ **`replaceWith(...childNodes)`** - Untested, might preserve node positions better

**Root Cause:**
The original design assumed we could insert content between the spans and the browser would honor the new formatting. However, because the spans are CHILDREN of the formatted element, any insertion between them is still within that element's scope.

**Constraint:**
From design: "can't use smartReplace bc we want to UPDATE/EJECT format/pattern AND keep caret in span" (richEditorState.svelte.ts:194). The manual handling was specifically added to preserve caret position during delimiter edits.

**Impact:**
- When editing `**bold**` → `*italic*`, the `<strong>` tag persists
- Caret style persistence workaround (`escapeCaretStyle`) prevents new text from being bold
- But HTML structure still wrong: `<strong><em>italic</em></strong>` instead of `<em>italic</em>`
- Tests fail because DOM structure doesn't match expected markdown semantics

**Status:** Needs architectural solution to:
- Escape the formatting context (remove wrapper element)
- Preserve focus mark spans in the DOM (keep caret anchors)
- Maintain Selection/Range validity through the transformation

**Possible Directions:**
1. Store Selection offset/node references, unwrap, restore Selection manually
2. Use `document.createTreeWalker` to find equivalent position after unwrap
3. Redesign: Place focus mark spans OUTSIDE the formatted element as siblings
4. Accept the limitation: Transform correctly but don't preserve exact caret in spans

---

## Recommendations

### Immediate Fixes (High Priority)

1. **Fix Cursor Positioning**
   - Move `calculateCursorOffset` and `restoreCursor` from FocusMarkManager to richEditorState
   - OR: Re-enable `handleSpanEdit()` in FocusMarkManager and call it
   - Calculate offset before `replaceWith`, restore after

2. **Investigate Backspace/Delete Issues**
   - Add `onKeydown` handler for backspace/delete keys
   - Check if cursor is inside focus mark span
   - Prevent default if inside span, handle manually
   - Test: Does browser delete entire span element?

3. **Refactor Back to FocusMarkManager (When Ready)**
   - Once cursor positioning is fixed and behavior is stable
   - Move span editing logic from richEditorState back to FocusMarkManager
   - Reuse existing `handleSpanEdit()` method (has cursor restoration logic)
   - Consider MutationObserver vs onInput event delegation approach

### Medium Priority

4. **Improve Edge Detection**
   - Add debug logging to see when it succeeds/fails
   - Test all scenarios from test file
   - Consider walking up tree more levels
   - Handle all node types

5. **Test Suite**
   - Automate test cases from focusmark-tests.md
   - Add cursor position assertions
   - Add consistency tests (run same action 10x, should get same result)

### Low Priority

6. **Implement Missing Features**
   - List item focus behavior
   - Hide default LI markers
   - Block mark editing

---

## File Locations & Line Numbers

**Primary Implementation:**
- `src/lib/svelte/richEditorState.svelte.ts` (lines 197-261) - Main span editing logic
- `src/lib/core/utils/focus-mark-manager.ts` (lines 116-188) - Edge detection
- `src/lib/core/utils/focus-mark-manager.ts` (lines 141-166) - Mark injection

**DOM Utilities (Refactored 2026-01-20):**
- `src/lib/core/dom/smartReplaceChildren.ts` (149 lines) - Smart DOM reconciliation with cursor preservation
- `src/lib/core/dom/util.ts` (66 lines) - Helper functions:
  - `getFirstTextNode()` - Finds first text node in tree
  - `getDomRangeFromContentOffsets()` - Creates DOM ranges from character offsets
- `src/lib/core/dom/index.ts` - Module exports

**Unused/Disabled Code:**
- `focus-mark-manager.ts` lines 33-62 - MutationObserver (disabled)
- `focus-mark-manager.ts` lines 288-338 - handleSpanEdit() (never called)

**Related Utilities:**
- `src/lib/core/utils/dom.ts` - Tag lists, getFirstOfAncestors (smartReplaceChildren moved out)
- `src/lib/core/utils/inline-patterns.ts` - SUPPORTED_INLINE_DELIMITERS
- `src/lib/core/transforms/transform.ts` - Pattern detection and transformation logic

---

## Debug Checklist

When debugging focusMarks issues:

1. **Check if marks appear at all**
   - Verify `update()` is called on selection change
   - Check `findFocusedInline()` returns element
   - Confirm `injectInlineMarks()` creates spans

2. **Check if mirroring works**
   - Add `console.log` in lines 226-227
   - Verify both spans exist in `spanRefs`
   - Check if edited delimiter is in `SUPPORTED_INLINE_DELIMITERS`

3. **Check cursor position**
   - Log `selection.anchorNode` and `anchorOffset` before/after replacement
   - Check if cursor is in expected text node
   - Verify offset is correct

4. **Check transformation flow**
   - Log markdown output (line 232)
   - Log fragment structure (line 234)
   - Check if `skipNextFocusMarks` is set correctly

5. **Check edge detection**
   - Log all branches in `findFocusedInline()`
   - Log sibling/child nodes being checked
   - Verify node types and tag names

---

## Next Steps

**Immediate:**
1. Fix cursor positioning (critical UX issue)
2. Debug inconsistent backspace behavior

**Short-term:**
3. Comprehensive testing of edge detection
4. Add automated tests
5. Improve error handling
6. Refactor logic back to FocusMarkManager (once stable)

**Long-term:**
7. Implement block mark editing
8. Optimize performance if needed

---

**Session Notes:**
This status doc reflects the state after attempting to implement:
- Span mirroring ✅ (working)
- Force marks on transformed elements ❌ (replaced with edge detection)
- Edge detection ⏳ (implemented but unreliable)
- Skip marks on new elements ✅ (working)

Major blocker: Cursor positioning after span edits is broken, making the feature frustrating to use despite core functionality working.
