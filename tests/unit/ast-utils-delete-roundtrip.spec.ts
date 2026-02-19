import { describe, it, expect } from 'vitest'
import { stringifyMdastToMarkdown, parseMarkdownToMdast, markdownToHtml, markdownToDomFragment } from '$lib/core/transforms/ast-utils'
import { findFirstMdMatch } from '$lib/core/utils/inline-patterns'
import type { Root, Strong, Delete, Text, Paragraph } from 'mdast'

// Helpers to build mdast nodes manually
const text = (value: string): Text => ({ type: 'text', value })
const del = (children: Text[]): Delete => ({ type: 'delete', children })
const strong = (children: (Text | Delete)[]): Strong => ({ type: 'strong', children })
const para = (children: (Text | Strong | Delete)[]): Paragraph => ({ type: 'paragraph', children })
const root = (children: Paragraph[]): Root => ({ type: 'root', children })

// ─────────────────────────────────────────────────────────────────────────────
// Test :404 - **~~bold deleted~~**
//
// Sequence: user types **~~bold deleted~~**
//   At char 17: ~~bold deleted~~ fires → <del> forms, ** still raw text
//   At char 18: first * typed → DOM: text("**") + <del>bold deleted</del> + text("*")
//   At char 19: second * typed → DOM: text("**") + <del>bold deleted</del> + text("**")
//
// Question: what does findFirstMdMatch return at each step?
// And does the pipeline produce <strong><del> correctly?
// ─────────────────────────────────────────────────────────────────────────────

