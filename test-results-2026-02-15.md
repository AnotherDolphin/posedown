# Test Results — 2026-02-15

**Run:** `npx playwright test tests/e2e/rich-editor-caret-position.spec.ts tests/e2e/rich-editor-inline-patterns.spec.ts`

**Summary:** 46 passed / 15 failed / 61 total

---

## After Merge — `newFindFirstMd` (commit `efb3c7f`)

**Summary:** 44 passed / 17 failed / 61 total  *(net: −2 pass, +2 fail)*

### Fixed by merge ✅ (was failing, now passing)

| File | Test |
|------|------|
| caret-position | caret should be correct when adding markdown in the middle of a block `:241` |
| caret-position | caret should handle typing after pattern with no trailing space `:358` |
| inline-patterns | Position-Dependent Nesting › should handle different nesting combinations at end: `_**text**_` `:637` |

### Regressions introduced ❌ (was passing, now failing)

| File | Test |
|------|------|
| caret-position | caret should handle multiple patterns - cursor at end `:299` |
| caret-position | caret should handle underscore bold pattern `:396` |
| inline-patterns | should handle mixed inline patterns `:128` |
| inline-patterns | should convert `_**italic bold**_` to `<em>` wrapping `<strong>` `:392` |
| inline-patterns | should convert `~~**deleted bold**~~` to `<del>` wrapping `<strong>` `:409` |

### Unchanged failures (still failing, 10 tests)

| File | Test |
|------|------|
| caret-position | caret should handle backspace after pattern transformation `:115` |
| caret-position | caret should handle cursor BEFORE pattern start `:268` |
| caret-position | caret should handle pattern with punctuation before it `:312` |
| caret-position | caret should handle typing in middle then navigating away and back `:368` |
| caret-position | caret should land after each nested bold, not after "text", when typing inside italic `:422` |
| caret-position | caret should land after each nested italic, not after "text", when typing inside bold `:461` |
| inline-patterns | should handle multiple italic elements inside bold `:170` |
| inline-patterns | should handle multiple bold elements inside italic `:213` |
| inline-patterns | should convert `**_bold italic_**` to `<strong>` wrapping `<em>` `:375` |
| inline-patterns | should convert `**~~bold deleted~~**` to `<strong>` wrapping `<del>` `:426` |
| inline-patterns | should handle triple nesting: `***~~text~~***` `:443` |
| inline-patterns | Position-Dependent Nesting › should handle different nesting combinations at start: `**_text_**` `:618` |

---

---

## rich-editor-caret-position.spec.ts

| # | Test | Result |
|---|------|--------|
| 1 | caret should be after `<strong>` when typing `**bold**` | ✅ pass |
| 2 | caret should be preserved when pattern has text before it | ✅ pass |
| 3 | caret should handle pattern followed by space and text | ✅ pass |
| 4 | caret should be preserved when typing pattern in middle of text | ✅ pass |
| 5 | caret should be after nested patterns | ✅ pass |
| 6 | caret should handle multiple patterns in sequence | ✅ pass |
| 7 | caret should handle backspace after pattern transformation | ❌ fail |
| 8 | caret should stay outside pattern when typing space after it | ✅ pass |
| 9 | caret should handle rapid typing after pattern conversion | ✅ pass |
| 10 | caret should be preserved with mixed patterns and text | ✅ pass |
| 11 | caret should handle pattern at start of line | ✅ pass |
| 12 | caret should handle pattern at end of line | ✅ pass |
| 13 | caret should handle strikethrough pattern | ✅ pass |
| 14 | caret should handle code pattern | ✅ pass |
| 15 | caret should be correct when adding markdown in the middle of a block | ❌ fail |
| 16 | caret should handle cursor BEFORE pattern start | ❌ fail |
| 17 | caret should handle multiple patterns - cursor at end | ✅ pass |
| 18 | caret should handle pattern with punctuation before it | ❌ fail |
| 19 | caret should handle pattern at very start of block | ✅ pass |
| 20 | caret should handle long text with pattern in middle | ✅ pass |
| 21 | caret should handle typing after pattern with no trailing space | ❌ fail |
| 22 | caret should handle typing in middle then navigating away and back | ❌ fail |
| 23 | caret should handle underscore bold pattern | ✅ pass |
| 24 | caret should handle single underscore italic pattern | ✅ pass |
| 25 | caret should land after each nested bold, not after "text", when typing inside italic | ❌ fail |
| 26 | caret should land after each nested italic, not after "text", when typing inside bold | ❌ fail |

---

## rich-editor-inline-patterns.spec.ts

