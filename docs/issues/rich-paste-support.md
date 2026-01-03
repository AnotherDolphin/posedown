# Rich Text Paste Support

> **Created:** 2024-11-30

## Overview

The rich text editor now supports pasting formatted content from external sources (Google Docs, Word, web browsers, etc.) while preserving formatting that has markdown equivalents.

## Implementation

### How It Works

1. **Detection**: When pasting, the editor checks if the clipboard contains HTML (`text/html`)
2. **Sanitization**: HTML is sanitized using DOMPurify to prevent XSS attacks and filter unsupported tags
3. **Conversion**: Sanitized HTML → Markdown → DOM (using existing pipeline)
4. **Insertion**: Uses the same merge and cursor positioning logic as markdown paste

### Code Changes

- **`src/lib/rich/ast-utils.ts`**: Added DOMPurify sanitization to `htmlToMarkdown()`
- **`src/lib/rich/richEditorState.svelte.ts`**: Modified `onPaste()` to detect and process HTML from clipboard

## Supported Formatting

### Currently Whitelisted HTML Tags

The following HTML tags are allowed through DOMPurify sanitization:

#### Block Elements
- `p` - Paragraphs
- `h1`, `h2`, `h3`, `h4`, `h5`, `h6` - Headings
- `ul`, `ol`, `li` - Lists (ordered and unordered)
- `blockquote` - Block quotes
- `pre` - Preformatted text / code blocks

#### Inline Elements
- `strong`, `b` - Bold text
- `em`, `i` - Italic text
- `code` - Inline code
- `del`, `s` - Strikethrough
- `u` - Underline
- `a` - Links
- `img` - Images
- `br` - Line breaks

### Allowed Attributes
- `href` - For links
- `src`, `alt`, `title` - For images

## Markdown Equivalents

| HTML | Markdown | Status |
|------|----------|--------|
| `<strong>` / `<b>` | `**bold**` | ✅ Whitelisted |
| `<em>` / `<i>` | `*italic*` | ✅ Whitelisted |
| `<code>` | `` `code` `` | ✅ Whitelisted |
| `<del>` / `<s>` | `~~strikethrough~~` | ✅ Whitelisted |
| `<h1>`-`<h6>` | `#` through `######` | ✅ Whitelisted |
| `<ul><li>` | `- item` | ✅ Whitelisted |
| `<ol><li>` | `1. item` | ✅ Whitelisted |
| `<blockquote>` | `> quote` | ✅ Whitelisted |
| `<pre>` | ` ``` code ``` ` | ✅ Whitelisted |
| `<a href>` | `[text](url)` | ✅ Whitelisted |
| `<img>` | `![alt](src)` | ✅ Whitelisted |

## Testing Results

### ⏳ To Be Tested

Test pasting from various sources and document results here:

- [ ] **Google Docs**
  - [ ] Bold, italic, underline
  - [ ] Headings (H1-H6)
  - [ ] Lists (bullet and numbered)
  - [ ] Links

- [ ] **Microsoft Word**
  - [ ] Basic formatting
  - [ ] Headings
  - [ ] Lists

- [ ] **VS Code**
  - [ ] Code snippets
  - [ ] Markdown formatted code

- [ ] **Web browsers**
  - [ ] Rich content from articles
  - [ ] Code from documentation sites

- [ ] **Notion / Similar editors**
  - [ ] Cross-editor paste compatibility

### Known Limitations

1. **Colors and fonts**: Not supported (no markdown equivalent)
2. **Tables**: Whitelisted tags don't include tables yet (can be added if GFM supports)
3. **Custom styling**: CSS classes and inline styles are stripped by DOMPurify
4. **Nested formatting**: Depends on markdown parser's capabilities

## Future Enhancements

- [ ] Add table support if markdown parser supports GFM tables
- [ ] Add support for task lists `- [ ] todo`
- [ ] Handle edge cases (nested lists, complex HTML structures)
- [ ] Add option to paste as plain text (Ctrl+Shift+V handling)
- [ ] Performance testing with large paste operations

## Notes

- All HTML is sanitized before conversion to prevent XSS attacks
- The conversion pipeline ensures consistency with the markdown-first editor approach
- Unsupported HTML elements are stripped during sanitization
- The editor's existing paste merge logic handles block/inline detection and cursor positioning
