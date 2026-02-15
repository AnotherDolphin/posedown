import { describe, it, expect } from 'vitest'
import { findFirstMarkdownMatch, findFirstMdMatch } from '$lib/core/utils/inline-patterns'

// Cases where both functions should agree
const commonCases = [
	{ input: '**bold**',       expected: { start: 0,  end: 8,  patternName: 'bold',             delimiterLength: 2 } },
	{ input: '*italic*',       expected: { start: 0,  end: 8,  patternName: 'italic',           delimiterLength: 1 } },
	{ input: '_italic_',       expected: { start: 0,  end: 8,  patternName: 'italicUnderscore', delimiterLength: 1 } },
	{ input: '__underline__',  expected: { start: 0,  end: 13, patternName: 'underline',        delimiterLength: 2 } },
	{ input: '`code`',         expected: { start: 0,  end: 6,  patternName: 'code',             delimiterLength: 1 } },
	{ input: '~~strike~~',     expected: { start: 0,  end: 10, patternName: 'strikethrough',    delimiterLength: 2 } },
	{ input: 'hello **bold**', expected: { start: 6,  end: 14, patternName: 'bold',             delimiterLength: 2 } },
]

describe('findFirstMdMatch', () => {
	describe('backwards compatible with findFirstMarkdownMatch', () => {
		for (const { input, expected } of commonCases) {
			it(`"${input}"`, () => {
				const result = findFirstMdMatch(input)
				expect(result).not.toBeNull()
				expect(result!.start).toBe(expected.start)
				expect(result!.end).toBe(expected.end)
				expect(result!.patternName).toBe(expected.patternName)
				expect(result!.delimiterLength).toBe(expected.delimiterLength)
				expect(result!.text).toBe(input.slice(expected.start, expected.end))
			})
		}
	})

	describe('CommonMark compliance: cases the regex-based function gets wrong', () => {
		// ***bold** in CommonMark is *<strong>bold</strong>:
		// the leading * becomes a literal character; ** at index 1 opens the strong.
		// The old regex \*\*.+?\*\* anchors at index 0 and swallows the stray * into the match,
		// returning start:0 and text:'***bold**' — off by one character.
		// The new AST-based function correctly identifies start:1 where ** actually begins.
		it('***bold** — strong starts at index 1, not 0', () => {
			const input = '***bold**'

			// Old function is wrong: match begins at 0, swallowing the leading literal *
			const oldResult = findFirstMarkdownMatch(input)
			expect(oldResult).not.toBeNull()
			expect(oldResult!.patternName).toBe('bold')
			expect(oldResult!.start).toBe(0)
			expect(oldResult!.text).toBe('***bold**') // includes the stray *

			// New function is correct: strong node starts at index 1
			const newResult = findFirstMdMatch(input)
			expect(newResult).not.toBeNull()
			expect(newResult!.patternName).toBe('bold')
			expect(newResult!.start).toBe(1)
			expect(newResult!.text).toBe('**bold**') // clean, no leading *
			expect(newResult!.delimiterLength).toBe(2)
		})
	})
})
