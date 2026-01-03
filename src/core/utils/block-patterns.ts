/**
 * Utility for block-level markdown pattern detection
 * These patterns identify markdown that should trigger block-level transformations
 */

/**
 * Block pattern definitions
 * All patterns are tested against the start of a line (^)
 */
const blockPatterns = {
	// ATX Headings: # Heading
	heading: /^#{1,6} /,

	// Unordered lists: - item, * item, + item
	unorderedList: /^[-*+] /,

	// Ordered lists: 1. item, 2. item
	orderedList: /^\d+\. /,

	// Task lists: - [ ] todo, - [x] done
	// taskList: /^[-*+] \[([ xX])\] /,
	listItem: /^[-*+] /,

	// Blockquotes: > quote
	blockquote: /^> /,

	// Code blocks: ```language or ```
	codeBlock: /^```/,

	// Horizontal rules: ---, ___
	// Must be at least 3 characters, can have spaces between
	horizontalRule: /^(---+|(_\s*){3,})$/,

	// Tables: | header | (basic detection)
	table: /^\|(.+\|)+/
} as const

/**
 * Check if text matches any block pattern
 * @param content - The text content to check
 * @returns true if any block pattern matches
 */
export function isBlockPattern(content: string, node: Node | HTMLElement): boolean {
	const matches = Object.values(blockPatterns).some(pattern => pattern.test(content))
	if (!matches) return false
	
	const isInList = node instanceof Element ? node.closest('li') : node.parentElement?.closest('li')
	if (!isInList) return matches
	
	const isListPattern = matchesBlockPattern(content, 'listItem')
	if (!isListPattern) return matches

	// prevent any list pattern matching inside LIs for now
	// #issue: this disables nested lists detection
	return false

	// prevent circular LI pattern bug if it is the first LI
	// const isFirstLi = isInList.parentElement?.firstElementChild === isInList
	// if (!isFirstLi) return matches

	// const prevLi = isInList.previousElementSibling as HTMLLIElement | null
	// if (!prevLi?.textContent?.trim()) return false
}

/**
 * Find which block pattern matches the text
 * @param content - The text content to check
 * @returns The name of the matching pattern or null
 * @deprecated Not used in the codebase
 */
export function matchingBlockPattern(content: string): keyof typeof blockPatterns | null {
	for (const [name, pattern] of Object.entries(blockPatterns)) {
		if (pattern.test(content)) {
			return name as keyof typeof blockPatterns
		}
	}
	return null
}

/**
 * Check if content matches a specific block pattern
 * @param content - The text content to check
 * @param patternName - The specific pattern to test against
 * @returns true if the pattern matches
 */
function matchesBlockPattern(
	content: string,
	patternName: keyof typeof blockPatterns
): boolean {
	return blockPatterns[patternName].test(content)
}

/**
 * Extract the block pattern prefix from text
 * @param content - The text content to extract from
 * @returns The pattern prefix (e.g., "# ", "- ", "1. ") or null if no pattern matches
 */
export function extractPatternPrefix(content: string): string | null {
	for (const pattern of Object.values(blockPatterns)) {
		const match = content.match(pattern)
		if (match) {
			return match[0]
		}
	}
	return null
}

/**
 * Check if text matches a list pattern (unordered, ordered, or task list)
 * @param content - The text content to check
 * @returns true if the content matches any list pattern
 */
export function isListPattern(content: string): boolean {
	return (
		blockPatterns.unorderedList.test(content) ||
		blockPatterns.orderedList.test(content) ||
		blockPatterns.listItem.test(content)
	)
}
