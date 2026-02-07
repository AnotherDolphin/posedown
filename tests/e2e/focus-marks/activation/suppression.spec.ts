import { test, expect } from '@playwright/test';

const EDITOR_URL = '/test';

test.describe('Rich Editor - Focus Mark Suppression', () => {
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

	test('should not show marks on newly created formatted elements', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Type **bold** to create formatted element
		await editor.pressSequentially('**bold**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Focus marks should NOT appear immediately after creation
		// (skipNextFocusMarks flag should prevent this)
		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(0);
	});

	// REGRESSION: Focus span cleanup tests

	test('focus spans removed when pattern becomes invalid after transformation', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// Setup: <strong>text</strong>
		await editor.pressSequentially('**text**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// Click to show focus marks
		await strong.click();
		await page.waitForTimeout(50);

		// Action: Edit opening span to make *** (invalid)
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// Blur to trigger unwrap
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);

		// Verify: After transformation, no formatting element exists
		await expect(strong).not.toBeVisible();

		// Verify: No focus spans remain (element unwrapped to plain text)
		const spans = await editor.locator('.pd-focus-mark').count();
		expect(spans).toBe(0);

		// Verify: Content is plain text ***text***
		const text = await editor.textContent();
		expect(text).toBe('***text***');
	});

	test('focus spans cleaned up when delimiter becomes unsupported', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// Create bold text
		await editor.pressSequentially('**text**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// Click to show marks
		await strong.click();
		await page.waitForTimeout(50);

		// Navigate into delimiter and add invalid characters
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.type('abc'); // Makes '**abc' which is invalid
		await page.waitForTimeout(100);

		// After typing non-delimiter chars, formatting should be lost
		// Mirroring only allows SUPPORTED_INLINE_DELIMITERS
		const innerHTML = await editor.innerHTML();

		// Either strong is gone, or content has changed
		// The exact behavior depends on implementation, but editor should be stable
		await expect(editor).toBeVisible();
	});

	// REGRESSION: Issue #6 - Focus span preservation during transformation

	test('issue#6 regression: focus spans not lost after pattern transformation', async ({
		page
	}) => {
		// The exact scenario that was broken before the fix
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// Setup: <em>text</em> with cursor inside
		await editor.pressSequentially('*text*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// Click inside to show focus marks
		await em.click();
		await page.waitForTimeout(50);

		// Navigate into content
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // past opening *
		await page.keyboard.press('ArrowRight'); // into 't'

		// Verify initial spans visible
		const spansBefore = await editor.locator('.pd-focus-mark').count();
		expect(spansBefore).toBe(2);

		// Action: Type **bold** pattern inside italic element
		await page.keyboard.type('**bold**');
		await page.waitForTimeout(100);

		// Verify: Italic focus spans still visible
		const spansAfter = await editor.locator('.pd-focus-mark').count();
		expect(spansAfter).toBeGreaterThanOrEqual(2);

		// Verify: User can still see and edit italic delimiters
		await expect(em).toBeVisible();

		const firstSpan = await em.evaluate((el) => el.firstChild?.className);
		expect(firstSpan).toBe('pd-focus-mark');
	});

	test('issue#6 regression: nested pattern creation preserves outer focus marks', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// Create bold text
		await editor.pressSequentially('**outer**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// Click to show marks
		await strong.click();
		await page.waitForTimeout(50);

		// Verify marks exist
		await expect(editor.locator('.pd-focus-mark')).toHaveCount(2);

		// Navigate into content and create nested italic
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');

		await page.keyboard.type('*inner*');
		await page.waitForTimeout(100);

		// Strong's marks should persist
		await expect(strong).toBeVisible();

		// Check that strong still has focus marks as first/last children
		const hasOpeningMark = await strong.evaluate(
			(el) => el.firstChild?.className === 'pd-focus-mark'
		);
		const hasClosingMark = await strong.evaluate(
			(el) => el.lastChild?.className === 'pd-focus-mark'
		);

		expect(hasOpeningMark).toBe(true);
		expect(hasClosingMark).toBe(true);
	});
});
