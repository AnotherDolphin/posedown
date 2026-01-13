import { test, expect } from '@playwright/test';

const EDITOR_URL = '/test';

test.describe('Rich Editor - Focus Mark Activation', () => {
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

	// ============== ISSUE#34: ADJACENT NODE DETECTION ==============

	test('should show marks for nested element when cursor at edge (issue#34)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create nested bold and italic: **bold and *italic***
		await editor.pressSequentially('**bold and *italic***');
		await page.waitForTimeout(100);

		// Verify structure: <strong>bold and <em>italic</em></strong>
		const strong = editor.locator('strong');
		const em = strong.locator('em');
		await expect(strong).toBeVisible();
		await expect(em).toBeVisible();
		await expect(em).toContainText('italic');

		// 2. Position cursor right before <em> (at "and |")
		await strong.click();
		await page.waitForTimeout(50);

		// Navigate: Home → "bold and |"
		await page.keyboard.press('Home');
		for (let i = 0; i < 9; i++) { // "bold and " = 9 chars
			await page.keyboard.press('ArrowRight');
		}
		await page.waitForTimeout(50);

		// 3. Verify focus marks show for <em>, not <strong>
		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);
		await expect(focusMarks.first()).toContainText('*');
		await expect(focusMarks.last()).toContainText('*');

		// The marks should be inside <em>, not <strong>
		await expect(em.locator('.pd-focus-mark').first()).toBeVisible();
	});

	test('should show marks for element directly after cursor in adjacent text node (issue#34)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create: "text *italic*"
		await editor.pressSequentially('text *italic*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Position cursor right before <em> (at "text |")
		const p = editor.locator('p');
		await p.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // t
		await page.keyboard.press('ArrowRight'); // e
		await page.keyboard.press('ArrowRight'); // x
		await page.keyboard.press('ArrowRight'); // t
		await page.keyboard.press('ArrowRight'); // space
		await page.waitForTimeout(50);

		// 3. Verify focus marks show for <em>
		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);
		await expect(focusMarks.first()).toContainText('*');
		await expect(focusMarks.last()).toContainText('*');
	});

	test('should show marks for element directly before cursor in adjacent text node (issue#34)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create: "*italic* text"
		await editor.pressSequentially('*italic* text');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Position cursor right after <em> (at "|text")
		const p = editor.locator('p');
		await p.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // *
		await page.keyboard.press('ArrowRight'); // i
		await page.keyboard.press('ArrowRight'); // t
		await page.keyboard.press('ArrowRight'); // a
		await page.keyboard.press('ArrowRight'); // l
		await page.keyboard.press('ArrowRight'); // i
		await page.keyboard.press('ArrowRight'); // c
		await page.keyboard.press('ArrowRight'); // *
		await page.waitForTimeout(50);

		// 3. Verify focus marks show for <em>
		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);
		await expect(focusMarks.first()).toContainText('*');
		await expect(focusMarks.last()).toContainText('*');
	});

	test('should prioritize child element over parent when cursor at edge (issue#34)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create: "**bold with _italic_ inside**"
		await editor.pressSequentially('**bold with _italic_ inside**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		const em = strong.locator('em');
		await expect(strong).toBeVisible();
		await expect(em).toBeVisible();

		// 2. Position cursor at "with |" (right before <em>)
		await strong.click();
		await page.waitForTimeout(50);

		await page.keyboard.press('Home');
		for (let i = 0; i < 10; i++) { // "bold with " = 10 chars
			await page.keyboard.press('ArrowRight');
		}
		await page.waitForTimeout(50);

		// 3. Should show _ marks for <em>, not ** marks for <strong>
		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);
		await expect(focusMarks.first()).toContainText('_');
		await expect(focusMarks.last()).toContainText('_');
	});

	// ============== BASIC ACTIVATION TESTS ==============

	test('should show focus marks when clicking inside formatted element', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold text
		await editor.pressSequentially('**bold**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Initially, no focus marks should be visible
		let focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(0);

		// 3. Click inside bold text
		await strong.click();
		await page.waitForTimeout(50);

		// 4. Focus marks should now be visible
		focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);
		await expect(focusMarks.first()).toContainText('**');
		await expect(focusMarks.last()).toContainText('**');
	});

	test('should hide focus marks when clicking outside formatted element', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create text with bold
		await editor.pressSequentially('plain **bold** text');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click inside bold to show marks
		await strong.click();
		await page.waitForTimeout(50);

		let focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);

		// 3. Click outside bold (in plain text)
		const p = editor.locator('p');
		await p.click();
		await page.keyboard.press('Home'); // Go to start of line
		await page.waitForTimeout(50);

		// 4. Focus marks should be hidden
		focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(0);
	});

	test('should show different marks for different element types', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold, italic, and code
		await editor.pressSequentially('**bold** *italic* `code`');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		const em = editor.locator('em');
		const code = editor.locator('code');

		// 2. Click bold
		await strong.click();
		await page.waitForTimeout(50);

		let focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('**');

		// 3. Click italic
		await em.click();
		await page.waitForTimeout(50);

		focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('*');
		await expect(focusMarks.first()).not.toContainText('**');

		// 4. Click code
		await code.click();
		await page.waitForTimeout(50);

		focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('`');
	});

	test('should show marks with correct delimiter syntax (_ vs * for italic)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create italic with underscore
		await editor.pressSequentially('_italic_');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Click to show marks
		await em.click();
		await page.waitForTimeout(50);

		// 3. Should show _ not *
		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('_');
		await expect(focusMarks.last()).toContainText('_');
	});

	test('should show marks with correct delimiter syntax (__ vs ** for bold)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create bold with underscore
		await editor.pressSequentially('__bold__');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to show marks
		await strong.click();
		await page.waitForTimeout(50);

		// 3. Should show __ not **
		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('__');
		await expect(focusMarks.last()).toContainText('__');
	});

	test('should transition marks when navigating between nested elements', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create nested bold and italic
		await editor.pressSequentially('**bold and *italic***');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		const em = strong.locator('em');

		// 2. Click in "bold" part
		await strong.click();
		await page.waitForTimeout(50);
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowRight'); // Into "bold"
		await page.waitForTimeout(50);

		// 3. Should show ** marks
		let focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('**');

		// 4. Navigate into italic part
		for (let i = 0; i < 9; i++) { // Navigate to "italic"
			await page.keyboard.press('ArrowRight');
		}
		await page.waitForTimeout(50);

		// 5. Should now show * marks (transitioned from **)
		focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks.first()).toContainText('*');
		await expect(focusMarks.first()).not.toContainText('**');
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

	test('should show marks for block elements (headings)', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create heading
		await editor.pressSequentially('## Heading');
		await page.waitForTimeout(100);

		const h2 = editor.locator('h2');
		await expect(h2).toBeVisible();

		// 2. Click inside heading
		await h2.click();
		await page.waitForTimeout(50);

		// 3. Should show ## prefix mark
		const focusMark = editor.locator('.pd-focus-mark');
		await expect(focusMark).toHaveCount(1); // Block elements only have opening mark
		await expect(focusMark).toContainText('## ');
	});

	test('should show marks for blockquotes', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create blockquote
		await editor.pressSequentially('> Quote');
		await page.waitForTimeout(100);

		const blockquote = editor.locator('blockquote');
		await expect(blockquote).toBeVisible();

		// 2. Click inside blockquote
		await blockquote.click();
		await page.waitForTimeout(50);

		// 3. Should show > prefix mark
		const focusMark = editor.locator('.pd-focus-mark');
		await expect(focusMark).toHaveCount(1);
		await expect(focusMark).toContainText('> ');
	});

	test('should show marks for list items', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create unordered list
		await editor.pressSequentially('- Item');
		await page.waitForTimeout(100);

		const li = editor.locator('li');
		await expect(li).toBeVisible();

		// 2. Click inside list item
		await li.click();
		await page.waitForTimeout(50);

		// 3. Should show - prefix mark
		const focusMark = editor.locator('.pd-focus-mark');
		await expect(focusMark).toHaveCount(1);
		await expect(focusMark).toContainText('- ');
	});
});
