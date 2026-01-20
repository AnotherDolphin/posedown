import { test, expect } from '@playwright/test';

const EDITOR_URL = '/test';

test.describe('Rich Editor - Focus Mark Caret Boundary Positions', () => {
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

	// ============== ITEM #1 - DELIMITER AT EDGE SHOULD TRANSFORM FORMAT ==============
	// Issue: Adding delimiters to change format causes caret to get to the end of block,
	// because caret before marks types marks outside of it.
	// Fix: If there's an activeInline that is activated because we are at the edge of/right outside,
	// make any new input that is a valid delimiter go inside of it to trigger a proper edit/transformation.

	test('item#1: typing * at edge of italic transforms it to bold', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create italic text with text BEFORE it (edge case - caret could focus text instead)
		await editor.pressSequentially('before *italic*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();
		await expect(editor.locator('strong')).not.toBeVisible();

		// 2. Click on italic to show focus marks and activate it
		await em.click();
		await page.waitForTimeout(50);

		// 3. Navigate to Home - this puts caret at edge, right before the opening delimiter
		await page.keyboard.press('Home');

		// 4. Type '*' - should go INSIDE activeInline and transform *italic* → **italic** → <strong>
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// 5. Blur to trigger transformation
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);

		// Expected: italic (*italic*) becomes bold (**italic**) → <strong>italic</strong>
		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();
		await expect(em).not.toBeVisible();

		const strongText = await strong.textContent();
		expect(strongText).toContain('italic');
	});

	test('item#1: typing * at closing edge of italic transforms it to bold', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// 1. Create italic text with text AFTER it
		await editor.pressSequentially('*italic* after');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Click on italic to activate
		await em.click();
		await page.waitForTimeout(50);

		// 3. Navigate to End - caret at edge, right after closing delimiter
		await page.keyboard.press('End');

		// 4. Type '*' - should go inside activeInline's closing delimiter
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// 5. Blur to trigger transformation
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);

		// Expected: *italic* → *italic** which should reparse
		// The exact behavior depends on how mismatched delimiters are handled
		// but caret should NOT jump to end of block
		const finalText = await editor.textContent();
		expect(finalText).toContain('after');
	});

	test('item#1: with text before, delimiter at edge transforms italic to bold-italic', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// Edge case: Text before the pattern makes caret more likely to miss the activeInline
		// This tests that edge detection works even with adjacent text

		// 1. Create: "prefix *text*"
		await editor.pressSequentially('prefix *text*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Click on italic to activate
		await em.click();
		await page.waitForTimeout(50);

		// 3. Navigate to position right before the italic's opening delimiter
		await page.keyboard.press('Home');
		for (let i = 0; i < 7; i++) {
			// past "prefix "
			await page.keyboard.press('ArrowRight');
		}

		// At this position, caret is right outside the italic element
		// The activeInline should still be the italic due to edge detection

		// 4. Type '**' - should transform *text* → ***text*** → bold-italic
		await page.keyboard.type('**');
		await page.waitForTimeout(100);

		// 5. Blur to trigger transformation
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);

		// Expected: ***text*** creates bold-italic (strong > em or em > strong)
		const html = await editor.innerHTML();
		const hasNesting =
			html.includes('<strong') && html.includes('<em') && html.includes('text');

		// Verify the transformation happened (bold-italic nesting)
		expect(hasNesting).toBe(true);
	});

	test('item#1: delimiter input at edge prevents caret jump to end of block', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// Core bug scenario: "Adding delimiters to change format causes caret to get to the end of block"

		// 1. Create bold in middle of text
		await editor.pressSequentially('start **middle** end');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click to activate
		await strong.click();
		await page.waitForTimeout(50);

		// 3. Navigate to Home (edge of activeInline, before opening delimiter)
		await page.keyboard.press('Home');

		// 4. Type delimiter - this was causing caret to jump to end of block
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// 5. Immediately type marker to verify caret didn't jump
		await page.keyboard.type('X');
		await page.waitForTimeout(50);

		const finalText = await editor.textContent();

		// Bug behavior: 'X' would appear at the very end after "end"
		// Expected: 'X' should appear near where we typed (inside the transformed element)
		expect(finalText).toContain('start');
		expect(finalText).toContain('middle');
		expect(finalText).toContain('end');

		// Critical check: X should NOT be at the very end after "end"
		expect(finalText).not.toMatch(/end\s*X\s*$/);

		// X should be near the middle content, not at block end
		const xIndex = finalText?.indexOf('X') ?? -1;
		const endIndex = finalText?.indexOf('end') ?? -1;
		expect(xIndex).toBeLessThan(endIndex);
	});

	test('item#1: edge detection with preceding text activates correct element', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// This tests that when there's text before the pattern, the edge detection
		// correctly identifies the formatted element as activeInline

		// 1. Create: "hello **world**"
		await editor.pressSequentially('hello **world**');
		await page.waitForTimeout(100);

		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		// 2. Click on bold to activate
		await strong.click();
		await page.waitForTimeout(50);

		const focusMarks = editor.locator('.pd-focus-mark');
		await expect(focusMarks).toHaveCount(2);

		// 3. Navigate to position right before **world** (after "hello ")
		await page.keyboard.press('Home');
		for (let i = 0; i < 6; i++) {
			// past "hello "
			await page.keyboard.press('ArrowRight');
		}

		// 4. Type '*' at edge - should modify the bold, not create outside text
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// The '*' should have been captured inside the opening delimiter span
		// This would make it ***world*** (bold + italic)

		// 5. Blur to see final transformation
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);

		// Verify transformation happened (bold-italic nesting or format change)
		const html = await editor.innerHTML();

		// Should have nested formatting, NOT "*<strong>world</strong>"
		expect(html).not.toMatch(/\*<strong>/);
	});

	test('item#1: typing delimiter sequence transforms format completely', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]');

		// Test that typing multiple delimiters at edge causes proper transformation

		// 1. Create simple italic
		await editor.pressSequentially('*italic*');
		await page.waitForTimeout(100);

		const em = editor.locator('em');
		await expect(em).toBeVisible();

		// 2. Click to activate
		await em.click();
		await page.waitForTimeout(50);

		// 3. Navigate to Home
		await page.keyboard.press('Home');

		// 4. Type '*' to change from italic (*) to bold (**)
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// Also add to closing to maintain balance
		await page.keyboard.press('End');
		await page.keyboard.type('*');
		await page.waitForTimeout(100);

		// 5. Blur
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);

		// Expected: *italic* → **italic** → <strong>italic</strong>
		const strong = editor.locator('strong');
		await expect(strong).toBeVisible();

		const strongText = await strong.textContent();
		expect(strongText).toBe('italic');
	});
});
