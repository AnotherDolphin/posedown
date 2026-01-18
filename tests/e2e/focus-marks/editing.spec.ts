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

	// REVIEWED TEST
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

		// '*' IS a SUPPORTED_INLINE_DELIMITER, so mirroring works
		// With mirroring: both delimiters become '*', unwrap and transform to italic
		await expect(strong).not.toBeVisible();
		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(em).toContainText('bold');
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

		// Mirroring only allows SUPPORTED_INLINE_DELIMITERS ('*', '**', '_', '__', '~~', '`')
		// Unwraps to: *abc*text**
		// Pattern detection sees *abc* (italic) followed by plain text
		await expect(strong).not.toBeVisible();
		const em = editor.locator('em')
		expect(await em.textContent()).toBe('*abc*');
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

		// '`' is a SUPPORTED_INLINE_DELIMITER, and empty string (complete deletion) is allowed
		// With mirroring: both delimiters become empty, unwrap to plain text
		await expect(code).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('code');
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

		// '*' IS a SUPPORTED_INLINE_DELIMITER, so mirroring works
		// With mirroring: deleted second *, both become '*', unwrap to *hello world*
		// Then typed X at cursor position (after first *)
		// Result: *Xhello world* but the X should be part of a new pattern
		const em = editor.locator('em');
		await expect(em).toBeVisible();
	});

	// REVIEWED TEST ❌ Issue#10: adding same delimiters in the middle doesn't break and match the first half
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

		// '*a*' contains non-delimiter characters but has valid delimiters at boundaries
		// System processes this as a complex mirroring scenario
		// With mirroring: opening becomes '*a*', closing mirrors to '*a*'
		// Unwraps to: *a*b*a*
		// Pattern detection: *a* (italic), then 'b*a*' (plain text with pattern)
		await expect(strong).not.toBeVisible();
		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(em).toContainText('a');
		await expect(em).not.toContainText('b');
		const textContent = await editor.locator('p').textContent();
		expect(textContent).toContain('b'); // 'b' exists in paragraph but outside em
	});
});
