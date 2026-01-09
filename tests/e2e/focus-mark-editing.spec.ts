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

		// 2. Click on the bold text to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('**');
		await expect(focusMarks.last()).toContainText('**');

		// 3. Click inside the opening focus mark span and delete one asterisk
		await focusMarks.first().click();
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// The <strong> should unwrap to plain text
		await expect(strong).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('*bold**');

		// 4. Navigate to closing delimiter and delete one asterisk
		await page.keyboard.press('End');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// Now it should match italic pattern
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

		// 2. Click to show focus marks and click into opening mark
		await strong.click();
		await page.waitForTimeout(50);

		const openingMark = editor.locator('.pd-focus-mark').first();
		await openingMark.click();

		// 3. Type 'abc' inside the opening mark span
		await page.keyboard.type('abc');
		await page.waitForTimeout(100);

		// Should unwrap and include the typed chars as plain text
		await expect(strong).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('**abctext**');
	});

	test('should unwrap completely when deleting all delimiters', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create code text
		await editor.pressSequentially('`code`');
		await page.waitForTimeout(100);

		const code = editor.locator('code');
		await expect(code).toBeVisible();
		await expect(code).toContainText('code');

		// 2. Click to show focus marks
		await code.click();
		await page.waitForTimeout(50);

		const openingMark = editor.locator('.pd-focus-mark').first();
		await expect(openingMark).toContainText('`');

		// 3. Select all text in opening mark and delete
		await openingMark.click();
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Delete');
		await page.waitForTimeout(100);

		// Should unwrap to plain text with only closing delimiter
		await expect(code).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('code`');
	});

	test('should keep mismatched delimiters as plain text', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**text**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click and edit opening delimiter to add extra asterisk
		await strong.click();
		await page.waitForTimeout(50);

		const openingMark = editor.locator('.pd-focus-mark').first();
		await openingMark.click();
		await page.keyboard.press('End');
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// Should unwrap due to mismatch: *** vs **
		await expect(strong).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('***text**');

		// Verify it stays as plain text (no formatting applied)
		const p = editor.locator('p');
		const innerHTML = await p.innerHTML();
		expect(innerHTML).toBe('***text**');
	});

	test('should preserve cursor position during unwrap', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text with more content
		await editor.pressSequentially('**hello world**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show marks and edit opening delimiter
		await strong.click();
		await page.waitForTimeout(50);

		const openingMark = editor.locator('.pd-focus-mark').first();
		await openingMark.click();
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 3. Type immediately - cursor should be preserved
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		// Text should have X inserted at cursor position (where the deleted * was)
		await expect(editor.locator('p')).toContainText('*Xhello world**');
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

		// 3. Delete opening delimiter completely
		const openingMark = focusMarks.first();
		await openingMark.click();
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Delete');
		await page.waitForTimeout(100);

		// Should unwrap to plain text
		await expect(del).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('strike~~');
	});

	test('should handle complex edit: change ** to *a* creating italic with different content', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**b**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();
		await expect(strong).toContainText('b');

		// 2. Click and edit opening mark: ** → *a*
		await strong.click();
		await page.waitForTimeout(50);

		const openingMark = editor.locator('.pd-focus-mark').first();
		await openingMark.click();

		// Delete one *, add 'a', add *
		await page.keyboard.press('Backspace');
		await page.keyboard.type('a*');
		await page.waitForTimeout(100);

		// Should unwrap to: *a*b**
		await expect(strong).not.toBeVisible();
		await expect(editor.locator('p')).toContainText('*a*b**');

		// 3. Navigate to end and fix closing delimiter: ** → nothing (already matched by *a*)
		await page.keyboard.press('End');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// Now should match: *a* (italic) followed by plain 'b'
		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(em).toContainText('a');

		const pHtml = await editor.locator('p').innerHTML();
		expect(pHtml).toBe('<em>a</em>b');
	});
});
