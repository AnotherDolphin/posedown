/**
 * Utility to create regex patterns for inline markdown syntax
 * Avoids repetition by parameterizing delimiter patterns
 */

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
const delimiters: Record<keyof typeof patterns, string> = {
	bold: '**',
	italic: '*',
	italicUnderscore: '_',
	code: '`',
	strikethrough: '~~',
	highlight: '==',
	subscript: '~',
	superscript: '^',
	underline: '__',
	link: '[',
	image: '![',
	wikiLink: '[['
}

/**
 * Check if text contains any inline markdown syntax
 * @deprecated Not used in the codebase
 */
export function hasInlineSyntax(text: string): boolean {
	return Object.entries(patterns).some(([name, pattern]) => {
		pattern.lastIndex = 0 // Reset regex state
		const isMatch = pattern.test(text)
		isMatch && console.log(name)
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
