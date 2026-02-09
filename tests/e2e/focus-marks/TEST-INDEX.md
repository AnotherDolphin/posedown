# Focus Marks Test Index

This document maps test categories to their file locations and related issues.

## Test Categories

| Category | Test File(s) | Description | Related Issues |
|----------|--------------|-------------|----------------|
| **Caret Positioning** | | | |
| └─ Navigation | `caret-positioning/navigation.spec.ts` | Arrow keys, clicks, edge detection, sibling focusing | #81 |
| └─ During Editing | `caret-positioning/editing.spec.ts` | Caret position during delimiter edits, unwrap/reparse | #71 |
| └─ After Transformation | `caret-positioning/transformation.spec.ts` | Caret after pattern transformation, format changes | #5 |
| └─ Style Persistence | `caret-positioning/style-persistence.spec.ts` | Browser caret style carryover prevention | - |
| **Delimiter Editing** | | | |
| └─ Inline Mirroring | `delimiter-editing/inline-mirroring.spec.ts` | Opening/closing span mirroring, upgrading formats | - |
| └─ Block Editing | `delimiter-editing/block-editing.spec.ts` | Heading, blockquote, list marker editing | - |
| └─ Block Transformation | `delimiter-editing/block-transformation.spec.ts` | unwrapBlock logic, block type conversions, caret preservation | - |
| └─ Breaking Delimiters | `delimiter-editing/breaking-delimiters.spec.ts` | Typing delimiters in middle, pattern breaking | #10 |
| **Activation** | | | |
| └─ Detection | `activation/detection.spec.ts` | Edge sibling detection, when marks appear | #34 |
| └─ Suppression | `activation/suppression.spec.ts` | skipNextFocusMarks behavior, manual unfocus | #6 |
| **Pattern Detection** | | | |
| └─ Inline Patterns | `pattern-detection/inline-patterns.spec.ts` | Bold, italic, code, nested patterns | #9 |
| └─ Block Patterns | `pattern-detection/block-patterns.spec.ts` | Heading, blockquote, list detection | - |

---

## Finding Tests by Issue Number

| Issue | Description | Location | Status |
|-------|-------------|----------|--------|
| #5 | Caret position stability with setCaretAtEnd | `caret-positioning/transformation.spec.ts` | 📋 Planned |
| #6 | Focus spans not lost after transformation | `activation/suppression.spec.ts` | 📋 Planned |
| #9 | Invalid delimiter unwrapping | `pattern-detection/inline-patterns.spec.ts` | 📋 Planned |
| #10 | Breaking delimiters in middle of formatted text | `delimiter-editing/breaking-delimiters.spec.ts` | 📋 Planned |
| #34 | Edge sibling detection | `activation/detection.spec.ts` | 📋 Planned |
| #71 | Caret correction logic (inside vs outside) | `caret-positioning/editing.spec.ts` | 📋 Planned |
| #81 | Navigation correction to end of element | `caret-positioning/navigation.spec.ts` | 📋 Planned |

---

## Current Test Files (Pre-Migration)

These files are in the root `focus-marks/` directory and will be migrated to the new structure:

| Current File | Lines | Target Location | Migration Status |
|-------------|-------|-----------------|------------------|
| `activation.spec.ts` | 407 | → `activation/detection.spec.ts` + `suppression.spec.ts` | ⏳ Pending |
| ~~`block-delimiter-editing.spec.ts`~~ | 320 | → `delimiter-editing/block-editing.spec.ts` | ✅ **Completed** |
| ~~`breaking-delimiters.spec.ts`~~ | 409 | → `delimiter-editing/breaking-delimiters.spec.ts` | ✅ **Completed** |
| ~~`caret-boundary-position.spec.ts`~~ | 310 | → `caret-positioning/navigation.spec.ts` | ✅ **Completed** |
| ~~`caret-style-persistence.spec.ts`~~ | 166 | → `caret-positioning/style-persistence.spec.ts` | ✅ **Completed** |
| `editing.spec.ts` | 187 | → Merge into appropriate folders | ⏳ Pending |
| ~~`nested-transformations.spec.ts`~~ | 236 | → `pattern-detection/inline-patterns.spec.ts` | ✅ **Completed** |
| ~~`regression.spec.ts`~~ | 514 | → Split into `transformation.spec.ts`, `suppression.spec.ts`, `inline-patterns.spec.ts` | ✅ **Completed** |
| ~~`span-mirroring.spec.ts`~~ | 1126 | → Split between `delimiter-editing/inline-mirroring.spec.ts` and `caret-positioning/editing.spec.ts` | ✅ **Completed** |
| ~~`span-persistence.spec.ts`~~ | ~200 | → `activation/span-persistence.spec.ts` | ✅ **Completed** |

---

## Migration Progress

- ✅ Phase 1: New directory structure created
- ✅ Phase 2: All tests migrated (10/10 files completed)
  - ✅ `caret-style-persistence.spec.ts` → `caret-positioning/style-persistence.spec.ts`
  - ✅ `caret-boundary-position.spec.ts` → `caret-positioning/navigation.spec.ts`
  - ✅ `block-delimiter-editing.spec.ts` → `delimiter-editing/block-editing.spec.ts`
  - ✅ `breaking-delimiters.spec.ts` → `delimiter-editing/breaking-delimiters.spec.ts`
  - ✅ `nested-transformations.spec.ts` → `pattern-detection/inline-patterns.spec.ts`
  - ✅ `span-persistence.spec.ts` → `activation/span-persistence.spec.ts`
  - ✅ `activation.spec.ts` → split into `activation/detection.spec.ts` + `suppression.spec.ts`
  - ✅ `span-mirroring.spec.ts` → split into `delimiter-editing/inline-mirroring.spec.ts` + `caret-positioning/editing.spec.ts`
  - ✅ `regression.spec.ts` → split into `transformation.spec.ts`, `suppression.spec.ts`, `inline-patterns.spec.ts`
  - ✅ `editing.spec.ts` → merged into `delimiter-editing/inline-mirroring.spec.ts` (deleted earlier)
- ✅ Phase 3: Cleanup and finalization complete

---

## Notes

- Tests are organized by **behavior**, not by bug/issue number
- Use `// REGRESSION: Issue #XX` comments in test code to reference specific issues
- When adding new tests, place them in the appropriate category folder
- Update this index when files are moved or reorganized
