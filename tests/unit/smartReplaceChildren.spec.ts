import { describe, it, expect, beforeEach, vi } from 'vitest'
import { smartReplaceChildren } from '../../src/lib/core/dom/smartReplaceChildren'
import { JSDOM } from 'jsdom'

/**
 * Unit tests for smartReplaceChildren - DOM reconciliation with caret restoration
 *
 * This function is critical for preserving caret position during markdown
 * pattern transformations. These tests verify:
 * 1. Caret offset calculation and restoration
 * 2. Delimiter adjustment logic
 * 3. Focus mark preservation during transforms
 * 4. Node reconciliation (replace, append, remove, preserve)
 */

describe('smartReplaceChildren', () => {
	let dom: JSDOM
	let document: Document
	let parent: HTMLElement
	let selection: Selection

	beforeEach(() => {
		// Setup DOM environment
		dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
			url: 'http://localhost' // Fix localStorage error
		})
		document = dom.window.document
		global.document = document
		global.window = dom.window as any
		global.Node = dom.window.Node
		global.Range = dom.window.Range
		global.Selection = dom.window.Selection

		// Create parent element
		parent = document.createElement('p')
		document.body.appendChild(parent)

		// Setup selection
		selection = dom.window.getSelection()!
	})

	describe('Caret Offset Calculation', () => {
		it('should calculate offset from start of parent to caret', () => {
			// Setup: parent with text "hello world", caret after "hello"
			parent.textContent = 'hello world'
			const textNode = parent.firstChild as Text
			const range = document.createRange()
			range.setStart(textNode, 5)
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: replace with same content
			const newFragment = document.createDocumentFragment()
			const newText = document.createTextNode('hello world')
			newFragment.appendChild(newText)

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: caret at same position (offset 5)
			expect(selection.anchorOffset).toBe(5)
			expect(selection.anchorNode?.textContent).toBe('hello world')
		})

		it('should handle caret in nested element', () => {
			// Setup: parent with <em>italic</em> text, caret inside em
			parent.innerHTML = '<em>italic</em> text'
			const em = parent.querySelector('em')!
			const textNode = em.firstChild as Text
			const range = document.createRange()
			range.setStart(textNode, 3) // after "ita"
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: replace with same content
			const newFragment = document.createDocumentFragment()
			const newEm = document.createElement('em')
			newEm.textContent = 'italic'
			const newText = document.createTextNode(' text')
			newFragment.appendChild(newEm)
			newFragment.appendChild(newText)

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: caret at offset 3 inside em
			expect(selection.anchorOffset).toBe(3)
			expect(selection.anchorNode?.textContent).toBe('italic')
		})
	})

	describe('Delimiter Adjustment Logic', () => {
		it('should subtract both delimiters when caret AFTER pattern end', () => {
			// Setup: "**bold** text" with caret after bold (offset 8)
			parent.textContent = '**bold** text'
			const textNode = parent.firstChild as Text
			const range = document.createRange()
			range.setStart(textNode, 8) // after "**bold**"
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: **bold** → <strong>bold</strong>
			const newFragment = document.createDocumentFragment()
			const strong = document.createElement('strong')
			strong.textContent = 'bold'
			const text = document.createTextNode(' text')
			newFragment.appendChild(strong)
			newFragment.appendChild(text)

			// Pattern match: delimiters at positions 0-2 and 6-8
			const patternMatch = { start: 0, end: 8, delimiterLength: 2 }

			smartReplaceChildren(parent, newFragment, selection, patternMatch)

			// Verify: caret at end of "bold" inside <strong> (offset 4 = 8 - 2*2)
			const newStrong = parent.querySelector('strong')!
			const boldText = newStrong.firstChild as Text
			expect(selection.anchorNode).toBe(boldText)
			expect(selection.anchorOffset).toBe(4) // at end of "bold"
		})

		it('should subtract opening delimiter when caret INSIDE pattern', () => {
			// Setup: "**bold**" with caret in middle (offset 4 = after "**bo")
			parent.textContent = '**bold**'
			const textNode = parent.firstChild as Text
			const range = document.createRange()
			range.setStart(textNode, 4) // after "**bo"
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: **bold** → <strong>bold</strong>
			const newFragment = document.createDocumentFragment()
			const strong = document.createElement('strong')
			strong.textContent = 'bold'
			newFragment.appendChild(strong)

			const patternMatch = { start: 0, end: 8, delimiterLength: 2 }

			smartReplaceChildren(parent, newFragment, selection, patternMatch)

			// Verify: caret at offset 2 inside <strong> (4 - 2 opening delimiter)
			expect(selection.anchorNode?.textContent).toBe('bold')
			expect(selection.anchorOffset).toBe(2) // after "bo"
		})

		it('should not adjust offset when caret BEFORE pattern', () => {
			// Setup: "text **bold**" with caret before bold (offset 5)
			parent.textContent = 'text **bold**'
			const textNode = parent.firstChild as Text
			const range = document.createRange()
			range.setStart(textNode, 5) // after "text "
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: **bold** → <strong>bold</strong>
			const newFragment = document.createDocumentFragment()
			const text1 = document.createTextNode('text ')
			const strong = document.createElement('strong')
			strong.textContent = 'bold'
			newFragment.appendChild(text1)
			newFragment.appendChild(strong)

			const patternMatch = { start: 5, end: 13, delimiterLength: 2 }

			smartReplaceChildren(parent, newFragment, selection, patternMatch)

			// Verify: caret at same position (offset 5)
			expect(selection.anchorOffset).toBe(5)
		})
	})

	describe('Focus Mark Preservation', () => {
		it('should preserve focus marks when editing (changing delimiter)', () => {
			// Setup: <em><span>*</span>italic<span>*</span></em> with caret at end of "italic"
			parent.innerHTML = '<em><span class="pd-focus-mark">*</span>italic<span class="pd-focus-mark">*</span></em>'
			const em = parent.querySelector('em')!
			const textNode = em.childNodes[1] as Text // "italic" text node
			const range = document.createRange()
			range.setStart(textNode, 6) // at end of "italic"
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: user typed * at end, upgrading *italic* → **bold**
			const newFragment = document.createDocumentFragment()
			const strong = document.createElement('strong')
			strong.textContent = 'italic' // same content, different format
			newFragment.appendChild(strong)

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: focus marks were preserved (cloned to new element)
			const newStrong = parent.querySelector('strong')!
			expect(newStrong.querySelector('.pd-focus-mark')).toBeTruthy()

			// Should have both opening and closing focus marks
			const focusMarks = newStrong.querySelectorAll('.pd-focus-mark')
			expect(focusMarks.length).toBe(2)
			expect(newStrong.firstChild).toBe(focusMarks[0])
			expect(newStrong.lastChild).toBe(focusMarks[1])
		})

		it('should preserve focus marks when deleting (backspacing delimiter)', () => {
			// Setup: <strong><span>**</span>bold<span>**</span></strong> with caret at start of closing span
			parent.innerHTML = '<strong><span class="pd-focus-mark">**</span>bold<span class="pd-focus-mark">**</span></strong>'
			const strong = parent.querySelector('strong')!
			const closingSpan = strong.lastChild as HTMLElement
			const spanText = closingSpan.firstChild as Text
			const range = document.createRange()
			range.setStart(spanText, 0) // at start of closing "**"
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: user backspaced one *, downgrading **bold** → *italic*
			const newFragment = document.createDocumentFragment()
			const em = document.createElement('em')
			em.textContent = 'bold' // same content, different format
			newFragment.appendChild(em)

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: focus marks were preserved
			const newEm = parent.querySelector('em')!
			const focusMarks = newEm.querySelectorAll('.pd-focus-mark')
			expect(focusMarks.length).toBe(2)
		})

		it('should restore caret to correct position after reinjecting focus marks', () => {
			// Setup: <em><span>*</span>italic<span>*</span></em> with caret at end of content
			parent.innerHTML = '<em><span class="pd-focus-mark">*</span>italic<span class="pd-focus-mark">*</span></em>'
			const em = parent.querySelector('em')!
			const textNode = em.childNodes[1] as Text // "italic" text node
			const range = document.createRange()
			range.setStart(textNode, 6) // at end of "italic" (before closing delimiter)
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform with pattern match (simulating delimiter removal then re-injection)
			const newFragment = document.createDocumentFragment()
			const strong = document.createElement('strong')
			strong.textContent = 'italic'
			newFragment.appendChild(strong)

			// Pattern match: delimiters at 0-1 and 7-8 in "*italic*"
			const patternMatch = { start: 0, end: 8, delimiterLength: 1 }

			smartReplaceChildren(parent, newFragment, selection, patternMatch)

			// Verify: focus marks preserved
			const newStrong = parent.querySelector('strong')!
			const closingSpan = newStrong.lastChild as HTMLElement
			expect(closingSpan.className).toBe('pd-focus-mark')

			// After reinjection, structure is: <strong><span>*</span>italic<span>*</span></strong>
			// Original caret was at end of "italic" content (offset 7 in "*italic*")
			// Caret should stay at end of content text, not jump into closing span
			// This matches e2e behavior: caret inside content stays inside content

			const caretNode = selection.anchorNode
			const caretOffset = selection.anchorOffset
			const contentTextNode = newStrong.childNodes[1] // "italic" text node

			expect(caretNode).toBe(contentTextNode)
			expect(caretOffset).toBe(6) // end of "italic"
		})
	})

	describe('Node Reconciliation', () => {
		it('should preserve identical nodes', () => {
			// Setup: parent with two text nodes
			const text1 = document.createTextNode('hello')
			const text2 = document.createTextNode(' world')
			parent.appendChild(text1)
			parent.appendChild(text2)

			// Set caret in first text node
			const range = document.createRange()
			range.setStart(text1, 3)
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: same content, so nodes should be preserved
			const newFragment = document.createDocumentFragment()
			const newText1 = document.createTextNode('hello')
			const newText2 = document.createTextNode(' world')
			newFragment.appendChild(newText1)
			newFragment.appendChild(newText2)

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: original nodes preserved (same references)
			expect(parent.childNodes[0]).toBe(text1)
			expect(parent.childNodes[1]).toBe(text2)
			// Caret should still be in original text node
			expect(selection.anchorNode).toBe(text1)
			expect(selection.anchorOffset).toBe(3)
		})

		it('should remove extra old nodes', () => {
			// Setup: parent with 3 nodes
			parent.appendChild(document.createTextNode('one'))
			parent.appendChild(document.createTextNode('two'))
			parent.appendChild(document.createTextNode('three'))

			const range = document.createRange()
			range.setStart(parent.firstChild!, 0)
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: new content has only 2 nodes
			const newFragment = document.createDocumentFragment()
			newFragment.appendChild(document.createTextNode('one'))
			newFragment.appendChild(document.createTextNode('two'))

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: third node removed
			expect(parent.childNodes.length).toBe(2)
			expect(parent.textContent).toBe('onetwo')
		})

		it('should append extra new nodes', () => {
			// Setup: parent with 1 node
			parent.appendChild(document.createTextNode('one'))

			const range = document.createRange()
			range.setStart(parent.firstChild!, 0)
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: new content has 3 nodes
			const newFragment = document.createDocumentFragment()
			newFragment.appendChild(document.createTextNode('one'))
			newFragment.appendChild(document.createTextNode('two'))
			newFragment.appendChild(document.createTextNode('three'))

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: new nodes appended
			expect(parent.childNodes.length).toBe(3)
			expect(parent.textContent).toBe('onetwothree')
		})

		it('should replace different nodes', () => {
			// Setup: parent with <em>text</em>
			const em = document.createElement('em')
			em.textContent = 'italic'
			parent.appendChild(em)

			const range = document.createRange()
			range.setStart(em.firstChild!, 3)
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: replace with <strong>text</strong>
			const newFragment = document.createDocumentFragment()
			const strong = document.createElement('strong')
			strong.textContent = 'bold'
			newFragment.appendChild(strong)

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: em replaced with strong
			expect(parent.querySelector('em')).toBeNull()
			expect(parent.querySelector('strong')).toBeTruthy()
			expect(parent.textContent).toBe('bold')
		})
	})

	describe('Fallback Behavior', () => {
		it('should place caret at end if restoration fails', () => {
			// Setup: parent with text, but caret in detached node (impossible to restore)
			parent.textContent = 'hello'
			const detachedNode = document.createTextNode('detached')
			const range = document.createRange()
			range.setStart(detachedNode, 0)
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: replace with new content
			const newFragment = document.createDocumentFragment()
			newFragment.appendChild(document.createTextNode('world'))

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: caret placed at end (fallback)
			expect(parent.textContent).toBe('world')
			expect(selection.anchorNode).toBe(parent.lastChild)
			expect(selection.anchorOffset).toBe(5) // end of "world"
		})

		it('should handle empty parent gracefully', () => {
			// Setup: empty parent
			parent.textContent = ''

			const range = document.createRange()
			range.setStart(parent, 0)
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: add content
			const newFragment = document.createDocumentFragment()
			newFragment.appendChild(document.createTextNode('content'))

			smartReplaceChildren(parent, newFragment, selection, null)

			// Verify: content added, caret at end
			expect(parent.textContent).toBe('content')
			expect(selection.anchorNode?.textContent).toBe('content')
		})
	})

	describe('Edge Cases', () => {
		it('should handle caret inside focus mark span', () => {
			// Issue #1 noted in code: caret inside focus mark can cause negative offset
			// Setup: <em><span>*</span>text<span>*</span></em> with caret INSIDE opening span
			parent.innerHTML = '<em><span class="pd-focus-mark">*</span>italic<span class="pd-focus-mark">*</span></em>'
			const em = parent.querySelector('em')!
			const openingSpan = em.firstChild as HTMLElement
			const spanText = openingSpan.firstChild as Text
			const range = document.createRange()
			range.setStart(spanText, 1) // inside the "*" of opening span
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform with pattern match
			const newFragment = document.createDocumentFragment()
			const strong = document.createElement('strong')
			strong.textContent = 'bold'
			newFragment.appendChild(strong)

			const patternMatch = { start: 0, end: 8, delimiterLength: 1 }

			// Should NOT throw or create negative offset
			expect(() => {
				smartReplaceChildren(parent, newFragment, selection, patternMatch)
			}).not.toThrow()

			// Verify: caret is somewhere reasonable (not negative offset)
			expect(selection.anchorOffset).toBeGreaterThanOrEqual(0)
		})

		it('should handle unicode characters correctly', () => {
			// Setup: text with emoji
			parent.textContent = '**emoji 😀**'
			const textNode = parent.firstChild as Text
			const range = document.createRange()
			range.setStart(textNode, 9) // after "**emoji 😀"
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform
			const newFragment = document.createDocumentFragment()
			const strong = document.createElement('strong')
			strong.textContent = 'emoji 😀'
			newFragment.appendChild(strong)

			const patternMatch = { start: 0, end: 12, delimiterLength: 2 }

			smartReplaceChildren(parent, newFragment, selection, patternMatch)

			// Verify: transformation succeeded
			expect(parent.querySelector('strong')?.textContent).toBe('emoji 😀')
		})

		it('should handle nested formatted elements', () => {
			// Setup: **bold *italic* text**
			parent.innerHTML = '**bold <em>italic</em> text**'
			const textNode = parent.childNodes[2] as Text // " text**"
			const range = document.createRange()
			range.setStart(textNode, 5) // after " text"
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)

			// Transform: convert to <strong>bold <em>italic</em> text</strong>
			const newFragment = document.createDocumentFragment()
			const strong = document.createElement('strong')
			const em = document.createElement('em')
			em.textContent = 'italic'
			strong.appendChild(document.createTextNode('bold '))
			strong.appendChild(em)
			strong.appendChild(document.createTextNode(' text'))
			newFragment.appendChild(strong)

			const patternMatch = { start: 0, end: 29, delimiterLength: 2 }

			smartReplaceChildren(parent, newFragment, selection, patternMatch)

			// Verify: nested structure preserved
			const newStrong = parent.querySelector('strong')!
			expect(newStrong.querySelector('em')).toBeTruthy()
			expect(newStrong.textContent).toBe('bold italic text')
		})
	})
})
