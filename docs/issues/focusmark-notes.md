- focus spans must mirror one/another's edits (must be identical) for inline els ✅
- backspacing on `**bold**..` makes the marker go after b `*b|old..`
- onSelection must mark to escape focusMarks like it did formatted elements ✅
- newly typed formatted nodes must not show (skip) their focusMarks initially ✅

### caret
- focusMarks must show if editing spans causes re-render, but caret ends up just before/after new formatted element; losing focus/focusmarks (wip) ⏳
- editing inside spans must not mirror if NEW input && input is not supported md mark ✅
- when formatting a new element by typing the last delimiter at the word beginning `|italic*` the caret jumps forward by delimiter length (after i in this ex)

- encapsulate logic by reworking and calling `focus-mark-manager.ts` in main onInput
- clicking/focusing on a list item should focus the end not the focus span
- must hide and override default LI html marker; bad UX when md FocusMarks delimiter is also displayed