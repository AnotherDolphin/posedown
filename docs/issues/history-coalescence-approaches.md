# History Coalescence Breaking: Approach Comparison

> **Created:** 2024-12-25

## Problem Statement
We want to undo to `**make bold*` (incomplete pattern) instead of `**make bold**` (complete pattern). This requires breaking history coalescence BEFORE the transformation triggers.

---

## Approach 1: Pattern Prediction (Complex but Precise)

### How It Works
Use `beforeinput` event to predict if the next character would complete a markdown pattern:
1. Get current block text: `**make bold*`
2. Get incoming character: `*`
3. Test if `**make bold**` matches any pattern
4. If yes → break coalescence → save `**make bold*`
5. Let character insert → transformation happens → save transformed state

### Implementation
```typescript
// New file: pattern-prediction.ts
function wouldCompletePattern(currentText: string, nextChar: string): boolean {
  const testText = currentText + nextChar

  // Test against all inline patterns (bold, italic, code, etc.)
  const inlineMatch = findFirstMarkdownMatch(testText)
  if (inlineMatch && !findFirstMarkdownMatch(currentText)) return true

  // Test against all block patterns (heading, list, etc.)
  const hadBlock = isBlockPattern(currentText)
  const hasBlock = isBlockPattern(testText)
  if (hasBlock && !hadBlock) return true

  return false
}

// In onBeforeInput:
if (e.inputType === 'insertText' && wouldCompletePattern(blockText, e.data)) {
  this.history.breakCoalescing(this.editableRef)
}
```

### Example: Typing `**make bold**`

| Action | History State | Coalescence |
|--------|---------------|-------------|
| Type `**make bold*` | (coalescing) | Active |
| Type final `*` | BREAK → saves `**make bold*` | Broken |
| Transformation | Saves transformed bold | New entry |

**Total snapshots**: 2 (incomplete + complete)

### Tradeoffs

**Pros:**
- ✅ **Precise**: Only breaks when pattern actually completes
- ✅ **Minimal history**: Fewer undo snapshots = cleaner history
- ✅ **Intent-aware**: Understands markdown semantics
- ✅ **User-friendly**: Undo behavior matches user expectations

**Cons:**
- ❌ **Complex**: Requires regex testing on every keystroke
- ❌ **Performance cost**: ~2 regex tests per character typed
- ❌ **Maintenance**: New patterns need prediction logic updates
- ❌ **Edge cases**: What about nested patterns? Partially complete patterns?
- ❌ **Code size**: New utility file + complex logic in beforeinput

**Performance:**
- Runs on EVERY `insertText` event
- 2 function calls: `findFirstMarkdownMatch()` + `isBlockPattern()`
- Each tests ~15 regex patterns
- Modern browsers: ~0.1-0.5ms per keystroke (negligible)

---

## Approach 2: Marker-Based (Simple but Noisy)

### How It Works
Break coalescence whenever ANY markdown marker character is typed:
1. Check if `e.data` is a markdown marker: `*#_~-+>[]()` `` | ` `` `=^`
2. If yes → break coalescence immediately
3. No prediction needed

### Implementation
```typescript
// In onBeforeInput (no new files needed):
private onBeforeInput = (e: InputEvent) => {
  if (e.inputType !== 'insertText' || !e.data || !this.editableRef) return

  // Markdown marker characters
  const markers = new Set(['*', '#', '_', '~', '-', '+', '>', '[', ']', '(', ')', '`', '|', '=', '^'])

  if (markers.has(e.data)) {
    this.history.breakCoalescing(this.editableRef)
  }
}
```

### Example: Typing `**make bold**`

| Action | History State | Coalescence |
|--------|---------------|-------------|
| Type `*` | BREAK → saves `` (empty) | Broken |
| Type `*` | BREAK → saves `*` | Broken |
| Type `make bold` | (coalescing) | Active |
| Type `*` | BREAK → saves `**make bold` | Broken |
| Type `*` | BREAK → saves `**make bold*` ✅ | Broken |
| Transformation | Saves transformed bold | New entry |

**Total snapshots**: 6 (4 marker breaks + 1 coalesced typing + 1 transform)

### Tradeoffs

**Pros:**
- ✅ **Dead simple**: 5 lines of code, no new files
- ✅ **Fast**: Set lookup is O(1), no regex
- ✅ **Maintainable**: Add new markers to set, done
- ✅ **Robust**: Works for all patterns, even future ones
- ✅ **Granular history**: Every marker typed is undoable

**Cons:**
- ❌ **Noisy history**: Many more undo snapshots
- ❌ **Memory overhead**: More history entries stored
- ❌ **False positives**: Breaks on prose like "cost-benefit" or "3*4=12"
- ❌ **Overzealous**: Breaks even when marker won't complete a pattern
- ❌ **Undo noise**: User must undo through each marker

**Performance:**
- Runs on EVERY `insertText` event
- 1 Set lookup: O(1) constant time
- Modern browsers: ~0.01ms per keystroke (10x faster than regex)

---

## Comparative Analysis

### User Experience

**Pattern Prediction:**
- Undo to `**make bold*`: **2 steps** back
- Clean undo path: content → incomplete pattern → complete pattern

**Marker-Based:**
- Undo to `**make bold*`: **2 steps** back (same!)
- Noisy undo path: content → `**make bold` → `**make bold*` → complete pattern
- But user sees MORE intermediate states

### Real-World Scenarios

#### Scenario 1: User types `**bold**`
- **Prediction**: 1 break (before final `*`)
- **Marker**: 4 breaks (each `*`)

#### Scenario 2: User types "The cost-benefit analysis"
- **Prediction**: 0 breaks (no pattern completes)
- **Marker**: 1 break (on `-`)

#### Scenario 3: User types `# Heading `
- **Prediction**: 1 break (before space completes heading)
- **Marker**: 2 breaks (on `#`, then on space if space is marker)