| # | Test | Result |
|---|------|--------|
| 1 | should convert `**bold**` markdown to `<strong>` element | ✅ pass |
| 2 | should convert `*italic*` markdown to `<em>` element | ✅ pass |
| 3 | should convert `` `code` `` markdown to `<code>` element | ✅ pass |
| 4 | should convert `~~strikethrough~~` markdown to `<del>` element | ✅ pass |
| 5 | should prevent typing inside styled element after conversion | ✅ pass |
| 6 | should handle space after styled element correctly | ✅ pass |
| 7 | should allow multiple characters after styled element | ✅ pass |
| 8 | should handle mixed inline patterns | ✅ pass |
| 9 | should prevent deletion of last `<p>` tag | ✅ pass |
| 10 | should handle multiple italic elements inside bold | ❌ fail |
| 11 | should handle multiple bold elements inside italic | ❌ fail |
| 12 | should handle nested-looking patterns correctly | ✅ pass |
| 13 | should preserve whitespace with break-spaces CSS | ✅ pass |
| 14 | should handle rapid typing after pattern conversion | ✅ pass |
| 15 | should allow continuing after space-only text node | ✅ pass |
| 16 | should handle Delete key similar to Backspace for `<p>` protection | ✅ pass |
| 17 | should maintain cursor position after pattern conversion | ✅ pass |
| 18 | should convert `***bold italic***` to nested `<em><strong>` elements | ✅ pass |
| 19 | should convert `**_bold italic_**` to `<strong>` wrapping `<em>` | ❌ fail |
| 20 | should convert `_**italic bold**_` to `<em>` wrapping `<strong>` | ✅ pass |
| 21 | should convert `~~**deleted bold**~~` to `<del>` wrapping `<strong>` | ✅ pass |
| 22 | should convert `**~~bold deleted~~**` to `<strong>` wrapping `<del>` | ❌ fail |
| 23 | should handle triple nesting: `***~~text~~***` | ❌ fail |
| 24 | should prevent typing inside nested styled elements after conversion | ✅ pass |
| 25 | should handle complex nested pattern with text around it | ✅ pass |
| **Position-Dependent Nesting** | | |
| 26 | should handle nested pattern at start of line (single word) | ✅ pass |
| 27 | should handle nested pattern at end of line | ✅ pass |
| 28 | should handle nested pattern in middle of line (single word) | ✅ pass |
| 29 | should handle nested pattern with phrase at start | ✅ pass |
| 30 | should handle nested pattern with phrase at end | ✅ pass |
| 31 | should handle nested pattern with phrase in middle | ✅ pass |
| 32 | should handle different nesting combinations at start: `**_text_**` | ❌ fail |
| 33 | should handle different nesting combinations at end: `_**text**_` | ❌ fail |
| 34 | should handle single character nested pattern | ✅ pass |
| 35 | should handle nested pattern followed immediately by text | ✅ pass |

---

## Failure Details

### rich-editor-caret-position.spec.ts

**`caret should handle backspace after pattern transformation`** `:115`
```
Expected: not.toContain('xyz')
Received: innerHTML still contains 'xyz' after 3 backspaces
```

**`caret should be correct when adding markdown in the middle of a block`** `:241`
```
Expected: 'test <strong>mid</strong> xsentence'
Received: different cursor position after typing 'x'
```

**`caret should handle cursor BEFORE pattern start`** `:268`
```
Expected: 'xhello <strong>bold</strong>'
Received: cursor landed in wrong position
```

**`caret should handle pattern with punctuation before it`** `:312`
```
Expected: 'hello, <strong>world</strong>!x'
Received: 'x' ended up in wrong position
```

**`caret should handle typing after pattern with no trailing space`** `:358`
```
Expected: 'prefix <strong>bold</strong>suffix'
Received: different structure
```

**`caret should handle typing in middle then navigating away and back`** `:368`
```
Expected: 'start<strong>mid</strong> x end'
Received: different structure after navigation
```

**`caret should land after each nested bold, not after "text", when typing inside italic`** `:422`
```
Expected match: /<em>italic <strong>b<\/strong>x text<\/em>/
Received: no match — caret did not land after nested </strong>
```

**`caret should land after each nested italic, not after "text", when typing inside bold`** `:461`
```
Expected match: /<strong>bold <em>i<\/em>x text<\/strong>/
Received: no match — caret did not land after nested </em>
```

---

### rich-editor-inline-patterns.spec.ts

**`should handle multiple italic elements inside bold`** `:170`
```
Expected match: /<strong>bold <em>i<\/em> <em>i<\/em> text<\/strong>/
Received: second <em> not found or structure differs
```

**`should handle multiple bold elements inside italic`** `:213`
```
Expected match: /<em>italic <strong>b<\/strong> <strong>b<\/strong> text<\/em>/
Received: second <strong> not found or structure differs
```

**`should convert **_bold italic_** to <strong> wrapping <em>`** `:375`
```
Expected match: /<strong><em>bold italic<\/em><\/strong>/
Received: <em> not found inside <strong>
```

**`should convert **~~bold deleted~~** to <strong> wrapping <del>`** `:426`
```
Expected match: /<strong><del>bold deleted<\/del><\/strong>/
Received: <del> not found inside <strong>
```

**`should handle triple nesting: ***~~text~~***`** `:443`
```
Expected match: /<em><strong><del>all styles<\/del><\/strong><\/em>/
Received: <del> not found inside nested structure
```

**`should handle different nesting combinations at start: **_text_**`** `:618`
```
Expected: <em> inside <strong> containing 'bold italic'
Received: <em> not found inside <strong>
```

**`should handle different nesting combinations at end: _**text**_`** `:637`
```
Expected: <strong> inside <em> containing 'italic bold'
Received: <strong> not found inside <em>
```
