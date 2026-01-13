- focus spans must mirror one/another's edits (must be identical) for inline els ✅
- backspacing on `**|bold**..` makes the marker go after b `*b|old..` ✅
- onSelection must mark to escape focusMarks like it did formatted elements ✅
- newly typed formatted nodes must not show (skip) their focusMarks initially ✅
- ~~make the (last) span edit that result in reformatting/new pattern undoable. i.e. coalesce/save history~~

### caret
- focusMarks must show if editing spans causes re-render, but caret ends up just before/after new formatted element; losing focus/focusmarks (wip) ⏳ [focus-mark-manager.ts:120](../../src/lib/core/utils/focus-mark-manager.ts#L120)
- editing inside spans must not mirror if NEW input && input is not supported md mark ✅
- when formatting a new element by typing the last delimiter at the word beginning `|italic*` the caret jumps forward by delimiter length (after i in this ex) ✅ [dom.ts#600]
- MASSIVE ISSUE: returning ejected tag is due to range.insertNode going inside the tag (not removed because the focusMarks still EXIST inside IT)
> focusSpans must be removed with the parent, and caret will be lost
> preserve last caret in a focusSpan with onSelection (but onInput selection is different and onSelection will run again right after onInput)
1. get caret position (in anchored FocusMark) in oninput before parent ejection, then restore it after deformatting
  > if (one of them) disconnected thus losing caret anchor, restore caret to its place (right/left)
2. OR create a fragment with the parent ejected AND the focusmarks then use smartReplace
  > proposal: instead of 
    range.deleteContents() 
    range.insertNode(fragment)
    use smartReplaceChildren and set the correct parameters
    > smartReplace will still remove the entirety of the parent tag, 
    > but attempts to restore cursor to its repalcement children
    > However, the function is expecting pattern object, but we don't want to match a new pattern
    > we need to adjust the function to be flexible in that regard if needed

### later
- encapsulate logic by reworking and calling `focus-mark-manager.ts` in main onInput
- clicking/focusing on a list item should focus the end not the focus span
- must hide and override default LI html marker; bad UX when md FocusMarks delimiter is also displayed

## Test stats

 focus-mark-activation.spec.ts: 8/14 passed (57%)
  - ✅ Passing (8):
    - Element directly after/before cursor in adjacent nodes (2 tests)
    - Basic activation when clicking inside formatted elements
    - Hiding marks when clicking outside
    - Different marks for different element types
    - Not showing marks on newly created elements
    - Block elements (headings, blockquotes)
  - ❌ Failing (6):
    - Nested element detection - marks not in correct element (2 tests)
    - Delimiter syntax preservation (_ vs *, __ vs **) (2 tests)
    - Transition marks between nested elements
    - List items showing * instead of -

  focus-mark-editing.spec.ts: 9/18 passed (50%)
  - ✅ Passing (9):
    - Change bold to italic by editing opening delimiter
    - Unwrap completely when deleting all delimiters
    - Preserve cursor position during unwrap (2 tests)
    - Handle strikethrough delimiter editing
    - Complex edit creating italic with different content
    - Mirror opening span to closing (3 tests)
  - ❌ Failing (9):
    - Typing non-delimiter chars inside focus mark span
    - Keep mismatched delimiters as plain text
    - Mirror closing span edits (4 tests)
    - Complex text replacements (2 tests)
    - Underscore delimiter variants

  Total: 17/32 passed (53%)

  Main Issues:
  1. issue#34 not fully working - Adjacent node detection works in some cases but nested element prioritization fails
  2. Delimiter syntax not preserved - Shows ** instead of __, * instead of _
  3. Closing span mirroring issues - Edits to closing spans not properly mirrored
  4. Complex editing scenarios - Character-by-character typing and text replacements failing