import { fromMarkdown } from 'mdast-util-from-markdown'
import { toHast } from 'mdast-util-to-hast'
import { toHtml } from 'hast-util-to-html'
import { fromHtml } from 'hast-util-from-html'
import { toMdast } from 'hast-util-to-mdast'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { Handle } from 'mdast-util-to-markdown'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm'
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough'
import type { RootContent as MdastContent, Nodes as MdastNodes, Delete } from 'mdast'
import type { Nodes as HastNodes, RootContent as HastRootContent } from 'hast'
import { toDom } from 'hast-util-to-dom'
import { remove } from 'unist-util-remove'
import { headingHandler, ensureBlockHeight } from '../utils/block-marks'
import DOMPurify from 'dompurify'
import { extractPatternPrefix } from '../utils/block-patterns'

// ================================= general plugin integs. =================================

export const parseMarkdownToMdast = (md: string) => {
	const mdast = fromMarkdown(md, {
		extensions: [
			gfm(),
		],
		mdastExtensions: [
			gfmFromMarkdown(),
			gfmStrikethroughFromMarkdown()
		]
	})
	return mdast
}

export const stringifyMdastToMarkdown = (mdast: MdastNodes) => {
	return toMarkdown(mdast, {
		extensions: [gfmToMarkdown()],
		emphasis: '*',  // Use * for emphasis - longest pattern (** for bold) is matched first
		strong: '*',
		handlers: {
			// Override the default text handler which escapes characters.
			// We return the raw value, allowing text nodes to merge with
			// adjacent formatting (e.g. text('*') + strong('bold') -> ***bold***)
			text: (node, _, state, info) => {
				return node.value
			},
			// Override delete handler to use single ~ instead of ~~
			// Note: Full handler required because gfmToMarkdown() doesn't provide
			// a configuration option for the delimiter (it hardcodes ~~)
			delete: ((node: Delete, _, state, info) => {
				const tracker = state.createTracker(info)
				const exit = state.enter('strikethrough')
				let value = tracker.move('~')
				value += state.containerPhrasing(node, {
					...tracker.current(),
					before: value,
					after: '~'
				})
				value += tracker.move('~')
				exit()
				return value
			}) as Handle
		}
	})
}

// ================================= Document level conversion =================================

export const markdownToHast = (markdown: string) => {
	const mdast = parseMarkdownToMdast(markdown)
	const hast = toHast(mdast, {
		handlers: {
			heading: headingHandler
		}
	})
	removeEmptySeparators(hast)
	return hast
}

export const markdownToHtml = (md: string): string => {
	const hast = markdownToHast(md)
	if (!hast) return ''
	return toHtml(hast)
}

export const htmlToMarkdown = (html: string): string => {
	const cleanHtml = DOMPurify.sanitize(html)
	const hast = fromHtml(cleanHtml, { fragment: true })
	removeTrailingBr(hast)
	const mdast = toMdast(hast)
	return stringifyMdastToMarkdown(mdast)
}

// ================================= Block Patterns Detection for richEditorState =================================

export const markdownToDomFragment = (
	markdown: string
): { fragment: DocumentFragment | Node; isInline: boolean } => {
	const hast = markdownToHast(markdown)
	const { fragment, isInline } = unfoldAsFragment(hast)
	return { fragment, isInline }
}

function removeTrailingBr(node: HastNodes) {
	if (!('children' in node)) return
	for (const child of node.children) {
		removeTrailingBr(child as HastNodes)
	}
	while (node.children.length > 0) {
		const last = node.children[node.children.length - 1]
		if (last.type === 'element' && 'tagName' in last && last.tagName === 'br') {
			node.children.pop()
		} else {
			break
		}
	}
}

function removeEmptySeparators(hast: HastNodes) {
	remove(hast, node => {
		// Only process text nodes
		if (node.type !== 'text' || !('value' in node)) return false

		const value = node.value as string

		// Only remove whitespace that contains newlines (block-level separators)
		// Preserve single spaces, tabs, etc. between inline elements
		return /^\s*\n\s*$/.test(value)
	})
}

function unfoldAsFragment(hast: HastNodes) {
	if ('children' in hast) {
		const fragment = document.createDocumentFragment()
		fragment.append(...hast.children.map(n => toDom(n)))

		// Ensure all empty block elements have proper height
		Array.from(fragment.children).forEach(child => ensureBlockHeight(child))

		// Only unfold if there's a single paragraph element (for inline content)
		// Never unfold block elements like headings, lists, code blocks, etc.
		if (fragment.childNodes.length == 1) {
			const singleChild = fragment.children[0]
			if (singleChild && singleChild.tagName === 'P') {
				const newFragment = document.createDocumentFragment()
				newFragment.append(...singleChild.childNodes)
				return { fragment: newFragment, isInline: true }
			}
		}

		return { fragment: fragment, isInline: false }
	}

	return { fragment: toDom(hast), isInline: false }
}

// ==========================================================

/**
 * Convert a block's HTML to markdown, preserving inline formatting
 * If a block pattern prefix exists, it's extracted and prepended correctly
 * to avoid escaping issues when converting HTML to markdown
 * warning: escapes raw inline markdown syntax
 *
 * @param blockElement - The HTML block element
 * @param textContent - The plain text content (for pattern detection)
 * @returns Markdown string with pattern + preserved inline formatting
 */
export function domToMarkdown(blockElement: HTMLElement): string {

	// const clone = blockElement.cloneNode(true) as HTMLElement
	// if (clone.lastChild?.nodeName === 'BR') clone.lastChild.remove()

	// Extract the pattern prefix from plain text
	const patternPrefix = extractPatternPrefix(blockElement.textContent)
	if (!patternPrefix) {
		// No pattern, just convert HTML to markdown directly
		return htmlToMarkdown(blockElement.innerHTML)
	}

	// Clone the block to avoid mutating the original DOM
	const clone = blockElement.cloneNode(true) as HTMLElement

	// Remove pattern characters from the first text node
	const firstTextNode = clone.childNodes[0]
	if (firstTextNode?.nodeType === Node.TEXT_NODE && firstTextNode.textContent) {
		firstTextNode.textContent = firstTextNode.textContent.slice(patternPrefix.length)
	}

	// Convert only the non-pattern HTML to markdown, preserving inline formatting
	const contentMarkdown = htmlToMarkdown(clone.innerHTML)

	// Prepend the pattern to the result
	return patternPrefix + contentMarkdown
}

/* Convert a DocumentFragment back to markdown string
 * Preserves inline formatting within the fragment
 */
export function domFragmentToMarkdown(fragment: DocumentFragment): string {
	// Create a temporary container to extract HTML
	const tempDiv = document.createElement('div')

	// Clone the fragment to avoid mutating the original
	const clonedFragment = fragment.cloneNode(true) as DocumentFragment
	tempDiv.appendChild(clonedFragment)

	// Convert HTML to markdown using existing pipeline
	return htmlToMarkdown(tempDiv.innerHTML)
}
