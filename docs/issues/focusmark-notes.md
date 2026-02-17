- ~~make the (last) span edit that result in reformatting/new pattern undoable. i.e. coalesce/save history~~ history needs to have a better entry right before formatting in any condition

### focus mark issues

- issue#67: caret before marks and del deletes all of them if delimiter length > 1 ✅
- issue#3: deleting from the end doesn't restore caret properly ✅
- issue#3.2: causing consecutive input/backspace to apply somewhere else ✅
- issue#5: setCaretAfter fails for new patterns inside activeElement ✅
  > fixed with setCaretAtEnd
- issue#6: focus spans lost after pattern transformation inside active inline element ✅
  > fixed by extracting spans before transformation and reinjecting after
- issue#10: adding same delimiters in the middle doesn't break and match the first half ✅

- ~~issue#11: deleting into a non-pattern (\~~ => ~) doesn't mirror 1 nor 2 backspaces~~
  > todo: make the default `<del>` a single ~ not ~~ in our pipeline ✅
  
  > ~~deleting one char from multi-char delimiter spans (like \~~) creates invalid pattern causing spans to disconnect before mirroring, leaving orphaned delimiter chars requiring manual deletion~~
  
  > onInput system needs normal overall pattern checks even if nothing in the activeInline prompts update (why?)

- Issue#9: spans don't unwrap as simple text when delimiters become invalid
  > correct reparsing and delimiter unfocusing/focusing happens; this may cause
  > repetitive nesting of identical formats but it works correct semantically

- issue#7: typing delimiters (like * => **) doesn't update format if the caret was right after/before the opening/closing delimter. This is an issue of being typed inside vs right beside a span ✅
  > also, typing after the closing mark probably escaped with marks system

- issue#7.1:adding delimiters to change format causes caret to get to the end of block, because caret before marks types marks outside of it ✅
  > if there's an activeInline that is activated because we are at the edge of/right outside; also make any new input that is a valid delimeter go inside of to trigger a proper edit

- issue#81: when focus marks appear due to caret from the right to the end of formattedElement, the caret must be outside and not inside the spans (caret at HOME behaves correctly due to edge sibling detection). ✅
  > when a user focuses the approches the right side of the element, from the right, by keyboard (mouse click works correctly) the caret goes inside `**bold|**` instead of correctly outside `**bold**|`

- ~~issue#12: selecting multiple dels and typing doesn't mirror~~ (works actually)

- ~~issue#8: (smartReplaceChildren) undo last transform => input pattern again => error range not found [transform.ts:70](/src/lib/core/transforms/transform.ts#L70)~~

- issue#343: Cannot read properties of null (reading 'childNodes') [richEditorState.svelte.ts:246](/src/lib/svelte/richEditorState.svelte.ts#L246)

- issue#71: mirroring end span to start span can displace caret due to offset increase ✅
  > was: `**bold*|*` => backspace => correct caret logic, but then the last step of inline mark injection causes what should be `*bold|*` to be `*bold*|`
  > wip: `**bold**|` => backspace => correct caret logic, but then the last step of inline mark injection causes what should be `*bold*|` to be `*bold|*`
  > now: handled both

- issue#71.1: adding a * at `*make bold*|` mirrors and transforms correctly, but moves the caret inside to the start of the end span ✅ 

- ~~issue#72: typing between delimiters causes odd behavior, caret moves to end, separeated delimiter disappears~~

- issue#73: typing a * to the inside of end span like `*make bold|*` isn't triggered as a focus span edit ✅

- issue#74: emptying a focused element and then typing sometimes repeats/doubles both delimiters (nested tags in dom and also a random <format> tag) ✅
  > reason: typing after first span doesn't trigger marks escape system for formatted elements
  > fix: handle `after-opening` as in span-edge editing cases

- issue#75: typing between delimiters is unpredictable esp if empty and the focus marks get hidden if caret is in the middle as pattern matches ✅
  > reason: invalid delimiter edits didn't trigger a porper reparse
  > added `invalidChanges` by refactoring `checkAndMirrorSpans`; to be handled as a span edit and not a nestedPattern in handleActiveInlineChange

- issue#76: fix caret offset when typing after open span istead of `setCaretAtEnd` ✅
  > used new `setCaretAt` with offset

