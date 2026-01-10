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
		await expect(em).toContainText('bold');
	});

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
		await expect(em).toContainText('a');
	});

	// ============== SPAN MIRRORING TESTS ==============

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
	});

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
		await expect(strong).not.toBeVisible();
		const text = await editor.locator('p').textContent();
		// The span had '**', user typed 'x', mirrored to closing
		// Result: **xtest**x
		expect(text).toContain('test');
	});

	test('should handle mirroring with underscore delimiter variants', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text using __
		await editor.pressSequentially('__bold__');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click and verify marks show __
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('__');
		await expect(focusMarks.last()).toContainText('__');

		// 3. Navigate into opening mark and delete one underscore
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 4. Both should mirror to '_', unwrap and transform to italic
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
});
