# Test Reorganization Plan

**Status:** ✅ Completed
**Date Started:** 2026-02-06
**Date Completed:** 2026-02-06
**Result:** All 10 test files successfully migrated to behavior-based structure
**Context:** Tests have grown organically and are now scattered across multiple files with unclear organization.

---

## Current Problems

### 1. Caret Positioning Tests - Scattered Across 4+ Files
- `tests/e2e/rich-editor-caret-position.spec.ts` (421 lines) - General caret tests
- `tests/e2e/focus-marks/caret-boundary-position.spec.ts` (310 lines) - Boundary-specific
- `tests/e2e/focus-marks/caret-style-persistence.spec.ts` (166 lines) - Style carryover
- `tests/e2e/focus-marks/span-mirroring.spec.ts` (1126 lines) - Contains issue #71 tests buried inside

### 2. Unclear File Names
- Why is issue #71 (caret correction logic) in `span-mirroring.spec.ts`?
- `regression.spec.ts` mixes issues #5, #6, #9 together
- `span-mirroring.spec.ts` has delimiter editing, mirroring, AND caret tests

### 3. Feature Overlap
- Delimiter editing in both `span-mirroring.spec.ts` and `block-delimiter-editing.spec.ts`
- Breaking delimiters vs regular delimiter editing split unclear
- Activation tests vs focus mark injection overlap

---

## Proposed Organization

### Option A: By Behavior Domain ⭐ **RECOMMENDED**

```
tests/e2e/focus-marks/
├── caret-positioning/
│   ├── navigation.spec.ts
│   │   • Arrow key navigation into/out of formatted elements
│   │   • Click/mouse-based navigation
│   │   • Issue #81: Navigation to end should correct caret outside
│   │   • Edge detection and sibling focusing
│   │
│   ├── editing.spec.ts
│   │   • Caret position during delimiter edits
│   │   • Issue #71.1: Typing * at end stays outside
│   │   • Issue #71.2: Backspace from inside stays inside
│   │   • Caret preservation during unwrap/reparse
│   │
│   ├── transformation.spec.ts
│   │   • Caret after pattern transformation (** → <strong>)
│   │   • Caret after format changes (italic → bold)
│   │   • Caret during nested pattern creation
│   │   • Issue #5: Caret stability after transformation
│   │
│   └── style-persistence.spec.ts
│       • Existing: Browser caret style carryover prevention
│       • Escape caret style when deleting delimiters
│
├── delimiter-editing/
│   ├── inline-mirroring.spec.ts
│   │   • Opening/closing span mirroring
│   │   • Typing at span edges (before/after/inside)
│   │   • Upgrading formats (* → **)
│   │   • Downgrading formats (** → *)
│   │   • Invalid delimiter handling
│   │
│   ├── block-editing.spec.ts
│   │   • Heading prefix editing (# → ##)
│   │   • Blockquote prefix editing
│   │   • List marker editing
│   │   • Cursor preservation during block transforms
│   │
│   └── breaking-delimiters.spec.ts
│       • Existing: Issue #10 - typing delimiters in middle
│       • Pattern breaking and re-detection
│       • Rogue delimiter scenarios
│
├── activation/
│   ├── detection.spec.ts
│   │   • Issue #34: Edge sibling detection
│   │   • Adjacent node focusing
│   │   • Prioritizing child over parent at edge
│   │   • When marks should appear
│   │
│   └── suppression.spec.ts
│       • skipNextFocusMarks behavior
│       • Marks not shown after transformations
│       • Manual unfocus/eject scenarios
│
├── pattern-detection/
│   ├── inline-patterns.spec.ts
│   │   • Bold, italic, code detection
│   │   • Nested pattern matching
│   │   • Invalid pattern unwrapping (issue #9)
│   │
│   └── block-patterns.spec.ts
│       • Heading detection
│       • Blockquote detection
│       • List detection
│
└── TEST-INDEX.md
    • Maps test categories to file locations
    • Lists related issues for each category
    • Quick reference for finding tests
```

### Benefits
1. **Clear mental model:** Tests organized by behavior, not by how bugs were discovered
2. **Easy to navigate:** "Where do I add a caret test?" → `caret-positioning/`
3. **Issue tracking preserved:** TEST-INDEX.md maps issues to test locations
4. **Gradual migration:** Can move files incrementally without breaking CI
5. **Simple reference:** Single document to find any test or issue

---

## Test Index Document

