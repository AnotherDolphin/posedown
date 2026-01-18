# Focus Mark Test Adjustments
**Date:** 2026-01-18
**Related Fix:** Issue#6 - Focus spans reinjection after pattern transformation

## Overview

After fixing issue#6 (focus spans now persist during pattern transformations inside active inline elements), several test scenarios need adjustment or addition to properly validate the new behavior.

**Key Change**: Focus mark spans are now extracted before transformation and reinjected after, meaning they persist throughout the transformation lifecycle.

---

## Tests That Need Adjustment

### 1. HTML Output Expectations (5+ tests affected)

**Issue**: Tests that verify HTML structure while cursor is inside formatted elements now receive focus mark spans in the output.

**Current expectation**:
```html
<strong>text</strong>
```

**New reality**:
```html
<strong><span class="pd-focus-mark">**</span>text<span class="pd-focus-mark">**</span></strong>
```

**Where to look**:
- Any test asserting on `innerHTML` or `outerHTML` while cursor is active inside formatted elements
- Tests checking element structure during editing operations
- Tests that use `toHaveHTML()` or `toMatchHTML()` matchers

**Fix strategy**:
1. Option A: Update expectations to include focus mark spans
2. Option B: Strip focus marks before assertion (e.g., `element.querySelectorAll('.pd-focus-mark').forEach(m => m.remove())`)
3. Option C: Move cursor outside element before checking HTML (blur the element)

---

## New Test Scenarios to Add

### 2. Span Persistence During Transformations (HIGH PRIORITY)

**Purpose**: Verify spans survive pattern transformations and maintain same object references.

```typescript
test('focus spans persist when typing creates new pattern inside active element', async ({ page }) => {
  // Setup: Create <em>text</em> and focus cursor inside
  await page.locator('[contenteditable]').click()
  await page.keyboard.type('*text*')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')

  // Verify initial focus spans exist
  const spansBefore = await page.locator('.pd-focus-mark').count()
  expect(spansBefore).toBe(2)

  // Action: Type to create **bold** pattern inside the italic
  await page.keyboard.type('**nested**')

  // Verify: Both italic spans AND new bold spans exist
  const spansAfter = await page.locator('.pd-focus-mark').count()
  expect(spansAfter).toBeGreaterThanOrEqual(2) // At least original spans persist

  // Verify: Italic formatting still present
  const em = page.locator('em')
  await expect(em).toBeVisible()
})
```

---

### 3. Span Position After Transformation (HIGH PRIORITY)

**Purpose**: Ensure spans remain at correct boundaries (prepend/append) after transformation.

```typescript
test('focus spans are correctly positioned after transformation', async ({ page }) => {
  // Setup: <strong>text</strong> with focus spans
  await page.locator('[contenteditable]').click()
  await page.keyboard.type('**text**')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')

  // Action: Type to create nested italic pattern
  await page.keyboard.type('*italic*')

  // Verify: Strong spans still at outer boundaries
  const strong = page.locator('strong')
  const firstChild = await strong.evaluate(el => el.firstChild?.className)
  const lastChild = await strong.evaluate(el => el.lastChild?.className)

  expect(firstChild).toBe('pd-focus-mark')
  expect(lastChild).toBe('pd-focus-mark')

  // Verify: Delimiter text matches element type
  const openingSpan = await strong.evaluate(el => el.firstChild?.textContent)
  const closingSpan = await strong.evaluate(el => el.lastChild?.textContent)

  expect(openingSpan).toBe('**')
  expect(closingSpan).toBe('**')
})
```

---

### 4. Caret Position After Pattern Inside Active Element (HIGH PRIORITY)

**Purpose**: Verify issue#5 fix (setCaretAtEnd) works correctly with span reinjection.

