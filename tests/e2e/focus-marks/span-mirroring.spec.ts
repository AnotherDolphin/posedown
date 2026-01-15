import { test, expect } from '@playwright/test'

const EDITOR_URL = '/test'

test.describe('Rich Editor - Focus Mark Span Mirroring', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EDITOR_URL)
		await page.waitForLoadState('networkidle')

		// Clear the editor
		const editor = page.locator('[role="article"][contenteditable="true"]')
		await editor.click()
		await page.keyboard.press('Control+a')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(50) // a small buffer
	})

	// REVIEWED TEST
	test('should mirror opening span edit to closing span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create bold text
		await editor.pressSequentially('**text**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// 2. Click to show focus marks
		await strong.click()
		await page.waitForTimeout(50)

		const focusMarks = editor.locator('.pd-focus-mark')
		await expect(focusMarks).toHaveCount(2)
		await expect(focusMarks.first()).toContainText('**')
		await expect(focusMarks.last()).toContainText('**')

		// 3. Navigate into opening delimiter and delete one asterisk
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(50)

		// 4. '*' IS a SUPPORTED_INLINE_DELIMITER, so mirroring works
		// Both spans should now show '*' before unwrapping
		// After the edit, handleSpanEdit mirrors opening → closing, then unwraps
		// So we should see the unwrapped result with mirrored delimiters
		await expect(strong).not.toBeVisible()
		await expect(editor.locator('p')).toContainText('*text*')
	})

	// REVIEWED TEST ❌ - issue#7: typing delimiters (like * => **) doesn't update format
	test('should mirror closing span edit to opening span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create italic text
		await editor.pressSequentially('*text*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// 2. Click to show focus marks
		await em.click()
		await page.waitForTimeout(50)

		const focusMarks = editor.locator('.pd-focus-mark')
		await expect(focusMarks).toHaveCount(2)
		await expect(focusMarks.first()).toContainText('*')
		await expect(focusMarks.last()).toContainText('*')

		// 3. Navigate to closing delimiter and add an asterisk
		await page.keyboard.press('End')
		await page.keyboard.type('*')
		await page.waitForTimeout(50)

		// 4. '**' IS a SUPPORTED_INLINE_DELIMITER, so mirroring works
		// After mirroring, both spans should be '**', then unwrap
		await expect(em).not.toBeVisible()
		await expect(editor.locator('p')).toContainText('**text**')

		// 5. Verify that pattern detection transforms the text to bold
		await page.waitForTimeout(100) // Wait for pattern detection
		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()
		await expect(strong).toContainText('text')
	})

	// REVIEWED TEST - redundant with above?
	// REDUNDANCY NOTE: Overlaps with tests above but NOT fully redundant because:
	// - Tests the FULL flow: mirror → unwrap → pattern detection → transformation
	// - Checks intermediate unwrapped state ('*bold*') explicitly at line ~349
	// - Then waits and verifies pattern detection creates italic element
	// - More comprehensive than just checking mirroring or just checking transformation
	test('should mirror opening span to closing for bold → italic transformation', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create bold text
		await editor.pressSequentially('**bold**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// 2. Click to show marks, navigate into opening delimiter
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(100)

		// 3. '*' IS a SUPPORTED_INLINE_DELIMITER, so mirroring works
		// After mirroring, both delimiters are '*', unwrap happens
		await expect(strong).not.toBeVisible()
		const unwrappedText = await editor.locator('p').textContent()
		expect(unwrappedText).toBe('*bold*')

		// 4. Pattern detection should immediately see '*bold*' and transform to italic
		// Wait a bit for pattern detection
		await page.waitForTimeout(100)
		const em = editor.locator('em')
		await expect(em).toBeVisible()
		await expect(em).toContainText('bold')
	})

	// REVIEWED TEST
	test('should mirror deletion of opening span to closing span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create code text
		await editor.pressSequentially('`code`')
		await page.waitForTimeout(100)

		const code = editor.locator('code')
		await expect(code).toBeVisible()

		// 2. Click, navigate into opening delimiter and delete it
		await code.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(100)

		// 3. '`' is a SUPPORTED_INLINE_DELIMITER, and empty string (complete deletion) is allowed
		// After mirroring, both delimiters are empty, unwrap to plain text
		await expect(code).not.toBeVisible()
		const text = await editor.locator('p').textContent()
		expect(text).toBe('code')
	})

	// REVIEWED TEST - ❌ issue#3: deleting from the end doesn't restore caret properly (so the second backspace fails)
	test('should mirror deletion of closing span to opening span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create strikethrough text
		await editor.pressSequentially('~~strike~~')
		await page.waitForTimeout(100)

		const del = editor.locator('del')
		await expect(del).toBeVisible()

		// 2. Click, navigate to closing delimiter and delete it
		await del.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('End')
		await page.keyboard.press('Backspace')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(100)

		// 3. '~~' is a SUPPORTED_INLINE_DELIMITER, and empty string (complete deletion) is allowed
		// After mirroring, both delimiters are empty, unwrap to plain text
		await expect(del).not.toBeVisible()
		const text = await editor.locator('p').textContent()
		expect(text).toBe('strike')
	})

	// REVIEWED TEST - Mirroring only allows SUPPORTED_INLINE_DELIMITERS
	test('should reject unsupported delimiter during mirroring', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create bold text
		await editor.pressSequentially('**text**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// 2. Click and navigate to end of opening delimiter
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight') // First *
		await page.keyboard.press('ArrowRight') // Second *

		// 3. Try to add extra asterisk
		await page.keyboard.type('*')
		await page.waitForTimeout(100)

		// Mirroring only allows SUPPORTED_INLINE_DELIMITERS ('*', '**', '_', '__', '~~', '`')
		// '***' is NOT supported, so the third asterisk is rejected
		// Strong tag remains visible with original '**' delimiters
		await expect(strong).toBeVisible()
		await expect(strong).toContainText('text')
	})

	// REVIEWED TEST ❌ issue#11: selecting multiple delimiters and typing doesn't mirror
	test('should mirror complex text replacement in opening span', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create bold text
		await editor.pressSequentially('**text**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// 2. Click, navigate into opening delimiter
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')

		// 3. Select both asterisks and replace with ___
		await page.keyboard.press('Shift+ArrowRight')
		await page.keyboard.type('___')
		await page.waitForTimeout(100)

		// 4. Mirroring only allows SUPPORTED_INLINE_DELIMITERS
		// '___' is NOT supported, so the replacement is rejected
		// Strong tag remains visible with original '**' delimiters
		await expect(strong).toBeVisible()
		await expect(strong).toContainText('text')
	})

	// REVIEWED TEST ❌ issue#11: selecting multiple delimiters and typing doesn't mirror
	test('should mirror complex text replacement in closing span with supported delimiter', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create italic text
		await editor.pressSequentially('*text*')
		await page.waitForTimeout(100)

		const em = editor.locator('em')
		await expect(em).toBeVisible()

		// 2. Click, navigate to closing delimiter
		await em.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('End')

		// 3. Select the asterisk and replace with ~~
		await page.keyboard.press('Shift+ArrowLeft')
		await page.keyboard.type('~~')
		await page.waitForTimeout(100)

		// 4. '~~' IS a SUPPORTED_INLINE_DELIMITER, so mirroring works
		// Both spans should mirror to '~~', then unwrap
		await expect(em).not.toBeVisible()
		const unwrappedText = await editor.locator('p').textContent()
		expect(unwrappedText).toBe('~~text~~')

		// 5. Pattern should match strikethrough
		await page.waitForTimeout(100)
		const del = editor.locator('del')
		await expect(del).toBeVisible()
		await expect(del).toContainText('text')
	})

	// REVIEWED TEST
	test('should handle mirroring when typing character by character in opening span', async ({
		page
	}) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create bold text
		await editor.pressSequentially('**test**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// 2. Click, navigate to end of opening delimiter
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')

		// 3. Type 'x' - this adds non-delimiter char to the delimiter
		await page.keyboard.type('x')
		await page.waitForTimeout(50)

		// Mirroring only allows SUPPORTED_INLINE_DELIMITERS ('*', '**', '_', '__', '~~', '`')
		// '**x' is NOT a supported delimiter (contains non-delimiter character)
		// System should reject this change, so strong remains visible with original '**' delimiters
		await expect(strong).toBeVisible()
		await expect(strong).toContainText('test')
		const text = await editor.locator('p').textContent()
		// The span had '**', user typed 'x', mirrored to closing
		// Result: **xtest**x (but strong should remain because system rejects the non-delimiter char)
		expect(text).toContain('test')
	})

	// REVIEWED TEST
	test('should normalize underscore delimiters and handle mirroring', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. '__' IS a SUPPORTED_INLINE_DELIMITER (will be normalized to '**' for display)
		// Create bold text using __
		await editor.pressSequentially('__bold__')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// 2. Click and verify marks show ** (normalized from __)
		await strong.click()
		await page.waitForTimeout(50)

		const focusMarks = editor.locator('.pd-focus-mark')
		await expect(focusMarks.first()).toContainText('**')
		await expect(focusMarks.last()).toContainText('**')

		// 3. Navigate into opening mark and delete one asterisk
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(100)

		// 4. '*' IS a SUPPORTED_INLINE_DELIMITER, so mirroring works
		// Both should mirror to '*', unwrap and transform to italic
		await expect(strong).not.toBeVisible()
		const em = editor.locator('em')
		await expect(em).toBeVisible()
		await expect(em).toContainText('bold')
	})

	// REVIEWED TEST
	test('should preserve cursor position after mirroring and unwrap', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create bold text
		await editor.pressSequentially('**hello**')
		await page.waitForTimeout(100)

		const strong = editor.locator('strong')
		await expect(strong).toBeVisible()

		// 2. Click, navigate into opening delimiter
		await strong.click()
		await page.waitForTimeout(50)

		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')

		// 3. Delete one asterisk
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(50)

		// 4. Type immediately - cursor should be at correct position
		await page.keyboard.type('X')
		await page.waitForTimeout(50)

		// '*' IS a SUPPORTED_INLINE_DELIMITER, so mirroring works
		// Cursor was after first *, deleted second *, typed X
		// Both delimiters mirrored to '*', unwrapped to *hello*
		// Then typed X at cursor position → *Xhello*
		// Pattern detection should create italic with 'Xhello'
		const em = editor.locator('em')
		await expect(em).toBeVisible()
		await expect(em).toContainText('Xhello')

		// Verify X is right before 'hello'
		const emText = await em.textContent()
		expect(emText).toContain('Xhello')
	})

	// REVIEWED TEST - issue#11: deleting into a non-pattern (~~ => ~) doesn't mirror 1 nor 2 backspaces
	test('should handle strikethrough delimiter editing', async ({ page }) => {
		const editor = page.locator('[role="article"][contenteditable="true"]')

		// 1. Create strikethrough text
		await editor.pressSequentially('~~strike~~')
		await page.waitForTimeout(100)

		const del = editor.locator('del')
		await expect(del).toBeVisible()
		await expect(del).toContainText('strike')

		// 2. Click and verify focus marks show ~~
		await del.click()
		await page.waitForTimeout(50)

		const focusMarks = editor.locator('.pd-focus-mark')
		await expect(focusMarks.first()).toContainText('~~')
		await expect(focusMarks.last()).toContainText('~~')

		// 3. Navigate into opening delimiter and delete both tildes
		await page.keyboard.press('Home')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('Backspace')
		await page.keyboard.press('Backspace')
		await page.waitForTimeout(100)

		// '~~' is a SUPPORTED_INLINE_DELIMITER, and empty string (complete deletion) is allowed
		// With mirroring: both delimiters become empty, unwrap to plain text
		await expect(del).not.toBeVisible()
		const text = await editor.locator('p').textContent()
		expect(text).toBe('strike')
	})
})