- issue#77: consecutive similar formatted elements causes caret them to jump to one of them on new similar pattern before them ✅
  > fixed and refactored smartReplace; isEqual handling

- issue#78: typing between inline delimiters `*|*word**` causes random behavior on reparse ✅
  > flatten spans that become invalid before reparsing

- issue#78.1: (minor issue with unwrapAndReparseInline) there's a mismatch between the transform pipeline and how findFirstMarkdownMatch works becuase the pipleine is commonmark compliant and findFirstMarkdownMatch is greedy (e.g. `*|*bold**` => `**|*bold**` input acts differently in reparse than what findFirstMarkdownMatch recognizes) which affect caret recovery in smartReplace ⏳

- issue78.2: dispcrepancy between new findFirstMdMatch and findFirstMarkdownMatch ⏳
  > main issue lies in transform.ts call. The old had a `preventNesting` guard but the new one does natural premature transforms on \*\*bold\* to \**bold*
  > also, adding a final * trasform to **bold** correctly for asteriks, but fails for underscores because ast-utils can only back-track to asterisks on round conversions

- issue#79: nested inline delmiiter inputs OR new transforms move caret to the end of (inline) parent esp. on more than one nested additions

- issue#80: new findFirstMdMatch realtime updates causing comptability issues with `onInlineBreakingEdits` 
 fixed injectInlineMarks preservation logic, removed `skipCaretCorrection`, and made `onInlineBreakingEdits` by also reparsing whole block ✅

- issue#81: mirroring leaves behind stray dels. Adding * to `**em*|` mirrors but leaves (doesn't consume) behind surrounding * (first char in this ex.)

#### Blocks

1. caret restoration ignores delimiter length ✅
  > restores to correct offset
11. when there is content, typing a header pattern (as a prefix) moves the curosr to the end of the content/block ✅
2. Uncaught (in promise) TypeError: cleanBlock.querySelectorAll is not a function
    at findAndTransform (transform.ts:42:13)
    at HTMLDivElement.onInput (richEditorState.svelte.ts:205:7)
3. deleting all block marks converts content to text and MERGES with previous P block ✅
31. changing block format (ex h1=>h2) removes all inline formats ✅
32. block delimiters don't normalize but disappear if pattern becomes invalid ✅
33. onBefore does something that makes the first character after an inline transform make the H block element a P
4. blockquote focus mark shows on its on line when focused `<blockquote><span><p> ...`
5. codeblock marks never show
6. lists make no sense at all; can the native psuedo li marker be editable
7. updating span to transform between h types (e.g. # to ##) falsely restores caret to end of block ✅
  > (actually) correct caret restore
8. sometimes #'s also appear (duplicate) in the header content when pattern should become valid/invalid ✅
9. trailing `\` on udpated header patterns ✅
  > issue tracked down to be failure of first input into a header to remove BR tag like default browser behavior due to handleBlockMarkEdges override
  > fixed with one line (702) in the fncs but left other tries commented out for now
10. inline transform in a header hides active block marks then on further input/typing unwraps the whole h to a p element ✅
11. block mark edits non responsive after a new inline pattern ✅
12. deleting block focus spans to be invalid dones't properly flatten h into p ✅
  > handled invalid spans without unwrapAndReparseBlock to prevent leftover preceding space collapse due to md pipeleine
13. undo/redo destroy blockSpanRefs and injectBlockMarks fails to restore/reassign them due to early return ✅ (in prev commit)

### later
- encapsulate logic by reworking and calling `focus-mark-manager.ts` in main onInput ✅
- clicking/focusing on a list item should focus the end not the focus span
- must hide and override default LI html marker; bad UX when md FocusMarks delimiter is also displayed
- unaddressed: nesting identical tags unintentionally (makes nested stronger tags bolder)
- auto insert closing inline delimeters to the end of the current sentence/block until the user closes them
- escape support with backslash e.g. `\*not italic*` (possible hide/show like focus marks)

## Tests
see [focusmark-test-results](./focusmark-test-results.md)

## Editor General
[this](/docs/issues/mixed-delimeters.md) issue works in paste but NOT in regular typing

## 🧱s

- typing a rogue delimiter like "**bold`*|` and *italic***" causes unexpected commonmark spec [behavior](./commonmark-breaking-spec.md)