```typescript
test('caret position correct after transformation with span reinjection', async ({ page }) => {
  // Setup: <em>text</em> with cursor at specific position
  await page.locator('[contenteditable]').click()
  await page.keyboard.type('*original text*')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')

  // Action: Type to create **bold** pattern
  await page.keyboard.type('**bold**')

  // Verify: Caret is at expected position (not moved to end/start of block)
  await page.keyboard.type('X')

  const html = await page.locator('[contenteditable]').innerHTML()
  // Should contain 'bold**X' not 'bold**...X' at end
  expect(html).toContain('bold**X')

  // Verify: Next input goes to correct location
  await page.keyboard.type('Y')
  expect(await page.locator('[contenteditable]').innerHTML()).toContain('bold**XY')
})
```

---

### 5. Multiple Nested Transformations (MEDIUM PRIORITY)

**Purpose**: Stress test span persistence across multiple transformation levels.

```typescript
test('handles multiple pattern transformations with span persistence', async ({ page }) => {
  // Setup: <strong>text</strong>
  await page.locator('[contenteditable]').click()
  await page.keyboard.type('**text**')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')

  // Action 1: Type to create *italic* inside
  await page.keyboard.type('*level2*')

  // Verify level 1 spans exist
  let spans = await page.locator('.pd-focus-mark').count()
  expect(spans).toBeGreaterThanOrEqual(2)

  // Action 2: Navigate into italic, type ~~strike~~ inside
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.type('~~level3~~')

  // Verify: All three levels maintain their formatting
  await expect(page.locator('strong')).toBeVisible()
  await expect(page.locator('em')).toBeVisible()
  await expect(page.locator('del')).toBeVisible()

  // Verify: Appropriate spans exist (at least for current active element)
  spans = await page.locator('.pd-focus-mark').count()
  expect(spans).toBeGreaterThanOrEqual(2)
})
```

---

### 6. Span Extraction Edge Cases (MEDIUM PRIORITY)

**Purpose**: Ensure graceful handling when spans are in unexpected states.

```typescript
test('handles transformation when only one span exists', async ({ page }) => {
  // Setup: Manually create element with only opening span
  await page.locator('[contenteditable]').evaluate(el => {
    const strong = document.createElement('strong')
    const openSpan = document.createElement('span')
    openSpan.className = 'pd-focus-mark'
    openSpan.textContent = '**'
    strong.appendChild(openSpan)
    strong.appendChild(document.createTextNode('text'))
    el.appendChild(strong)
  })

  // Focus inside strong
  const strong = page.locator('strong')
  await strong.click()

  // Action: Type to create pattern
  await page.keyboard.type('*italic*')

  // Verify: No crash, graceful handling
  await expect(page.locator('[contenteditable]')).toBeVisible()
})

test('handles transformation when span contains selection', async ({ page }) => {
  // Setup: Create formatted element, select span content
  await page.locator('[contenteditable]').click()
  await page.keyboard.type('**text**')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')

  // Select opening span content
  await page.locator('.pd-focus-mark').first().dblclick()

  // Action: Type to trigger transformation
  await page.keyboard.type('***')

  // Verify: No crash, behavior is defined
  await expect(page.locator('[contenteditable]')).toBeVisible()
})
```

---

### 7. Invalid Pattern Span Behavior (HIGH PRIORITY - Fixes Category 2 failures)

**Purpose**: Verify spans are removed when pattern becomes invalid after transformation.

```typescript
test('focus spans removed when pattern becomes invalid after transformation', async ({ page }) => {
  // Setup: <strong>**text**</strong>
  await page.locator('[contenteditable]').click()
  await page.keyboard.type('**text**')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')

  // Action: Edit opening span to make *** (invalid)
  const openingSpan = page.locator('.pd-focus-mark').first()
  await openingSpan.click()
  await page.keyboard.type('*')

  // Blur to trigger unwrap
  await page.keyboard.press('Escape')

  // Verify: After transformation, no formatting element exists
  const strong = page.locator('strong')
  await expect(strong).not.toBeVisible()

  // Verify: No focus spans remain (element unwrapped to plain text)
  const spans = await page.locator('.pd-focus-mark').count()
  expect(spans).toBe(0)

  // Verify: Content is plain text ***text***
  const text = await page.locator('[contenteditable]').textContent()
  expect(text).toBe('***text***')
})
```