**`tests/e2e/focus-marks/TEST-INDEX.md`:**

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
| └─ Breaking Delimiters | `delimiter-editing/breaking-delimiters.spec.ts` | Typing delimiters in middle, pattern breaking | #10 |
| **Activation** | | | |
| └─ Detection | `activation/detection.spec.ts` | Edge sibling detection, when marks appear | #34 |
| └─ Suppression | `activation/suppression.spec.ts` | skipNextFocusMarks behavior, manual unfocus | - |
| **Pattern Detection** | | | |
| └─ Inline Patterns | `pattern-detection/inline-patterns.spec.ts` | Bold, italic, code, nested patterns | #9 |
| └─ Block Patterns | `pattern-detection/block-patterns.spec.ts` | Heading, blockquote, list detection | - |

### Finding Tests by Issue Number

| Issue | Description | Location |
|-------|-------------|----------|
| #5 | Caret position stability with setCaretAtEnd | `caret-positioning/transformation.spec.ts` |
| #6 | Focus spans not lost after transformation | `activation/suppression.spec.ts` |
| #9 | Invalid delimiter unwrapping | `pattern-detection/inline-patterns.spec.ts` |
| #10 | Breaking delimiters in middle of formatted text | `delimiter-editing/breaking-delimiters.spec.ts` |
| #34 | Edge sibling detection | `activation/detection.spec.ts` |
| #71 | Caret correction logic (inside vs outside) | `caret-positioning/editing.spec.ts` |
| #81 | Navigation correction to end of element | `caret-positioning/navigation.spec.ts` |

---

---

## Final Status (2026-02-06)

### ✅ All Phases Completed

**Phase 1: New directory structure created**
- Created folders: `caret-positioning/`, `delimiter-editing/`, `activation/`, `pattern-detection/`
- Created `TEST-INDEX.md` for documentation
- Created `RESULTS.md` for test status tracking

**Phase 2: All tests migrated (10/10 files)**

*Simple moves (6 files):*
- ✅ `caret-style-persistence.spec.ts` → `caret-positioning/style-persistence.spec.ts`
- ✅ `caret-boundary-position.spec.ts` → `caret-positioning/navigation.spec.ts`
- ✅ `block-delimiter-editing.spec.ts` → `delimiter-editing/block-editing.spec.ts`
- ✅ `breaking-delimiters.spec.ts` → `delimiter-editing/breaking-delimiters.spec.ts`
- ✅ `nested-transformations.spec.ts` → `pattern-detection/inline-patterns.spec.ts`
- ✅ `span-persistence.spec.ts` → `activation/span-persistence.spec.ts`

*Complex splits (4 files):*
- ✅ `activation.spec.ts` (407 lines) → split into `detection.spec.ts` + `suppression.spec.ts`
- ✅ `span-mirroring.spec.ts` (1126 lines) → split into `inline-mirroring.spec.ts` + `editing.spec.ts`
- ✅ `regression.spec.ts` (514 lines) → split by category into 3 files
- ✅ `editing.spec.ts` (187 lines) → merged into `inline-mirroring.spec.ts`

**Phase 3: Cleanup**
- ✅ All original files removed from root
- ✅ TEST-INDEX.md updated with final mappings
- ✅ All tests verified passing in new locations
- ✅ Git history preserved

### 📊 Final Results
- **Before:** 10 files in root directory (avg 380 lines, max 1126)
- **After:** 11 files across 4 behavior categories (max 407 lines)
  - activation/ (3 files)
  - caret-positioning/ (4 files)
  - delimiter-editing/ (3 files)
  - pattern-detection/ (1 file)
- All tests passing (same pass rate as before)
- CI green
- Documentation complete

---

## Migration Strategy

### Phase 1: Create New Structure (Low Risk)
1. Create new directory structure
2. Create `TEST-INDEX.md` with initial mappings
3. Don't move files yet, just set up folders
4. Add new tests to new structure

### Phase 2: Move Tests Incrementally (Medium Risk)
1. Start with `caret-positioning/` folder
   - Extract issue #71 tests from `span-mirroring.spec.ts` → `caret-positioning/editing.spec.ts`
   - Move `caret-boundary-position.spec.ts` content → `caret-positioning/navigation.spec.ts`
   - Keep `caret-style-persistence.spec.ts` as-is, just move location

2. Continue with `delimiter-editing/` folder
   - Extract mirroring tests from `span-mirroring.spec.ts` → `inline-mirroring.spec.ts`
   - Keep `block-delimiter-editing.spec.ts` as-is, just move

3. Move `activation/` tests
4. Move `pattern-detection/` tests

