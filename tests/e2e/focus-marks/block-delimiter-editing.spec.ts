import { test, expect } from '@playwright/test';

const EDITOR_URL = '/test';

test.describe('Rich Editor - Block Delimiter Editing', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL);
		await page.waitForLoadState('networkidle');

		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]');
		await editor.click();
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(50);
	});

	test('should upgrade H1 to H2 when typing # in the middle of delimiter span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Type "# Title" to create H1
		await editor.pressSequentially('# Title');
		await page.waitForTimeout(100);

		const h1 = editor.locator('h1');
		await expect(h1).toBeVisible();
		await expect(h1).toContainText('Title');

		// 2. Click at the beginning to show focus marks
		await h1.click();
		await page.waitForTimeout(50);

		const focusMark = editor.locator('.pd-focus-mark');
		await expect(focusMark).toBeVisible();
		await expect(focusMark).toContainText('# ');

		// 3. Navigate into the delimiter span (between # and space)
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // Move to after #

		// 4. Type # to upgrade to H2
		await page.keyboard.type('#');
		await page.waitForTimeout(100);

		// 5. Verify H1 is gone and H2 is created
		await expect(h1).not.toBeVisible();
		const h2 = editor.locator('h2');
		await expect(h2).toBeVisible();
		await expect(h2).toContainText('Title');
	});

	test('should upgrade H2 to H3 when typing # at end of delimiter span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Type "## Title" to create H2
		await editor.pressSequentially('## Title');
		await page.waitForTimeout(100);

		const h2 = editor.locator('h2');
		await expect(h2).toBeVisible();

		// 2. Click to show focus marks
		await h2.click();
		await page.waitForTimeout(50);

		const focusMark = editor.locator('.pd-focus-mark');
		await expect(focusMark).toContainText('## ');

		// 3. Navigate to end of delimiter span (before the space)
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // First #
		await page.keyboard.press('ArrowRight'); // Second #

		// 4. Type # to upgrade to H3
		await page.keyboard.type('#');
		await page.waitForTimeout(100);

		// 5. Verify H2 is gone and H3 is created
		await expect(h2).not.toBeVisible();
		const h3 = editor.locator('h3');
		await expect(h3).toBeVisible();
		await expect(h3).toContainText('Title');
	});

	test('should downgrade H2 to H1 when deleting # from delimiter span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Type "## Title" to create H2
		await editor.pressSequentially('## Title');
		await page.waitForTimeout(100);

		const h2 = editor.locator('h2');
		await expect(h2).toBeVisible();

		// 2. Click to show focus marks
		await h2.click();
		await page.waitForTimeout(50);

		// 3. Navigate into delimiter span
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // First #
		await page.keyboard.press('ArrowRight'); // Second #

		// 4. Delete one # using backspace
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 5. Verify H2 is gone and H1 is created
		await expect(h2).not.toBeVisible();
		const h1 = editor.locator('h1');
		await expect(h1).toBeVisible();
		await expect(h1).toContainText('Title');
	});

	test('should convert to paragraph when deleting all # from delimiter span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Type "# Title" to create H1
		await editor.pressSequentially('# Title');
		await page.waitForTimeout(100);

		const h1 = editor.locator('h1');
		await expect(h1).toBeVisible();

		// 2. Click to show focus marks
		await h1.click();
		await page.waitForTimeout(50);

		// 3. Navigate into delimiter span and delete the #
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // First #
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(100);

		// 4. Verify H1 is gone and content is in paragraph
		await expect(h1).not.toBeVisible();
		const p = editor.locator('p');
		await expect(p).toBeVisible();
		await expect(p).toContainText('Title');
	});

	test('should handle invalid delimiter gracefully', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Type "# Title" to create H1
		await editor.pressSequentially('# Title');
		await page.waitForTimeout(100);

		const h1 = editor.locator('h1');
		await expect(h1).toBeVisible();

		// 2. Click to show focus marks
		await h1.click();
		await page.waitForTimeout(50);

		// 3. Navigate into delimiter span and type invalid character
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // After #
		await page.keyboard.type('abc'); // Invalid delimiter
		await page.waitForTimeout(100);

		// 4. Should unwrap to paragraph since "#abc " is not a valid heading delimiter
		await expect(h1).not.toBeVisible();
		const p = editor.locator('p');
		await expect(p).toBeVisible();
	});

	test('should preserve content when upgrading heading levels', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Type "# Hello **world**" to create H1 with bold text
		await editor.pressSequentially('# Hello **world**');
		await page.waitForTimeout(100);

		const h1 = editor.locator('h1');
		await expect(h1).toBeVisible();
		const strong = h1.locator('strong');
		await expect(strong).toContainText('world');

		// 2. Click at start to show focus marks
		await page.keyboard.press('Home');
		await page.waitForTimeout(50);

		// 3. Navigate into delimiter span and add #
		await page.keyboard.press('ArrowRight'); // After #
		await page.keyboard.type('#');
		await page.waitForTimeout(100);

		// 4. Verify content and formatting are preserved in H2
		await expect(h1).not.toBeVisible();
		const h2 = editor.locator('h2');
		await expect(h2).toBeVisible();
		const strongInH2 = h2.locator('strong');
		await expect(strongInH2).toContainText('world');
		await expect(h2).toContainText('Hello');
	});
});
