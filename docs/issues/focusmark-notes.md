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

- issue#78.1: (minor issue with unwrapAndReparseInline) there's a mismatch between the transform pipeline and how findFirstMarkdownMatch works becuase the pipleine is commonmark compliant and findFirstMarkdownMatch is greedy (e.g. `*|*bold**` => `**|*bold**` input acts differently in reparse than what findFirstMarkdownMatch recognizes) which affect caret recovery in smartReplace ✅
  > findFirstMdMatch

- issue78.2: dispcrepancy between new findFirstMdMatch and findFirstMarkdownMatch ⏳
  > main issue lies in transform.ts call. The old had a `preventNesting` guard but the new one does natural premature transforms on \*\*bold\* to \**bold*
  > also, adding a final * trasform to **bold** correctly for asteriks, but fails for underscores because ast-utils can only back-track to asterisks on round conversions

- issue#79: nested inline delmiiter inputs OR new transforms move caret to the end of (inline) parent esp. on more than one nested additions ✅ (issue+3 related)

- issue#80: new findFirstMdMatch realtime updates causing comptability issues with `onInlineBreakingEdits` 
 fixed injectInlineMarks preservation logic, removed `skipCaretCorrection`, ~~and made `onInlineBreakingEdits` by also reparsing whole block~~ ✅

- issue#80.1: `findFirstMdMatch` causes intermediary breaking edits to a formatted element. `**bo*ld**` matches italic, but that is intrusive and unintiuitive. ✅
  > restored `findFirstMarkdownMatch` match as a special case in `onInlineBreakingEdits`
  > preference to custom matching in some cases over findFirstMdMatch commanmark's strict appoach
  
- issue#80.2: according to regression testing, more tests still pass in `tests\e2e\rich-editor-inline-patterns.spec.ts` if the whole call to onInlineBreakingEdits is removed in handleFocusedInline

- issue#81: mirroring leaves behind stray dels. Adding * to `**em*|` mirrors but leaves (doesn't consume) behind surrounding * (first char in this ex.) ⏳
  > implemented hasAdjacentDelimiterChar (to be revised)

- issue#82: smartReplaceChildren misses precise caret restore if: no pattern arg was provided but there's a pattern between a new delimiter and a span delimiter (spans get auto moved, but new delimiter offset identification is missed due to pattern arg absense) ✅
  > meaning: For `onInlineBreakingEdits`, all spans must be flattened and a match must be passed (?)
  > fixed with spansAreTheMatch else bracket (stale span handling)

- issue+3: adding a breaking and earlier closing delimiter wrongly moves the caret back. i.e typing \* here: `*ok| ok*` places the caret after the first 'o' ✅

- issue#83: subsequent delimiters are ignored even if they could match a larger pattern because clean clones are used to process matches and/or spans are not counted because they're unfocused
  > major strategy is needed to flaten then compare then transform only if structure changes.

- issue#84: space input at start of block and before a focused formatted element mishaves `|*text*` ✅
  > handleInlineMarkEdges has no escape for position='before' + non-delimiter (this is cus browser normally anchors node that preceeds caret; but it assumed there is one)

- issue#85: new pattern that takes focus from outer focus-span-bearing patterns can miss on new outer patterns due to delimiter reallocation. ✅
  > added `findAndTransform` to the end of `unwrapandReparseInline` to catch outer patterns

- issue#86: correct to end issue needs revist, adding an opening * to create a new pattern moves the caret before the * ✅

- issue#86.1: holistic #86 fix still allows `onInlineBreakingPatterns` to false place caret to before new open span
  > onInlineBreakingEdits => unwrapAndReparseInline doesn't have the mechanism of onInput => findAndTransform => restore returned clean caret offset
  > if onInlineBreakingEdits is disabled, the flow down to findAndTransform doesn't detect a new md pattern with `*old *|new*` because it removes spans before parsing. New should now be `*new*` and the first \* becomes unamtched.
  > findFirstMarkdownMatch doesn't trigger the pattern mentioned above because it prios first and nearest occurence matches (anti-pattern to utils) i.e. matches `*old *` instead of `*new*`

- issue#86.0: prevent '*' matching as List node without a space
  > this was needed because a fix invovling transform.ts is explored to make it central for new patterns AND breaking changes (to formattedNodes) to be handled, which caused matching anything outside even hasBlockPattern and hasInlinePattern scope (becoming true for hasFormattedNodeChanges)
  > the #86 fix is true but sensitive to TRUE COMMONMARK:
  - `*` becomes a LIST immediately (without space) [commit: c564208a14fa977c561aa57779a9e720d467f328] ✅
  -  `***` becomes divider block

- issue#86.2: when focusAndTransform handles breaking edits; the caret restore mismatches because folded delimiters may re-emerge as unmatched regular text, causing returned caretoffset to miss by its length

- issue#86.3: #86 fix
  > `hasFormattedNodeChanges` gives false positives due to length check `elementNodes.length !== fragmentNodes.length` Fixed ✅

#### findFirstMd regression

- BUG-2: [current blockage]: issue+4
  > block level reparse after any new pattern needed
  > partially addressed in `9922821fbc0e60bce327761584c319c9cf7d8ad0`
  > prob partially addressed in issue+3

- BUG-1: fixed with `findFirstMdMatchForTransform` --- may not be needed after data-delimiter is implemented because it would differentiate \* and \_ and cache them in input form

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

## BUG-2 cali verbose

 BUG-2: Caret lands inside the closing focus span after a nested transform

  Scenario: User types *italic text* → <em>, then navigates inside and types **b**.

  What should happen

  After **b** transforms, the caret should sit after <strong>, inside <em>, so the next typed character lands there:
  <em>italic <strong>b</strong>|text</em>

  What actually happens — step by step

  1. findAndTransform fires correctly.
  smartReplaceChildren reconciles <em>italic **b**text</em> → <em>italic <strong>b</strong>text</em>. It calculates
  adjusted offset = 8 and calls setCaretAt(<em>, 8), which places the caret at the end of the b text node inside
  <strong>. Caret is correct at this point.

  2. handleSelectionChange fires.
  findFocusedInline returns <strong> (caret is inside it). this.activeInline was the old (now disconnected) <em>, so a
  transition fires → injectInlineMarks(<strong>).

  3. injectInlineMarks calls setCaretAtEnd(<strong>) with atEnd=true.
  Before calling, it appends the closing <span class="pd-focus-mark">**</span> to <strong>. The structure is now:
  <strong><span>**</span>b<span>**</span></strong>
                                ↑ lastChild
  getLastTextDescendant(<strong>) unconditionally recurses into lastChild — the closing span — then into its text "**".
  So the caret lands inside "**", not after <strong>.

  The culprit is this commented-out guard in selection.ts:19-21:
  // &&
  // CONTAINER_ONLY_TAGS.includes((node as Element).tagName as any)
  Without it, getLastTextDescendant descends into any element's last child, including focus spans.

  4. User types x — goes into the closing focus span.
  ** becomes **x. handleSpanEdit fires → checkAndMirrorSpans mirrors **x to the opening span → unwrapAndReparseInline is
   triggered. The reparse serializes the corrupted <strong> and rebuilds the whole block. The "text" suffix after
  <strong> inside <em> is lost (or <em> collapses) during the rebuild.

  Result: <em> ends up containing only "italic b" — the "text" part is gone, and x is missing from <em> entirely. The
  second **b** (in inline:207) fails the same way: after the first inner bold is transformed, the caret goes into the
  wrong place and the second bold either misfires or lands outside <em>.