### Phase 3: Cleanup (Low Risk)
1. Remove empty/deprecated test files
2. Update `TEST-INDEX.md` with final mappings
3. Update test runner configs if needed
4. Update documentation references

---

## Test File Mapping

### Current → Proposed

| Current File | Lines | Move To |
|-------------|-------|---------|
| `rich-editor-caret-position.spec.ts` | 421 | `caret-positioning/transformation.spec.ts` |
| `caret-boundary-position.spec.ts` | 310 | `caret-positioning/navigation.spec.ts` |
| `caret-style-persistence.spec.ts` | 166 | `caret-positioning/style-persistence.spec.ts` |
| `span-mirroring.spec.ts` (lines 999-1124) | ~125 | `caret-positioning/editing.spec.ts` (issue #71) |
| `span-mirroring.spec.ts` (rest) | ~1000 | `delimiter-editing/inline-mirroring.spec.ts` |
| `block-delimiter-editing.spec.ts` | 320 | `delimiter-editing/block-editing.spec.ts` |
| `activation.spec.ts` | 407 | `activation/detection.spec.ts` + `suppression.spec.ts` |
| `regression.spec.ts` (issue #5) | ~100 | `regression/issue-05-caret-stability.spec.ts` |
| `regression.spec.ts` (issue #6) | ~80 | `regression/issue-06-focus-span-loss.spec.ts` |
| `regression.spec.ts` (issue #9) | ~200 | `regression/issue-09-invalid-delimiter-unwrap.spec.ts` |
| `breaking-delimiters.spec.ts` | 409 | `delimiter-editing/breaking-delimiters.spec.ts` |
| `editing.spec.ts` | 187 | Merge into appropriate folders |
| `nested-transformations.spec.ts` | 236 | `pattern-detection/inline-patterns.spec.ts` |

---

## Key Principles

1. **Test by behavior, not by bug:** Organize around what the system should do, not how it broke
2. **Issue references preserved:** Use inline comments in tests (e.g., `// REGRESSION: Issue #71`) and maintain TEST-INDEX.md
3. **Descriptive names:** File names should clearly indicate what's being tested
4. **Avoid duplication:** Related tests should be co-located
5. **Easy to find:** Developer should know where to add new test without documentation

### Example: Referencing Issues in Tests

```typescript
// caret-positioning/editing.spec.ts

describe('Caret position during delimiter edits', () => {

  // REGRESSION: Issue #71 - Typing * at end should stay outside
  test('typing delimiter at end keeps caret outside formatted text', () => {
    // test code...
  });

  // REGRESSION: Issue #71 - Backspace from inside should stay inside
  test('backspace from inside keeps caret inside formatted text', () => {
    // test code...
  });

  test('caret preserved during unwrap operation', () => {
    // test code (not related to a specific issue)
  });
});
```

---

## Risks & Mitigations

### Risk: Breaking test runs during migration
**Mitigation:** Move incrementally, keep CI green at each step

### Risk: Losing git history
**Mitigation:** Use `git mv` to preserve file history, document moves in commit messages

### Risk: Test conflicts in active development
**Mitigation:** Coordinate with team, do migration during quiet period or in separate branch

### Risk: Missing tests during migration
**Mitigation:** Run full test suite before/after each phase, verify test count matches

---

## Success Metrics

- [ ] All caret tests in `caret-positioning/` folder
- [ ] All delimiter editing tests in `delimiter-editing/` folder
- [ ] `TEST-INDEX.md` is complete and accurate
- [ ] All issue numbers referenced in test comments and index
- [ ] No test file over 500 lines (current max: 1126)
- [ ] All tests passing after migration
- [ ] New developers can find relevant tests in < 30 seconds

---

## Next Steps

1. **Short term:** Add new caret correction tests to most appropriate existing file
2. **Medium term:** Create new folder structure and start moving tests
3. **Long term:** Complete migration and update documentation

---

## Related Issues

- Issue #71: Caret positioning in edge delimiter handling
- Issue #81: Caret correction when navigating to end of formatted element
- Issue #5: Caret position stability with setCaretAtEnd
- Issue #6: Focus spans not lost after pattern transformation
- Issue #9: Invalid delimiter unwrapping
- Issue #10: Breaking delimiters
- Issue #34: Edge sibling detection

---

## Notes

- This refactor is **cosmetic** - no test logic changes, just reorganization
- Can be done incrementally without disrupting development
- Will make it significantly easier to maintain and extend tests
- Consider doing this before adding many more tests to avoid even more complexity