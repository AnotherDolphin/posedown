# NPM Package Release Plan: posedown

This guide extracts the rich editor from the blog project into a standalone npm package with a **framework-agnostic architecture**, while keeping the initial release Svelte-focused.

## Strategy Overview

**Phase 1** ✅ (Pre-Extraction): Reorganize files into `core/` and `svelte/` structure - **COMPLETED**
**Phase 2** ✅ (Extraction): Use git-filter-repo to create new repo with clean history - **COMPLETED**
**Phase 3** ⏳ (Post-Extraction): Configure package, test, document - **IN PROGRESS** (steps 3.6-3.7 pending)

This approach gives you a clean structure from day 1 while deferring risky refactoring until after extraction.

---

## Phase 1: Pre-Extraction File Reorganization ✅ COMPLETED

**Do this in your main `blog` repository before extraction.**

### Prerequisites

1. Ensure all changes are committed
2. Create a backup branch: `git checkout -b pre-extraction-backup`
3. Return to main: `git checkout main`

### Step 1.1: Create Directory Structure

Create the new organizational structure:

```bash
# Navigate to the rich editor directory
cd src/lib/rich

# Create new directories
mkdir -p core/utils
mkdir -p core/transforms
mkdir -p core/types
mkdir -p svelte
```

### Step 1.2: Move Files to Core

Move framework-agnostic files to `core/`:

```bash
# Move utilities (already mostly agnostic)
mv utils/* core/utils/
rmdir utils

# Move AST transforms (already agnostic)
mv transforms core/

# Move type definitions
mv types core/

# Create core index
cat > core/index.ts << 'EOF'
// Core framework-agnostic exports
export * from './utils'
export * from './transforms'
export * from './types'
EOF
```

### Step 1.3: Move Svelte-Specific Files

```bash
# Move Svelte components and state
mv richEditorState.svelte.ts svelte/
mv Editor.svelte svelte/ 2>/dev/null || echo "Editor.svelte not found, skipping"

# Create svelte index
cat > svelte/index.ts << 'EOF'
// Svelte-specific exports
export { default as Editor } from './Editor.svelte'
export * from './richEditorState.svelte'
EOF
```

### Step 1.4: Create Main Index

Update or create the main `src/lib/rich/index.ts`:

```bash
cat > index.ts << 'EOF'
// Main package exports
export * from './core'
export * from './svelte'
EOF
```

### Step 1.5: Update Imports in Blog

Update import paths in your blog to reference the new structure:

```bash
# Search for imports that need updating
grep -r "from '@/rich/" src/routes/ src/lib/ --include="*.ts" --include="*.svelte"

# Common pattern to replace:
# OLD: import { ... } from '@/rich/utils/...'
# NEW: import { ... } from '@/rich/core/utils/...'
```

**Manual step**: Update imports in affected files (likely in test routes and other components).

### Step 1.6: Test Blog Still Works

```bash
# Return to blog root
cd ../../..

# Run dev server
npm run dev

# Open http://localhost:5173/test
# Verify editor works correctly
```

### Step 1.7: Commit the Reorganization

```bash
git add src/lib/rich
git commit -m "refactor: reorganize rich editor into core/ and svelte/ structure

Prepare for extraction to posedown package.
- core/: Framework-agnostic utilities, transforms, types
- svelte/: Svelte-specific components and state management"
```

---

## Phase 2: Extraction ✅ COMPLETED

### Prerequisites for Extraction

1.  **New GitHub Repo**: An empty repository is created on GitHub (name: `posedown`).
2.  **Temporary Clone**: You have cloned your original `blog` project into a temporary directory.
3.  **Tool Installed**: You have `git-filter-repo` installed.
4.  **File Reorganization Complete**: Phase 1 pre-extraction steps are done.
5.  **You are inside the temporary clone directory.**

### Step 1: Confirm Your Location

Ensure you are running these commands from inside your temporary clone of the `blog` project.

**Action**: Verify the contents of the original project.

```bash
ls -F
```

### Step 2.1: Filter The Repository History ✅

**Completed**: Successfully filtered 166 commits down to 34 commits containing only editor files. Used fresh clone with `--no-local` flag. Renamed `src/lib/rich` to `src/` and restructured paths.

This command will rewrite the history to keep only the files necessary for the editor as a standalone Svelte library project, including its source (with the new core/svelte structure), tests, documentation, and build configurations.

**Action**: Run the `git filter-repo` command. This command is long, so copy it carefully. It renames `src/lib/rich` to a top-level `src` directory for a clean package structure.

