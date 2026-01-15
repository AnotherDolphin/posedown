import { test, expect } from '@playwright/test';

const EDITOR_URL = '/test';

test.describe('Rich Editor - Focus Mark Caret Style Persistence', () => {
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
});
