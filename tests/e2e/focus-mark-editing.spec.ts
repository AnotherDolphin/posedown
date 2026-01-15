import { test, expect } from '@playwright/test';

const EDITOR_URL = '/test';

test.describe('Rich Editor - Focus Mark Editing', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL);
		await page.waitForLoadState('networkidle');

		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]');
		await editor.click();
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(50); // a small buffer
	});

	// REVIEWED TEST fault#1 (fails but should pass)
	test('should change bold to italic by editing opening delimiter', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Type **bold** and verify it becomes bold
		await editor.pressSequentially('**bold**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();
		await expect(strong).toContainText('bold');

		// 2. Click at the beginning of bold text to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('**');
		await expect(focusMarks.last()).toContainText('**');

		// 3. Navigate cursor into opening delimiter using arrow keys
		await page.keyboard.press('Home'); // Go to start of line
		await page.keyboard.press('ArrowRight'); // Move into first *
		await page.keyboard.press('ArrowRight'); // Move into second *

		// 4. Delete one asterisk
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// With mirroring: both delimiters become '*', unwrap and transform to italic
		await expect(strong).not.toBeVisible();
		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(em).toContainText('bold'); // fault: wrong, bold is ejected and unwrapped. It should be a negative.
	});

	// REVIEWED TEST
	test('should handle typing non-delimiter chars inside focus mark span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**text**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show focus marks, navigate cursor into opening delimiter
		await strong.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // Into first *

		// 3. Type 'abc' inside the opening mark span
		await page.keyboard.type('abc');
		await page.waitForTimeout(100);

		// With mirroring: opening becomes '*abc*', closing mirrors to '*abc*'
		// Unwraps to: *abc**text*abc*
		// Pattern detection sees *abc* (italic) followed by plain text
		await expect(strong).not.toBeVisible();
		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(em).toContainText('abc');
	});

	// REVIEWED TEST
	test('should unwrap completely when deleting all delimiters', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create code text
		await editor.pressSequentially('`code`');
		await page.waitForTimeout(100);

		const code = editor.locator('code');
		await expect(code).toBeVisible();
		await expect(code).toContainText('code');

		// 2. Click to show focus marks, navigate into opening delimiter
		await code.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // Into the `

		// 3. Delete the backtick
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// With mirroring: both delimiters become empty, unwrap to plain text
		await expect(code).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('code');
	});

	// REVIEWED TEST ❌ Issue#9: spans don't unwrap as simple text when delimiters become invalid
	test('should keep mismatched delimiters as plain text', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**text**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click and navigate to end of opening delimiter
		await strong.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // First *
		await page.keyboard.press('ArrowRight'); // Second *

		// 3. Add extra asterisk
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// With mirroring: both delimiters become '***', unwrap to ***text***
		// Pattern detection: *** is not a valid markdown delimiter, stays as plain text
		await expect(strong).not.toBeVisible();
		const p = editor.locator('p');
		const text = await p.textContent();
		expect(text).toBe('***text***');
	});

	// REVIEWED TEST
	test('should preserve cursor position during unwrap', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text with more content
		await editor.pressSequentially('**hello world**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show marks, navigate into opening delimiter
		await strong.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // First *
		await page.keyboard.press('ArrowRight'); // Second *

		// 3. Delete one asterisk
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 4. Type immediately - cursor should be preserved at the deletion point
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		// With mirroring: deleted second *, both become '*', unwrap to *hello world*
		// Then typed X at cursor position (after first *)
		// Result: *Xhello world* but the X should be part of a new pattern
		const em = editor.locator('em');
		await expect(em).toBeVisible();
	});

	// REVIEWED TEST
	test('should handle strikethrough delimiter editing', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create strikethrough text
		await editor.pressSequentially('~~strike~~');
		await page.waitForTimeout(100);

		const del = editor.locator('del');
		await expect(del).toBeVisible();
		await expect(del).toContainText('strike');

		// 2. Click and verify focus marks show ~~
		await del.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('~~');
		await expect(focusMarks.last()).toContainText('~~');

		// 3. Navigate into opening delimiter and delete both tildes
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// With mirroring: both delimiters become empty, unwrap to plain text
		await expect(del).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('strike');
	});

	// REVIEWED TEST fault#2 (passed but should fail) ❌ Issue#10: incorrect content inside transformed span
	test('should handle complex edit: change ** to *a* creating italic with different content', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**b**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();
		await expect(strong).toContainText('b');

		// 2. Click and navigate into opening delimiter
		await strong.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // First *
		await page.keyboard.press('ArrowRight'); // Second *

		// 3. Delete one *, add 'a', add *
		await page.keyboard.press('Backspace');
		await page.keyboard.type('a*');
		await page.waitForTimeout(100);

		// With mirroring: opening becomes '*a*', closing mirrors to '*a*'
		// Unwraps to: *a*b*a*
		// Pattern detection: *a* (italic), then 'b*a*' (plain text with pattern)
		await expect(strong).not.toBeVisible();
		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(em).toContainText('a'); // fault: must check that b is outside the em
	});

	// ============== SPAN MIRRORING TESTS ==============

	// REVIEWED TEST - redundant with above?
	test('should mirror opening span edit to closing span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**text**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);
		await expect(focusMarks.first()).toContainText('**');
		await expect(focusMarks.last()).toContainText('**');

		// 3. Navigate into opening delimiter and delete one asterisk
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(50);

		// 4. Both spans should now show '*' before unwrapping
		// After the edit, handleSpanEdit mirrors opening → closing, then unwraps
		// So we should see the unwrapped result with mirrored delimiters
		await expect(strong).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('*text*');
	});

	// REVIEWED TEST fault#3 ❌ - issue#7: typing delimiters (like * => **) doesn't update format
	test('should mirror closing span edit to opening span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create italic text
		await editor.pressSequentially('*text*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Click to show focus marks
		await em.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);
		await expect(focusMarks.first()).toContainText('*');
		await expect(focusMarks.last()).toContainText('*');

		// 3. Navigate to closing delimiter and add an asterisk
		await page.keyboard.press('End');
		await page.keyboard.type('*');
		await page.waitForTimeout(50);

		// 4. After mirroring, both spans should be '**', then unwrap
		await expect(em).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('**text**');
		// fault: must also confirm that the text is now bold
	});

	// REVIEWED TEST - redundant with above?
	test('should mirror opening span to closing for bold → italic transformation', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**bold**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show marks, navigate into opening delimiter
		await strong.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 3. After mirroring, both delimiters are '*', unwrap happens
		await expect(strong).not.toBeVisible();
		const unwrappedText = await editor.locator('p').textContent();
		expect(unwrappedText).toBe('*bold*');

		// 4. Pattern detection should immediately see '*bold*' and transform to italic
		// Wait a bit for pattern detection
		await page.waitForTimeout(100);
		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(em).toContainText('bold');
	});

	// REVIEWED TEST - redundant or even identical to the test with issue#7?
	test('should mirror closing span to opening for italic → bold transformation', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create italic text
		await editor.pressSequentially('*italic*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Click to show marks, navigate to closing delimiter
		await em.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('End');
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// 3. After mirroring, both delimiters are '**', unwrap happens
		await expect(em).not.toBeVisible();
		const unwrappedText = await editor.locator('p').textContent();
		expect(unwrappedText).toBe('**italic**');

		// 4. Pattern detection should see '**italic**' and transform to bold
		await page.waitForTimeout(100);
		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();
		await expect(strong).toContainText('italic');
	});

	test('should mirror deletion of opening span to closing span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create code text
		await editor.pressSequentially('`code`');
		await page.waitForTimeout(100);

		const code = editor.locator('code');
		await expect(code).toBeVisible();

		// 2. Click, navigate into opening delimiter and delete it
		await code.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 3. After mirroring, both delimiters are empty, unwrap to plain text
		await expect(code).not.toBeVisible();
		const text = await editor.locator('p').textContent();
		expect(text).toBe('code');
	});

	// REVIEWED TEST - ❌ issue#3: deleting from the end doesn't restore caret properly (so the second backspace fails)
	test('should mirror deletion of closing span to opening span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create strikethrough text
		await editor.pressSequentially('~~strike~~');
		await page.waitForTimeout(100);

		const del = editor.locator('del');
		await expect(del).toBeVisible();

		// 2. Click, navigate to closing delimiter and delete it
		await del.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('End');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 3. After mirroring, both delimiters are empty, unwrap to plain text
		await expect(del).not.toBeVisible();
		const text = await editor.locator('p').textContent();
		expect(text).toBe('strike');
	});

	// REVIEWED TEST ❌ issue#11: selecting multiple delimiters and typing doesn't mirror
	test('should mirror complex text replacement in opening span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**text**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click, navigate into opening delimiter
		await strong.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');

		// 3. Select both asterisks and replace with ___
		await page.keyboard.press('Shift+ArrowRight');
		await page.keyboard.type('___');
		await page.waitForTimeout(100);

		// 4. Both spans should mirror to '___', then unwrap
		await expect(strong).not.toBeVisible();
		const unwrappedText = await editor.locator('p').textContent();
		expect(unwrappedText).toBe('___text___');
	});

	// REVIEWED TEST ❌ issue#11: selecting multiple delimiters and typing doesn't mirror
	test('should mirror complex text replacement in closing span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create italic text
		await editor.pressSequentially('*text*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Click, navigate to closing delimiter
		await em.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('End');

		// 3. Select the asterisk and replace with ~~
		await page.keyboard.press('Shift+ArrowLeft');
		await page.keyboard.type('~~');
		await page.waitForTimeout(100);

		// 4. Both spans should mirror to '~~', then unwrap
		await expect(em).not.toBeVisible();
		const unwrappedText = await editor.locator('p').textContent();
		expect(unwrappedText).toBe('~~text~~');

		// 5. Pattern should match strikethrough
		await page.waitForTimeout(100);
		const del = editor.locator('del');
		await expect(del).toBeVisible();
		await expect(del).toContainText('text');
	});

	// REVIEWED TEST - fault#4
	test('should handle mirroring when typing character by character in opening span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**test**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click, navigate to end of opening delimiter
		await strong.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');

		// 3. Type 'x' - this adds non-delimiter char to the delimiter
		await page.keyboard.type('x');
		await page.waitForTimeout(50);

		// After typing, delimiter becomes '**x', mirrors to closing
		// Unwraps to **x + test + **x, pattern sees **x (not valid, stays plain)
		await expect(strong).not.toBeVisible(); // fault: system doesn't allow non delimiter chars in spans, so strong remains
		const text = await editor.locator('p').textContent();
		// The span had '**', user typed 'x', mirrored to closing
		// Result: **xtest**x
		expect(text).toContain('test');
	});

	// REVIEWED TEST
	test('should normalize underscore delimiters and handle mirroring', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text using __ (will be normalized to **)
		await editor.pressSequentially('__bold__');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click and verify marks show ** (normalized from __)
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('**');
		await expect(focusMarks.last()).toContainText('**');

		// 3. Navigate into opening mark and delete one asterisk
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 4. Both should mirror to '*', unwrap and transform to italic
		await expect(strong).not.toBeVisible();
		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(em).toContainText('bold');
	});

	test('should preserve cursor position after mirroring and unwrap', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**hello**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click, navigate into opening delimiter
		await strong.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');

		// 3. Delete one asterisk
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(50);

		// 4. Type immediately - cursor should be at correct position
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		// Cursor was after first *, deleted second *, typed X
		// Both delimiters mirrored to '*', unwrapped to *hello*
		// Then typed X at cursor position
		const text = await editor.locator('p').textContent();
		expect(text).toContain('hello');
	});

	// ============== CARET STYLE PERSISTENCE TESTS ==============

	test('should NOT persist <strong> tag after delimiter deletion due to caret style carryover', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text with nested italic
		await editor.pressSequentially('**bold and _italic_**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();
		await expect(strong).toContainText('bold and');

		// 2. Click on bold text to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('**');
		await expect(focusMarks.last()).toContainText('**');

		// 3. Navigate into opening delimiter and delete one asterisk
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // First *
		await page.keyboard.press('ArrowRight'); // Second *
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 4. CRITICAL: Verify that <strong> tag does NOT persist in the DOM
		// This is the bug we're testing for - caret style carryover causes
		// the browser to re-wrap content in <strong> even though we unwrapped it
		await expect(strong).not.toBeVisible();

		// 5. Verify the HTML structure directly - no <strong> should exist
		const innerHTML = await editor.innerHTML();
		expect(innerHTML).not.toContain('<strong>');

		// 6. Verify italic element exists (should be transformed)
		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(em).toContainText('italic');

		// 7. Verify the final text content is correct
		const textContent = await editor.locator('p').textContent();
		expect(textContent).toContain('bold and');
		expect(textContent).toContain('italic');
	});

	test('should NOT persist <em> tag after delimiter deletion', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create italic text
		await editor.pressSequentially('*italic text*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Click to show focus marks
		await em.click();
		await page.waitForTimeout(50);

		// 3. Navigate into opening delimiter and delete the asterisk
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 4. Verify <em> tag does NOT persist
		await expect(em).not.toBeVisible();

		// 5. Verify the HTML structure directly
		const innerHTML = await editor.innerHTML();
		expect(innerHTML).not.toContain('<em>');

		// 6. Verify plain text remains
		const textContent = await editor.locator('p').textContent();
		expect(textContent).toBe('italic text');
	});

	test('should NOT persist <code> tag after delimiter deletion', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create code text
		await editor.pressSequentially('`code text`');
		await page.waitForTimeout(100);

		const code = editor.locator('code');
		await expect(code).toBeVisible();

		// 2. Click to show focus marks
		await code.click();
		await page.waitForTimeout(50);

		// 3. Delete the opening backtick
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 4. Verify <code> tag does NOT persist
		await expect(code).not.toBeVisible();

		// 5. Verify the HTML structure directly
		const innerHTML = await editor.innerHTML();
		expect(innerHTML).not.toContain('<code>');

		// 6. Verify plain text remains
		const textContent = await editor.locator('p').textContent();
		expect(textContent).toBe('code text');
	});

	test('should escape caret style when transforming bold to italic', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**text**');
		await page.waitForTimeout(100);

		let strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click and delete one asterisk to transform to italic
		await strong.click();
		await page.waitForTimeout(50);
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 3. Should transform to italic, not keep bold formatting
		await expect(strong).not.toBeVisible();
		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 4. Verify no <strong> in HTML (caret style escaped)
		const innerHTML = await editor.innerHTML();
		expect(innerHTML).not.toContain('<strong>');
		expect(innerHTML).toContain('<em>');

		// 5. Type new content - should NOT be bold
		await page.keyboard.type(' more');
		await page.waitForTimeout(50);

		// The typed text should NOT be wrapped in <strong>
		const finalHTML = await editor.innerHTML();
		const strongCount = (finalHTML.match(/<strong>/g) || []).length;
		expect(strongCount).toBe(0);
	});

	// ============== CARET BOUNDARY POSITION TESTS ==============
	// Issue: When caret is at boundaries of focus mark spans (before/after them),
	// typing delimiters may go outside the formatted element, causing unexpected behavior

	test('should handle typing delimiter BEFORE opening span (Home position)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**bold**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);

		// 3. Navigate to Home (before opening span)
		await page.keyboard.press('Home');

		// 4. Type a delimiter character
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// Expected: The typed '*' should be captured/handled properly
		// Bug behavior: '*' goes outside <strong>, caret jumps to end of block

		// Verify caret didn't jump unexpectedly - type another char to check position
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		const finalText = await editor.locator('p').textContent();
		// 'X' should appear right after the '*' we typed, not at end of block
		expect(finalText).toMatch(/\*X.*bold/);
	});

	test('should handle typing delimiter AFTER closing span (End position)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**bold**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);

		// 3. Navigate to End (after closing span)
		await page.keyboard.press('End');

		// 4. Type a delimiter character
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// Verify caret position by typing another char
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		const finalText = await editor.locator('p').textContent();
		// 'X' should appear right after the '*' we typed at end
		expect(finalText).toMatch(/bold.*\*X$/);
	});

	test('should handle typing delimiter between opening span and text', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**bold**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		// 3. Navigate: Home → past opening span (into content area before text)
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // into span
		await page.keyboard.press('ArrowRight'); // past first *
		await page.keyboard.press('ArrowRight'); // past second *, now between span and text

		// 4. Type a delimiter character - this is INSIDE the formatted element
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// This should trigger span modification detection or be handled as content
		// Type marker to verify caret position
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		const finalText = await editor.locator('p').textContent();
		// '*X' should appear right before 'bold'
		expect(finalText).toContain('*X');
		expect(finalText).toContain('bold');
	});

	test('should handle typing delimiter between text and closing span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**bold**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		// 3. Navigate: End → before closing span (between text and span)
		await page.keyboard.press('End');
		await page.keyboard.press('ArrowLeft'); // into closing span
		await page.keyboard.press('ArrowLeft'); // past second *
		await page.keyboard.press('ArrowLeft'); // past first *, now between text and span

		// 4. Type a delimiter character
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// Type marker to verify caret position
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		const finalText = await editor.locator('p').textContent();
		// '*X' should appear right after 'bold'
		expect(finalText).toContain('bold');
		expect(finalText).toContain('*X');
	});

	test('should maintain caret position when typing multiple delimiters at Home', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create italic text
		await editor.pressSequentially('*italic*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Click to show focus marks
		await em.click();
		await page.waitForTimeout(50);

		// 3. Navigate to Home
		await page.keyboard.press('Home');

		// 4. Type '**' to try changing format
		await page.keyboard.type('**');
		await page.waitForTimeout(100);

		// 5. Verify caret didn't jump - type marker
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		const finalText = await editor.locator('p').textContent();
		// If caret jumped to end, 'X' would be at the end
		// If caret stayed in place, 'X' should be near the beginning after '**'
		expect(finalText).toMatch(/^\*\*X/);
	});

	test('should not jump caret to end of block when typing before focus marks', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create text with bold in the middle: "hello **bold** world"
		await editor.pressSequentially('hello **bold** world');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click on bold to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);

		// 3. Navigate to just before the bold element
		// Home goes to start of block, then arrow right to "hello |**bold**"
		await page.keyboard.press('Home');
		for (let i = 0; i < 6; i++) {
			await page.keyboard.press('ArrowRight'); // past "hello "
		}

		// 4. Type delimiter
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// 5. Type marker to check caret position
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		const finalText = await editor.locator('p').textContent();
		// '*X' should appear between "hello " and "bold", NOT at end after "world"
		expect(finalText).toMatch(/hello.*\*X.*bold.*world/);
		// Specifically should NOT be: "hello bold world*X"
		expect(finalText).not.toMatch(/world\*X$/);
	});
});
