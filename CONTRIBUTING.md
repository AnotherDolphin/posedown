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