```bash
git filter-repo \
  --path src/lib/rich/core \
  --path src/lib/rich/svelte \
  --path src/lib/rich/tests \
  --path src/lib/rich/index.ts \
  --path src/routes/test \
  --path docs/design \
  --path docs/issues \
  --path static \
  --path svelte.config.js \
  --path vite.config.ts \
  --path vitest.config.ts \
  --path tsconfig.json \
  --path playwright.config.ts \
  --path package.json \
  --path package-lock.json \
  --path .prettierrc \
  --path .prettierignore \
  --path .gitignore \
  --path components.json \
  --path-rename src/lib/rich:src \
  --path-rename src/routes/test:src/routes/test
```

**What's included:**
- `src/lib/rich/core/` → Framework-agnostic code
- `src/lib/rich/svelte/` → Svelte components
- `src/lib/rich/tests/` → E2E tests for rich editor (9 Playwright tests)
- `src/lib/rich/index.ts` → Main exports
- `src/routes/test` → Test page for the editor
- `docs/design` and `docs/issues` → Architecture docs

**What's excluded:**
- `src/lib/rich/temp/` → Temporary/experimental code
- `src/lib/rich/test/` → Old console test scripts (not real tests)
- `tests/` → Blog-specific tests (integration, unit)

### Step 2.2: Verify the New Project Structure ✅

**Completed**: Verified structure is correct with `src/lib/core/` and `src/lib/svelte/` directories.

After the command finishes, your repository should look like a complete, self-contained SvelteKit project for your editor.

**Action**: Check the new structure.

```bash
ls -F
ls -R src/
```

You should see:
- Top-level: `svelte.config.js`, `package.json`, `src/`, `docs/`
- `src/core/`: utils, transforms, history (framework-agnostic)
- `src/svelte/`: RichEditor.svelte, richEditorState.svelte.ts (Svelte-specific)
- `src/tests/e2e/`: 9 Playwright E2E test files
- `src/routes/test/`: Test page for the editor
- `src/index.ts`: Main exports

### Step 2.3: Connect to the New GitHub Repository ✅

**Completed**: Added remote origin and deleted legacy branches from blog repo.

Link this filtered repository to the new, empty one you created on GitHub.

**Action**: Add the new repository as your `origin`. **Remember to replace `<your-new-repo-url>` with your actual repository URL.**

```bash
git remote add origin <your-new-repo-url>
```

**Action**: Verify that the remote was added correctly.

```bash
git remote -v
```

### Step 2.4: Push the New History to GitHub ✅

**Completed**: Renamed `prepackage` branch to `main` and pushed to GitHub origin.

Push your new, clean history to the `main` branch of your new repository.

**Action**: Push to the `main` branch.

```bash
git push -u origin main
```

*(Note: If your default branch is `master`, use `git push -u origin master` instead.)*

---

## Phase 3: Post-Extraction Configuration ⏳ IN PROGRESS

**Working in the new `posedown` repository.**

Configuration, testing, and documentation complete (Steps 3.1-3.5 ✅). Release creation and npm publish pending (Steps 3.6-3.7 ⏳).

### Step 3.1: Install Dependencies ✅

**Completed**: Installed `@sveltejs/package` and all dependencies.

**Action**: Install the package builder and dependencies.

```bash
# Install the Svelte package builder
npm install -D @sveltejs/package

# Install development dependencies
npm install
```

### Step 3.2: Update package.json ✅

**Completed**: Updated package.json with multi-entry exports, removed blog-specific dependencies, added package scripts.

Replace the blog's `package.json` with package-specific configuration:

**Action**: Update these sections in `package.json`:

```json
{
  "name": "posedown",
  "version": "0.1.0",
  "description": "A markdown-based rich text editor with AST-driven transformations",
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/posedown"
  },
  "keywords": ["markdown", "editor", "svelte", "rich-text", "contenteditable"],
  "type": "module",

  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./core": {
      "types": "./dist/core/index.d.ts",
      "default": "./dist/core/index.js"
    },
    "./svelte": {
      "types": "./dist/svelte/index.d.ts",
      "svelte": "./dist/svelte/index.js",
      "default": "./dist/svelte/index.js"
    }
  },

  "files": [
    "dist",
    "!dist/**/*.test.*",
    "!dist/**/*.spec.*"
  ],

  "peerDependencies": {
    "svelte": "^5.0.0"
  },

  "dependencies": {
    "dompurify": "^3.2.7",
    "hast-util-from-dom": "^5.0.1",
    "hast-util-to-dom": "^4.0.1",
    "rehype-parse": "^9.0.1",
    "rehype-remark": "^10.0.1",
    "remark-parse": "^11.0.0",
    "remark-rehype": "^11.1.2",
    "mdast-util-gfm": "^3.1.0",
    "micromark-extension-gfm": "^3.0.0",
    "unist-util-remove": "^4.0.0",
    "unist-util-visit": "^5.0.0"
  },

  "devDependencies": {
    "@sveltejs/package": "^2.0.0",
    "@sveltejs/kit": "^2.22.0",
    "@sveltejs/vite-plugin-svelte": "^6.0.0",
    "@playwright/test": "^1.49.1",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^7.0.4",
    "vitest": "^3.2.4",
    "prettier": "^3.4.2",
    "prettier-plugin-svelte": "^3.3.3"
  },

  "scripts": {
    "dev": "vite dev",
    "build": "vite build && npm run package",
    "preview": "vite preview",
    "package": "svelte-kit sync && svelte-package",
    "prepublishOnly": "npm run package",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "test": "playwright test",
    "test:unit": "vitest run",
    "format": "prettier --write .",
    "lint": "prettier --check ."
  }
}
```

**What was removed**:
- Blog-specific dependencies: firebase, date-fns, mode-watcher, UI libraries
- Blog-specific scripts: emulate, Firebase-related commands

**What was added**:
- Multi-entry exports map (`/core`, `/svelte`)
- Package-specific scripts (`package`, `prepublishOnly`)
- Proper package metadata

### Step 3.3: Configure Svelte Package Builder ✅

**Completed**: Removed deprecated `config.package` section from `svelte.config.js`. The package builder now uses default configuration.

Update `svelte.config.js` to build a library:

```javascript
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter(),

    // Package configuration
    files: {
      lib: 'src'
    }
  },

  package: {
    // Export subdirectories
    exports: (filepath) => {
      // Export core/ and svelte/ subdirectories
      if (filepath.startsWith('core/')) return true
      if (filepath.startsWith('svelte/')) return true
      // Export root index
      return filepath === 'index.ts'
    },

    // Exclude test files
    files: (filepath) => {
      return !filepath.includes('.test.') && !filepath.includes('.spec.')
    }
  }
}

export default config
```

### Step 3.4: Add Documentation Files ✅

**Completed**: Created `README.md`, `CONTRIBUTING.md`, and `docs/architecture.md` with comprehensive documentation.

Create essential documentation:

**Action**: Create `README.md`:

```markdown
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
  import { Editor } from 'posedown'
</script>

<Editor />
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
```

**Action**: Create `CONTRIBUTING.md`:

```markdown
# Contributing to posedown

## Architecture

The package is organized into two layers:

- `src/core/`: Framework-agnostic utilities, transforms, and types
- `src/svelte/`: Svelte-specific components and state management

## Guidelines

### Adding Features

1. **Core functionality**: Add to `src/core/` if framework-agnostic
2. **Svelte UI/state**: Add to `src/svelte/` if Svelte-specific
3. **Keep separation**: Don't import Svelte-specific code in core/

### Testing

- Unit tests: `npm run test:unit`
- E2E tests: `npm run test`
- Type checking: `npm run check`

### Code Style

- Run `npm run format` before committing
- Follow existing patterns
- Add JSDoc comments for public APIs

## Roadmap: Framework Adapters

Future versions will extract core state management from Svelte runes to enable:
- React adapter
- Vue adapter
- Vanilla JS usage

When contributing, keep this goal in mind and prefer framework-agnostic patterns.
```

**Action**: Create `docs/architecture.md`:

```markdown
# posedown Architecture

## Structure

```
src/
├── core/              # Framework-agnostic (pure TS/JS)
│   ├── utils/         # Pattern detection, helpers
│   ├── transforms/    # AST conversions (markdown ↔ HTML)
│   └── types/         # TypeScript interfaces
├── svelte/            # Svelte-specific wrapper
│   ├── Editor.svelte  # Main component
│   └── richEditorState.svelte.ts  # State management (uses Svelte 5 runes)
└── index.ts           # Main exports
```

## Current State (v0.1.0)

- **Core layer**: Framework-agnostic (can be used standalone)
- **Svelte layer**: Uses Svelte 5 runes for state (framework-specific)

## Future: Framework-Agnostic State (v0.2.0+)

### Planned Refactoring

Extract `richEditorState.svelte.ts` into:

1. **Core state class** (framework-agnostic):
```typescript
// src/core/state/EditorState.ts
export class EditorState {
  private subscribers = new Set<() => void>()

