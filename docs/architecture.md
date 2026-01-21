# posedown Architecture

## Structure

```
src/
├── core/              # Framework-agnostic (pure TS/JS)
│   ├── dom/           # DOM utilities (smartReplaceChildren, cursor positioning)
│   ├── utils/         # Pattern detection, helpers
│   ├── transforms/    # AST conversions (markdown ↔ HTML)
│   └── history/       # Undo/redo system
├── svelte/            # Svelte-specific wrapper
│   ├── RichEditor.svelte          # Main component
│   └── richEditorState.svelte.ts  # State management (uses Svelte 5 runes)
└── index.ts           # Main exports
```

### Core Modules

**`core/dom/`** (added v0.1.0):
- `smartReplaceChildren.ts` - Intelligent DOM reconciliation with cursor preservation
- `util.ts` - DOM helper functions (getFirstTextNode, getDomRangeFromContentOffsets)
- `index.ts` - Module exports

**`core/utils/`**:
- Pattern detection (inline and block markdown patterns)
- DOM helpers (getFirstOfAncestors, tag lists)
- Focus mark manager
- Selection utilities

**`core/transforms/`**:
- AST conversions between markdown and HTML
- Pattern transformation logic

**`core/history/`**:
- Undo/redo system with intelligent coalescing

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