---

## Regression Tests Needed

### 8. Verify Original Issue#6 Scenario (HIGH PRIORITY)

**Purpose**: Ensure the exact broken scenario from issue#6 now works.

```typescript
test('issue#6 regression: focus spans not lost after pattern transformation', async ({ page }) => {
  // The exact scenario that was broken before the fix

  // Setup: <em>text</em> with cursor inside
  await page.locator('[contenteditable]').click()
  await page.keyboard.type('*text*')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')

  // Verify initial spans visible
  const spansBefore = await page.locator('.pd-focus-mark').count()
  expect(spansBefore).toBe(2)

  // Action: Type **bold** pattern inside italic element
  await page.keyboard.type('**bold**')

  // Verify: Italic focus spans still visible
  const spansAfter = await page.locator('.pd-focus-mark').count()
  expect(spansAfter).toBeGreaterThanOrEqual(2)

  // Verify: User can still see and edit italic delimiters
  const em = page.locator('em')
  await expect(em).toBeVisible()

  const firstSpan = await em.evaluate(el => el.firstChild?.className)
  expect(firstSpan).toBe('pd-focus-mark')
})
```

---

### 9. Verify Issue#5 Fix Still Works (MEDIUM PRIORITY)

**Purpose**: Ensure setCaretAfter → setCaretAtEnd fix remains stable.

```typescript
test('issue#5 regression: caret position stable with setCaretAtEnd', async ({ page }) => {
  // Verify the setCaretAfter → setCaretAtEnd fix

  // Setup: Active formatted element
  await page.locator('[contenteditable]').click()
  await page.keyboard.type('**text**')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')

  // Action: Type new pattern
  await page.keyboard.type('*italic*')

  // Verify: Caret at end of new text node (not moved elsewhere)
  await page.keyboard.type('X')

  const html = await page.locator('[contenteditable]').innerHTML()
  expect(html).toContain('italic*X')

  // Verify: Next input goes to correct location (not jumped to end of block)
  await page.keyboard.type('Y')
  const updatedHtml = await page.locator('[contenteditable]').innerHTML()
  expect(updatedHtml).toContain('italic*XY')
  expect(updatedHtml).not.toMatch(/\*\*XY$/) // Not at end of block
})
```

---

## Priority Summary

### High Priority (Fixes existing failures + validates core fix)
1. **#1**: Adjust HTML output expectations (~5 tests)
2. **#7**: Invalid pattern span behavior (fixes 3 Category 2 failures)
3. **#2**: Span persistence during transformations
4. **#3**: Span position after transformation
5. **#4**: Caret position after pattern transformation
6. **#8**: Regression test for issue#6

### Medium Priority (Edge cases + additional validation)
7. **#5**: Multiple nested transformations
8. **#6**: Span extraction edge cases
9. **#9**: Regression test for issue#5

### Low Priority (Nice to have)
- Additional edge case coverage
- Performance tests for span extraction/reinjection
- Accessibility tests with screen readers

---

## Next Steps

1. **Immediate**: Fix HTML output expectation tests (#1)
2. **Short-term**: Add high-priority regression tests (#2, #3, #4, #8)
3. **Medium-term**: Implement invalid pattern handling (#7)
4. **Long-term**: Add comprehensive edge case coverage (#5, #6, #9)

---

## Related Files

- [focusmark-test-results.md](./focusmark-test-results.md) - Current test failure analysis
- [focusmark-notes.md](./focusmark-notes.md) - Issue tracking with issue#6 marked as fixed
- [src/lib/svelte/richEditorState.svelte.ts](../../src/lib/svelte/richEditorState.svelte.ts) - Implementation of span extraction/reinjection (lines 261-285)

**Status**: Ready for test implementation