  constructor(private element: HTMLElement) {}

  subscribe(fn: () => void) {
    this.subscribers.add(fn)
  }

  notify() {
    this.subscribers.forEach(fn => fn())
  }
}
```

2. **Svelte wrapper**:
```typescript
// src/svelte/stores.ts
import { EditorState } from '../core/state/EditorState'

export function createEditor(element: HTMLElement) {
  const core = new EditorState(element)
  let state = $state({ /* derived from core */ })

  core.subscribe(() => {
    state = { /* update */ }
  })

  return state
}
```

3. **React/Vue adapters**:
```typescript
// Future: src/react/useEditor.ts
export function useEditor(ref: RefObject<HTMLElement>) {
  const [state, setState] = useState({})
  const coreRef = useRef(new EditorState(ref.current))

  useEffect(() => {
    coreRef.current.subscribe(() => setState({ /* update */ }))
  }, [])

  return state
}
```

### Migration Path

Users can migrate gradually:
- v0.1.x: Use Svelte component
- v0.2.0: Core state becomes framework-agnostic, Svelte wrapper uses it
- v0.3.0+: React/Vue adapters released

## Design Philosophy

- **AST-first**: Use unified ecosystem, not regex manipulation
- **Security-first**: DOMPurify sanitization on all HTML
- **Separation of concerns**: Framework-agnostic logic in core/
- **Progressive enhancement**: Start with Svelte, expand to other frameworks
```

---

### Step 3.5: Test Everything ✅

**Completed**: All testing and builds successful:
- ✅ Type checking: `npm run check` - 0 errors, 0 warnings
- ✅ E2E tests: 156/170 passing (14 edge case failures remaining)
- ✅ Package build: `npm run package` - successful build to dist/
- ✅ Structure verification: dist/ contains proper exports

**Additional fixes applied**:
- Created missing SvelteKit files (src/app.html, src/routes/+layout.svelte, src/routes/+page.svelte)
- Removed all Tailwind dependencies and styling
- Fixed critical `white-space: break-spaces` CSS issue by applying via JavaScript in richEditorState.svelte.ts:62
- Moved all source files to `src/lib/` structure (no duplication)
- Updated all imports to use `$lib` syntax for consistency
- Added `/dist` to .gitignore

**Action**: Run all tests and build the package.

```bash
# Install dependencies
npm install

# Type checking
npm run check

# Run tests (update imports if needed)
npm run test

# Build the package
npm run package

# Verify dist/ output
ls -R dist/
```

**Expected dist/ structure**:
```
dist/
├── index.js
├── index.d.ts
├── core/
│   ├── index.js
│   ├── index.d.ts
│   ├── utils/...
│   └── transforms/...
└── svelte/
    ├── index.js
    ├── index.d.ts
    ├── Editor.svelte
    └── richEditorState.svelte.ts
```

### Step 3.6: Create Initial Release ⏳ PENDING

**Action**: Commit all changes and tag release.

```bash
# Commit all changes
git add .
git commit -m "feat: configure posedown package for npm publish

- Multi-entry exports (/core, /svelte)
- Framework-agnostic core structure
- Svelte 5 component wrapper
- Complete documentation
- Fixed white-space: break-spaces critical issue
- Updated all imports to $lib syntax
- E2E tests: 156/170 passing"

# Tag release
git tag -a v0.1.0 -m "Release v0.1.0: Svelte-first markdown editor"
git push origin main --tags
```

### Step 3.7: Publish to npm ⏳ PENDING

**Action**: Publish to npm registry.

```bash
# Dry run to verify package contents
npm publish --dry-run

# Publish (requires npm account)
npm publish
```

---

## Post-Release: Future Enhancements

### v0.2.0: Framework-Agnostic State
- Extract EditorState from Svelte runes
- Create observable pattern for state updates
- Svelte wrapper uses core state

### v0.3.0: React Adapter
- `posedown/react` export
- React hooks wrapper around core state

### v0.4.0: Vue Adapter
- `posedown/vue` export
- Vue composables wrapper

## Summary

✅ **Phase 1**: File reorganization in blog repo (low risk)
✅ **Phase 2**: Clean extraction with git-filter-repo (preserves history)
⏳ **Phase 3**: Package configuration and architecture docs (steps 3.1-3.5 ✅, steps 3.6-3.7 ⏳)

The package is now:
- Structured for framework-agnostic future
- Configured and tested (ready for release)
- Ready for v0.1.0 publish to npm
- Ready for gradual refactoring to support other frameworks