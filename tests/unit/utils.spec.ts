import { describe, it, expect } from 'vitest'
import { markdownToHast, markdownToHtml } from '$lib/core/transforms/ast-utils'

const md = "**bold* and *italic***\n"

describe('markdownToHast', () => {
	it('parses nested strong/emphasis marks without HTML entities', () => {
		const hast = markdownToHast(md) as any
		expect(hast).toBeTruthy()
		expect(hast).toHaveProperty('children')

		const p = hast.children?.[0]
		expect(p).toBeTruthy()
		expect(p.tagName).toBe('p')

		// Find a <strong> element inside the paragraph
		const strong = p.children?.find((c: any) => c.tagName === 'strong')
		expect(strong).toBeTruthy()

		// There should be an <em> inside the strong for the nested italic
		const em = strong.children?.find((c: any) => c.tagName === 'em')
		expect(em).toBeTruthy()

		// Also ensure HTML rendering contains the expected tags and text
		const html = markdownToHtml(md)
		expect(html).toContain('<strong>')
		expect(html).toContain('<em>')
		expect(html).toContain('bold')
		expect(html).toContain('italic')
		expect(html).not.toContain('&#x')
	})
})
