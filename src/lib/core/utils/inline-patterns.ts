/**
 * Utility to create regex patterns for inline markdown syntax
 * Avoids repetition by parameterizing delimiter patterns
 */

import { parseMarkdownToMdast } from '../transforms/ast-utils'

/**
 * Escapes special regex characters in a string
 */
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Creates regex pattern for inline markdown syntax with symmetric delimiters
 * @param delimiter - The delimiter (e.g., '**', '*', '~~', '`')
 * @param allowSpaceAfterOpening - Whether to allow space after opening delimiter
 * @param preventNesting - Whether to prevent matching if delimiter is part of a longer sequence
 * @returns RegExp pattern with global flag
 */
function createInlinePattern(delimiter: string, allowSpaceAfterOpening = false, preventNesting = false): RegExp {
	const escaped = escapeRegex(delimiter)

	// Negative lookahead for space after opening (unless allowed)
	const noSpaceCheck = allowSpaceAfterOpening ? '' : '(?!\\s)'

	// For single-char delimiters, add negative lookbehind/lookahead to prevent matching when part of longer sequence
	let pattern: string
	if (preventNesting && delimiter.length === 1) {
		// Don't match if delimiter is preceded or followed by the same character
		// e.g., don't match *text* if it's **text* or *text**
		const notBefore = `(?<!${escaped})`
		const notAfterOpening = `(?![${escaped}\\s])` // After opening: not same char or space
		const notAfterClosing = `(?!${escaped})` // After closing: not same char
		pattern = `${notBefore}${escaped}${notAfterOpening}.+?${escaped}${notAfterClosing}`
	} else {
		pattern = `${escaped}${noSpaceCheck}.+?${escaped}`
	}

	return new RegExp(pattern, 'g')
}

/**
 * Creates regex for link-style syntax [text](url)
 */
const createLinkPattern = (): RegExp => /\[([^\]]+)\]\(([^)]+)\)/g

/**
 * Creates regex for image syntax ![alt](url)
 */
const createImagePattern = (): RegExp => /!\[([^\]]*)\]\(([^)]+)\)/g

// Export all inline markdown patterns
const patterns = {
	// CommonMark basic formatting
	bold: createInlinePattern('**'),
	italic: createInlinePattern('*', false, true), // preventNesting: avoid matching inside **
	italicUnderscore: createInlinePattern('_', false, true), // Alternative italic syntax, preventNesting: avoid matching inside __
	code: createInlinePattern('`', true), // Allow spaces in code

	// GFM (GitHub Flavored Markdown)
	strikethrough: createInlinePattern('~~'),

	// Extended syntax (requires plugins)
	highlight: createInlinePattern('=='),
	subscript: createInlinePattern('~', false, true), // preventNesting: avoid matching inside ~~
	superscript: createInlinePattern('^', false, true),
	underline: createInlinePattern('__'),

	// Links and images
	link: createLinkPattern(),
	image: createImagePattern(),

	// Wiki-style
	wikiLink: /\[\[([^\]]+)\]\]/g,

	// Social
	// mention: /@(\w+)/g,
	// hashtag: /#(\w+)/g
} as const

// Delimiter mapping for each pattern
// todo: OUTDATED update this
const delimiters: Record<keyof typeof patterns, string> = {
	bold: '**',
	italic: '*',
	italicUnderscore: '_',
	code: '`',
	strikethrough: '~~', // GFM
	highlight: '==', // Extended syntax
	subscript: '~', // Extended syntax
	superscript: '^', // Extended syntax
	underline: '__', // Warning: Standard Markdown renders this as Bold
	link: '[',
	image: '![',
	wikiLink: '[[' // Wiki-style
}

export const SUPPORTED_INLINE_DELIMITERS = new Set([
	'*',
	'**',
	'_',
	'__',
	'~~',
	'`',
	'~',
	// '==',
	// '^'
])

/**
 * Check if text contains any inline markdown syntax
 * @deprecated Not used in the codebase
 */
export function hasInlineSyntax(text: string): boolean {
	return Object.entries(patterns).some(([name, pattern]) => {
		pattern.lastIndex = 0 // Reset regex state
		const isMatch = pattern.test(text)
		return isMatch
	})
}

/**
 * Find which patterns match the text
 * @returns Array of pattern names that matched
 * @deprecated Not used in the codebase
 */
export function matchingPatterns(text: string): Array<keyof typeof patterns> {
	return (Object.entries(patterns) as Array<[keyof typeof patterns, RegExp]>)
		.filter(([_, pattern]) => {
			pattern.lastIndex = 0 // Reset regex state
			return pattern.test(text)
		})
		.map(([name]) => name)
}

/**
 * Extract all matches for a specific pattern
 * @deprecated Not used in the codebase
 */
export function extractMatches(
	text: string,
	patternName: keyof typeof patterns
): RegExpMatchArray[] {
	const pattern = patterns[patternName]
	const matches: RegExpMatchArray[] = []
	let match: RegExpExecArray | null

	pattern.lastIndex = 0 // Reset regex state

	while ((match = pattern.exec(text)) !== null) {
		matches.push(match)
	}

	return matches
}

/**
 * Find the first markdown pattern match in the text
 * Returns position, matched text, and delimiter length for inline replacement
 *
 * @deprecated Use {@link findFirstMdMatch} instead — it uses the CommonMark-compliant
 * mdast parser and matches the precedence rules of the AST pipeline.
 */
export function findFirstMarkdownMatch(
	text: string
): { start: number; end: number; text: string; patternName: string; delimiterLength: number } | null {
	for (const [name, pattern] of Object.entries(patterns)) {
		pattern.lastIndex = 0 // Reset regex state
		const match = pattern.exec(text)
		if (match && match.index !== undefined) {
			const patternName = name as keyof typeof patterns
			const delimiter = delimiters[patternName]
			return {
				start: match.index,
				end: match.index + match[0].length,
				text: match[0],
				patternName: name,
				delimiterLength: delimiter.length
			}
		}
	}
	return null
}

type MatchResult = { start: number; end: number; text: string; patternName: string; delimiterLength: number }

/**
 * CommonMark-compliant version of findFirstMarkdownMatch.
 * Uses the mdast parser instead of regex, so precedence rules (e.g. ***bold** → *<strong>bold</strong>)
 * match what htmlToMarkdown / the rest of the AST pipeline produces.
 * Does not support non-standard patterns: highlight (==), subscript (~), superscript (^), wikiLink.
 */
export function findFirstMdMatch(text: string): MatchResult | null {
	const mdast = parseMarkdownToMdast(text)
	const paragraph = mdast.children[0]
	if (!paragraph || paragraph.type !== 'paragraph') return null

	for (const node of paragraph.children) {
		if (node.type === 'text' || !node.position) continue

		const start = node.position.start.offset!
		const end = node.position.end.offset!

		let patternName: string
		let delimiterLength: number

		switch (node.type) {
			case 'strong':
				patternName = text[start] === '_' ? 'underline' : 'bold'
				delimiterLength = 2
				break
			case 'emphasis':
				patternName = text[start] === '_' ? 'italicUnderscore' : 'italic'
				delimiterLength = 1
				break
			case 'inlineCode':
				patternName = 'code'
				delimiterLength = 1
				break
			case 'delete':
				delimiterLength = text[start + 1] === '~' ? 2 : 1
				patternName = 'strikethrough'
				break
			case 'link':
				patternName = 'link'
				delimiterLength = 1
				break
			case 'image':
				patternName = 'image'
				delimiterLength = 2
				break
			default:
				continue
		}

		return { start, end, text: text.slice(start, end), patternName, delimiterLength }
	}

	return null
}
