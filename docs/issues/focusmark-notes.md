- ~~make the (last) span edit that result in reformatting/new pattern undoable. i.e. coalesce/save history~~ history needs to have a better entry right before formatting in any condition

### focus mark issues

- adding delimiters to change format causes caret to get to the end of block, because caret before marks types marks outside of it (+test)
  > if there's an activeInline that is activated because we are at the edge of/right outside; also make any new input that is a valid delimeter go inside of to trigger a proper edit
- issue#67: caret before marks and del deletes all of them if delimiter length > 1 ✅
- issue#3: deleting from the end doesn't restore caret properly ✅
- issue#3.2: causing consecutive input/backspace to apply somewhere else ✅
- issue#5: setCaretAfter fails for new patterns inside activeElement ✅
  > fixed with setCaretAtEnd
- issue#6: focus spans lost after pattern transformation inside active inline element ✅
  > fixed by extracting spans before transformation and reinjecting after
- **MAJOR** issue#10: adding same delimiters in the middle doesn't break and match the first half (+test)
  > also, typing a rogue delimiter like "**bold`*|` and *italic***" causes unexpected commonmark spec [behavior](./commonmark-breaking-spec.md)
- issue#11: deleting into a non-pattern (~~ => ~) doesn't mirror 1 nor 2 backspaces ⏳
  > todo: make the default <del> a single ~ not ~~ in our pipeline ✅
  > deleting one char from multi-char delimiter spans (like ~~) creates invalid pattern causing spans to disconnect before
   mirroring, leaving orphaned delimiter chars requiring manual deletion
  > onInput system needs normal overall pattern checks even if nothing in the activeInline prompts update
- Issue#9: spans don't unwrap as simple text when delimiters become invalid (+test)
- issue#7: typing delimiters (like * => **) doesn't update format if the caret was right after/before the opening/closing delimter. This is an issue of being typed inside vs right beside a span ⏳
  > also, typing after the closing mark probably escaped with marks system
- issue#12: selecting multiple dels and typing doesn't mirror 
- issue#8: (smartReplaceChildren) undo last transform => input pattern again => error range not found [transform.ts:70](/src/lib/core/transforms/transform.ts#L70)
- issue#343: Cannot read properties of null (reading 'childNodes') [richEditorState.svelte.ts:246](/src/lib/svelte/richEditorState.svelte.ts#L246)

### later
- encapsulate logic by reworking and calling `focus-mark-manager.ts` in main onInput
- clicking/focusing on a list item should focus the end not the focus span
- must hide and override default LI html marker; bad UX when md FocusMarks delimiter is also displayed
- unaddressed: nesting identical tags unintentionally (makes nested stronger tags bolder)
- auto insert closing inline delimeters to the end of the current sentence/block until the user closes them

## Tests
see [focusmark-test-results](./focusmark-test-results.md)