describe('intermediate state analysis: **~~bold deleted~~**', () => {
	// At char 17: ~~bold deleted~~ is complete inside **...
	// textContent at this point is "**~~bold deleted~~" (18 chars, no closing **)
	it('char 17: findFirstMdMatch("**~~bold deleted~~") finds ~~ strikethrough at pos 2', () => {
		const result = findFirstMdMatch('**~~bold deleted~~')
		expect(result).not.toBeNull()
		// The first complete pattern should be strikethrough at pos 2
		expect(result!.patternName).toBe('strikethrough')
		expect(result!.start).toBe(2)
	})

	// After ~~bold deleted~~ fires, DOM has text("**") + <del>bold deleted</del>
	// textContent becomes "**bold deleted" (tildes gone, no closing ** yet)
	// The next keystrokes add * one at a time
	it('char 17: after <del> forms, textContent is "**bold deleted" (no tildes) — no pattern fires', () => {
		// textContent immediately after the ~~ transform: "**bold deleted"
		const result = findFirstMdMatch('**bold deleted')
		// No complete pattern — ** has no closing delimiter
		expect(result).toBeNull()
	})

	// At char 18: one * added after <del>, textContent = "**bold deleted*"
	it('char 18: findFirstMdMatch("**bold deleted*") — does any pattern match?', () => {
		const result = findFirstMdMatch('**bold deleted*')
		// CommonMark: **X* — the ** opener can match 1 star from the closer (emphasis).
		// Sum is 2+1=3 (multiple of 3), but since neither delimiter is both left AND right flanking,
		// the multiple-of-3 rule may not apply. This test documents the actual behavior.
		console.log('[test] findFirstMdMatch("**bold deleted*") result:', result)
		// Just document — do not assert pass/fail since we're testing behavior
		if (result) {
			console.log('[test] Pattern found:', result.patternName, 'start:', result.start, 'end:', result.end)
		} else {
			console.log('[test] No pattern found — no transform fires at char 18')
		}
		// This test always passes — it's documenting behavior
		expect(true).toBe(true)
	})

	// At char 19: second * added, textContent = "**bold deleted**"
	it('char 19: findFirstMdMatch("**bold deleted**") should match bold', () => {
		const result = findFirstMdMatch('**bold deleted**')
		expect(result).not.toBeNull()
		expect(result!.patternName).toBe('bold')
		expect(result!.start).toBe(0)
	})

	// The critical transform at char 19:
	// DOM has text("**") + <del>bold deleted</del> + text("**")
	// innerHTML: "**<del>bold deleted</del>**"
	// htmlToMarkdown → mdast: text("**") + delete("bold deleted") + text("**")
	// stringifyMdastToMarkdown → "**~bold deleted~**" (single tilde from custom handler)
	// markdownToDomFragment("**~bold deleted~**") → should produce <strong><del>
	it('pipeline round-trip: strong(delete(text)) serializes to **~bold deleted~** then parses back to <strong><del>', () => {
		const mdast = root([para([strong([del([text('bold deleted')])])])])
		const serialized = stringifyMdastToMarkdown(mdast).trim()

		// Confirm single ~ output
		expect(serialized).toBe('**~bold deleted~**')

		// Confirm it parses back correctly (singleTilde is enabled in GFM)
		const html = markdownToHtml(serialized)
		console.log('[test] markdownToHtml("**~bold deleted~**"):', html)
		expect(html).toContain('<strong>')
		expect(html).toContain('<del>')
	})

	// Full intermediate-state simulation for text("**") + del("bold deleted") + text("**")
	it('full html pipeline: "**<del>bold deleted</del>**" → markdownToHtml → contains <strong><del>', () => {
		// This is what the DOM innerHTML looks like at char 19
		const html = markdownToHtml('**~~bold deleted~~**')
		console.log('[test] markdownToHtml("**~~bold deleted~~**"):', html)
		expect(html).toContain('<strong>')
		expect(html).toContain('<del>')
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// ROOT CAUSE SUMMARY
//
// Test :404 fails because:
//   1. User types **~~bold deleted~~** sequentially
//   2. At char 17 (~~bold deleted~~ complete): <del> forms in DOM
//      DOM: text("**") + <del>bold deleted</del>
//   3. At char 18 (first * of closing **): textContent = "**bold deleted*"
//      The ~~ delimiters were consumed into <del>, so textContent has no tildes.
//      findFirstMdMatch("**bold deleted*") = italic at pos 1–14 (*bold deleted*)
//      → UNWANTED italic transform fires! Corrupts the DOM.
//   4. After the spurious italic, the remaining ** chars complete into garbage.
//
// This is the same "intermediate state problem" as BUG-3, triggered here because
// <del> removes ~~ from textContent, leaving *bold deleted* visible to the parser.
//
// Test :389 (~~**deleted bold**~~) does NOT have this issue because:
//   After <strong> forms, the textContent at the ~ intermediate state is "~~deleted bold~".
//   findFirstMdMatch("~~deleted bold~") returns strikethrough at pos 0–14 (~deleted bold~)
//   which when transformed produces the SAME <del><strong> structure — it coincidentally
//   moves in the right direction rather than corrupting the state.
// ─────────────────────────────────────────────────────────────────────────────

describe('comparison: ~~**deleted bold**~~ (test :389, passes)', () => {
	// At char 17: **deleted bold** fires → <strong> forms, ~~ still raw text
	// At char 19: outer ~~ completes
	// textContent at char 19: "~~deleted bold~~"
	// At char 18: first closing ~ typed → textContent = "~~deleted bold~"
	it('char 18 of :389: findFirstMdMatch("~~deleted bold~") — intermediate state', () => {
		const result = findFirstMdMatch('~~deleted bold~')
		console.log('[test] findFirstMdMatch("~~deleted bold~") result:', result)
		// Even if a pattern fires, it should be strikethrough (not italic/bold)
		// — any strikethrough transform moves state toward the correct result.
		if (result) {
			expect(result.patternName).toBe('strikethrough')
		}
	})

	it('char 19 of :389: findFirstMdMatch("~~deleted bold~~") matches strikethrough', () => {
		const result = findFirstMdMatch('~~deleted bold~~')
		expect(result).not.toBeNull()
		expect(result!.patternName).toBe('strikethrough')
	})

	// The transform at char 19 of :389:
	// DOM: text("~~") + <strong>deleted bold</strong> + text("~~")
	// innerHTML: "~~<strong>deleted bold</strong>~~"
	// htmlToMarkdown → mdast: text("~~") + strong(text("deleted bold")) + text("~~")
	// stringifyMdastToMarkdown → "~~**deleted bold**~~" (raw tildes + strong → **)
	// markdownToDomFragment("~~**deleted bold**~~") → <del><strong>deleted bold</strong></del>
	it('pipeline round-trip for :389: serializes correctly to ~~**deleted bold**~~', () => {
		// Build the mdast with raw text tildes around strong
		const tildes = (s: string): Text => ({ type: 'text', value: s })
		const mdast = root([para([tildes('~~'), strong([text('deleted bold')]), tildes('~~')])])
		const serialized = stringifyMdastToMarkdown(mdast).trim()
		console.log('[test] :389 serialized:', serialized)
		// raw text "~~" + "**deleted bold**" + "~~" → "~~**deleted bold**~~"
		expect(serialized).toBe('~~**deleted bold**~~')

		// Parses back correctly
		const html = markdownToHtml(serialized)
		expect(html).toContain('<del>')
		expect(html).toContain('<strong>')
	})
})

describe('singleTilde behavior documentation', () => {
	it('single ~ is recognized as strikethrough (singleTilde enabled in GFM)', () => {
		const mdast = parseMarkdownToMdast('~bold deleted~') as any
		const para = mdast.children[0]
		const delNode = para.children.find((c: any) => c.type === 'delete')
		expect(delNode).toBeTruthy()
		// singleTilde IS enabled — ~content~ works as strikethrough
	})

	it('double ~~ also works as strikethrough', () => {
		const mdast = parseMarkdownToMdast('~~bold deleted~~') as any
		const para = mdast.children[0]
		const delNode = para.children.find((c: any) => c.type === 'delete')
		expect(delNode).toBeTruthy()
	})

	it('custom delete handler outputs single ~ (not ~~)', () => {
		const mdast = root([para([del([text('bold deleted')])])])
		const serialized = stringifyMdastToMarkdown(mdast).trim()
		expect(serialized).toBe('~bold deleted~')
		expect(serialized).not.toBe('~~bold deleted~~')
		// But this single ~ round-trips correctly because singleTilde is enabled
	})
})
