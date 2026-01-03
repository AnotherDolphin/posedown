# posedown

A markdown-based rich text editor with AST-driven transformations for Svelte.

## Features

- Real-time markdown pattern detection and transformation
- AST-based conversion (unified/remark/rehype ecosystem)
- Bidirectional markdown ↔ HTML conversion
- Security-first with DOMPurify sanitization
- Undo/redo with intelligent history coalescing
- GitHub Flavored Markdown support

## Installation

```bash
npm install posedown
```

## Quick Start

```svelte
<script>
  import { RichEditor } from 'posedown'
</script>

<RichEditor />
```

## Framework-Agnostic Core

For non-Svelte frameworks, use the core package:

```javascript
import { markdownToDomFragment, htmlToMarkdown } from 'posedown/core'

// Convert markdown to DOM
const { fragment } = markdownToDomFragment('**bold** text')

// Convert HTML to markdown
const markdown = htmlToMarkdown('<strong>bold</strong> text')
```

## Documentation

See `docs/` for detailed architecture and design documentation.

## License

MIT
