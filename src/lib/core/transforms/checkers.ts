/**
 * checks two fragments to see structural node changes
 * i.e. different formatted elements and/or sequences
 * ignores text content updates
 */
export const hasFormattedNodeChanges = (element: HTMLElement, fragment: DocumentFragment | Node): boolean => {
	if (!element || !fragment) return false
  const elementNodes = Array.from(element.childNodes)
  const fragmentNodes = Array.from(fragment.childNodes)

  // Fragment gained nodes → formatting change (e.g. em split: [em] → [em, text])
  if (fragmentNodes.length > elementNodes.length) return true

  // Element has extra nodes — only a change if any extra are element nodes, not just trailing text
  if (elementNodes.length > fragmentNodes.length) {
    const hasExtraElements = elementNodes.slice(fragmentNodes.length).some(n => n.nodeType === Node.ELEMENT_NODE)
    if (hasExtraElements) return true
  }

  for (let i = 0; i < fragmentNodes.length; i++) {
    const elNode = elementNodes[i]
    const fragNode = fragmentNodes[i]
    if (elNode.nodeType !== fragNode.nodeType) return true
    if (elNode.nodeType === Node.ELEMENT_NODE) {
      const elElement = elNode as HTMLElement
      const fragElement = fragNode as HTMLElement
      if (elElement.tagName !== fragElement.tagName) return true
      if (hasFormattedNodeChanges(elElement, fragElement)) return true
    }
  }
  return false
}

/**
 * @deprecated
 * @param element 
 * @param fragment 
 * @returns 
 */
const isOnlyWhiteSpaceDifference = (element: Node, fragment: Node | DocumentFragment) => {
	const oldContent = element instanceof HTMLElement ? element.innerHTML : element.textContent
	// Extract content from fragment
	let newContent: string | null
	if (fragment instanceof DocumentFragment) {
		const tempDiv = document.createElement('div')
		tempDiv.appendChild(fragment.cloneNode(true))
		newContent = tempDiv.innerHTML
	} else if (fragment instanceof HTMLElement) {
		newContent = fragment.innerHTML
	} else {
		newContent = fragment.textContent
	}

	// Compare after normalizing whitespace
	const normalizeWhitespace = (str: string | null) => {
		return str?.replace(/\s+/g, ' ').trim() || ''
	}

	return normalizeWhitespace(oldContent) === normalizeWhitespace(newContent)
}