Wait... should space be a marker? Probably not, since it's used everywhere.

#### Scenario 4: User types code block `` ```javascript ``
- **Prediction**: 1 break (when pattern completes)
- **Marker**: 3 breaks (each `` ` ``)

### Memory Impact

Assume user writes 1000-word document with 50 markdown patterns:

**Pattern Prediction:**
- Base typing: ~10 coalesced snapshots (500ms windows)
- Pattern breaks: ~50 breaks (one per pattern)
- **Total: ~110 snapshots**

**Marker-Based:**
- Base typing: ~10 coalesced snapshots
- Marker breaks: ~200 breaks (4 markers per pattern on average)
- **Total: ~220 snapshots** (2x more)

Each snapshot stores:
- Full HTML (~10KB for 1000 words)
- Selection state (~100 bytes)

Memory difference: ~1.1MB vs ~2.2MB (negligible in 2025)

---

## Recommendation

### Choose **Pattern Prediction** if:
- You value clean, semantic undo behavior
- Performance is critical (though both are fast)
- You want minimal history clutter
- You're comfortable maintaining prediction logic

### Choose **Marker-Based** if:
- You value simplicity over precision
- You want maximum undo granularity
- You want zero prediction edge cases
- You're okay with more undo steps

---

## Hybrid Approach (Best of Both?)

What if we combine them?

```typescript
private onBeforeInput = (e: InputEvent) => {
  if (e.inputType !== 'insertText' || !e.data || !this.editableRef) return

  const selection = window.getSelection()
  if (!selection?.anchorNode) return

  const node = selection.anchorNode
  const block = getMainParentBlock(node, this.editableRef)
  if (!block) return

  const currentText = block.textContent || ''
  const nextChar = e.data

  // Check if it's a marker character
  const markers = new Set(['*', '#', '_', '~', '-', '+', '>', '[', ']', '(', ')', '`', '|', '=', '^'])

  if (markers.has(nextChar)) {
    // It's a marker - only break if it would complete a pattern
    if (wouldCompletePattern(currentText, nextChar)) {
      this.history.breakCoalescing(this.editableRef)
    }
  }
}
```

**Hybrid Tradeoffs:**
- Same precision as Pattern Prediction
- Faster (early exit if not a marker)
- Still requires prediction logic
- Best of both worlds!

---

## My Recommendation

**Go with Marker-Based** for your use case because:

1. ✅ **Simplicity wins**: 5 lines vs 50+ lines
2. ✅ **Your goal is achievable**: Undo to `**make bold*` works with both
3. ✅ **Debugging**: More granular history helps during development
4. ✅ **No edge cases**: No prediction = no prediction bugs
5. ✅ **Future-proof**: New markdown patterns work automatically

The only downside (more history entries) is negligible in 2025 with modern browsers and memory.

**Start with Marker-Based, upgrade to Prediction if needed.**
